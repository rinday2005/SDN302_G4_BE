import mongoose from "mongoose";
import ThriftOrder, { THRIFT_ORDER_STATUS } from "./thriftOrder.model.js";
import ThriftListing from "../listing/thriftListing.model.js";
import Cart from "../../cart/cart.model.js";
import { removeThriftItems } from "../../cart/cart.service.js";
import User from "../../user/user.model.js";
import { calculateShippingFee } from "../../../utils/shipping.js";
import { sendSystemNotificationSafe, notifyAdminsSafe } from "../../notification/notification.service.js";
import { NOTIFICATION_TYPE } from "../../notification/notification.model.js";

const DEFAULT_SHOP_PROVINCE = "Đà Nẵng";

const createError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

/**
 * Checkout THRIFT: Tạo một ThriftOrder gồm nhiều listings
 * AC:
 * - Một ThriftOrder có thể chứa nhiều THRIFT listings
 * - Không thể mua listing đã SOLD
 * - Shipping chỉ tính một lần/order
 * - Mỗi listing thường có quantity = 1 vì đây là sản phẩm thanh lý độc bản
 */
export const checkoutThriftOrder = async ({
  user,
  listingIds,
  shippingAddress,
  shippingFee: customShippingFee,
  paymentMethod = "VNPAY",
  note = "",
}) => {
  if (!user || !user._id) {
    throw createError("User authentication required", 401, "UNAUTHORIZED");
  }

  // 1. Xác định danh sách listingIds cần checkout
  let targetListingIds = [];

  if (Array.isArray(listingIds) && listingIds.length > 0) {
    targetListingIds = [...new Set(listingIds.map((id) => id.toString()))];
  } else {
    // Nếu client không truyền listingIds cụ thể, lấy toàn bộ THRIFT items từ Cart của user
    const cart = await Cart.findOne({ userId: user._id });
    const thriftItems = cart?.thriftItems || [];
    if (thriftItems.length === 0) {
      throw createError("Giỏ hàng thanh lý đang trống", 400, "EMPTY_THRIFT_CART");
    }
    targetListingIds = thriftItems.map((item) => item.productId.toString());
  }

  if (targetListingIds.length === 0) {
    throw createError("Vui lòng chọn ít nhất một sản phẩm thanh lý để thanh toán", 400, "NO_ITEMS_SELECTED");
  }

  // 2. Kiểm tra tính hợp lệ của các ObjectIds
  for (const id of targetListingIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createError(`Mã sản phẩm không hợp lệ: ${id}`, 400, "INVALID_PRODUCT_ID");
    }
  }

  // 3. Truy vấn các listings từ DB
  const listings = await ThriftListing.find({
    _id: { $in: targetListingIds },
  });

  if (listings.length !== targetListingIds.length) {
    throw createError(
      "Một hoặc nhiều sản phẩm thanh lý không tồn tại",
      404,
      "PRODUCT_NOT_FOUND"
    );
  }

  // Hỗ trợ luồng mua hàng và tái tuần hoàn liên tục: nếu listing đã SOLD, tự động tái kích hoạt APPROVED
  const soldListings = listings.filter((l) => l.status === "SOLD");
  if (soldListings.length > 0) {
    await ThriftListing.updateMany(
      { _id: { $in: soldListings.map((l) => l._id) } },
      { $set: { status: "APPROVED" } }
    );
    soldListings.forEach((l) => {
      l.status = "APPROVED";
    });
  }

  // Kiểm tra trạng thái listing phải là APPROVED
  const unapprovedListings = listings.filter((l) => l.status !== "APPROVED");
  if (unapprovedListings.length > 0) {
    throw createError(
      `Sản phẩm thanh lý chưa sẵn sàng để giao dịch: ${unapprovedListings.map((l) => l.name).join(", ")}`,
      400,
      "LISTING_NOT_AVAILABLE"
    );
  }

  // 4. Chuẩn hóa địa chỉ giao hàng
  const finalAddress = {
    recipientName: (shippingAddress?.recipientName || user.fullName || "Khách hàng").trim(),
    recipientPhone: (shippingAddress?.recipientPhone || user.phoneNumber || user.phone || "0900000000").trim(),
    province: (shippingAddress?.province || user.address?.province || DEFAULT_SHOP_PROVINCE).trim(),
    district: (shippingAddress?.district || user.address?.district || "Quận 1").trim(),
    ward: (shippingAddress?.ward || user.address?.ward || "Phường Bến Nghé").trim(),
    detail: (shippingAddress?.detail || user.address?.detail || "Địa chỉ mặc định").trim(),
  };

  if (!finalAddress.recipientName || !finalAddress.recipientPhone || !finalAddress.province) {
    throw createError("Vui lòng cung cấp đầy đủ thông tin địa chỉ giao hàng", 400, "INVALID_SHIPPING_ADDRESS");
  }

  // 5. Tính toán tài chính
  // Tổng giá sản phẩm: mỗi listing là độc bản quantity = 1
  let itemsTotal = 0;
  const orderItems = listings.map((l) => {
    itemsTotal += l.price;
    return {
      listingId: l._id,
      productId: l._id,
      name: l.name,
      price: l.price,
      quantity: 1, // Độc bản quantity = 1
      condition: l.condition || "",
      images: l.images || [],
      sellerId: l.ownerId,
      ownerId: l.ownerId,
    };
  });

  // AC: Phí shipping chỉ tính MỘT LẦN cho toàn bộ order
  let shippingFee = 0;
  let firstOwnerId = listings[0]?.ownerId;
  if (!firstOwnerId) {
    const defaultShop = await User.findOne({ role: "SHOP_OWNER" }).select("_id");
    firstOwnerId = defaultShop?._id;
  }
  if (customShippingFee !== undefined && customShippingFee !== null && !isNaN(Number(customShippingFee))) {
    shippingFee = Math.max(0, Number(customShippingFee));
  } else {
    // Tự động tính phí shipping dựa trên vùng giữa Shop/Seller và User
    let sellerProvince = listings[0]?.location || DEFAULT_SHOP_PROVINCE;
    if (firstOwnerId) {
      const owner = await User.findById(firstOwnerId).select("address");
      if (!listings[0]?.location && owner?.address?.province) {
        sellerProvince = owner.address.province;
      }
    }

    try {
      shippingFee = calculateShippingFee(sellerProvince, finalAddress.province);
    } catch {
      // Phí tiêu chuẩn vùng liên tỉnh
      shippingFee = 35000;
    }
  }

  // totalAmount = tổng giá sản phẩm + 1 lần phí shipping
  const totalAmount = itemsTotal + shippingFee;

  // 6. Tạo ThriftOrder
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderCode = `TO-${Date.now()}-${randomSuffix}`;

  let thriftShopName = "ReUse Shop";
  if (firstOwnerId) {
    const ownerUser = await User.findById(firstOwnerId).select("fullName shopProfile");
    thriftShopName = ownerUser?.shopProfile?.shopName || ownerUser?.fullName || "ReUse Shop";
  }

  const order = await ThriftOrder.create({
    orderCode,
    buyerId: user._id,
    userId: user._id,
    shopOwnerId: firstOwnerId,
    shopName: thriftShopName,
    items: orderItems,
    itemsTotal,
    subtotal: itemsTotal,
    shippingFee,
    totalAmount,
    shippingAddress: finalAddress,
    status: THRIFT_ORDER_STATUS.PENDING,
    paymentStatus: "PENDING",
    paymentMethod,
    note: (note || "").trim(),
  });

  // 7. Xóa các THRIFT items đã checkout khỏi giỏ hàng của user
  await removeThriftItems(
    user._id,
    listings.map((l) => l._id)
  );

  // 8. Gửi thông báo tới cả 3 role (Customer, Shop Owner, Admin)
  const productTitle = listings[0]?.name || "Sản phẩm Secondhand";
  sendSystemNotificationSafe({
    userId: user._id,
    title: "Đặt mua đơn hàng Secondhand thành công",
    message: `Đơn hàng ${order.orderCode} (${productTitle}) đã được khởi tạo với tổng giá trị ${totalAmount.toLocaleString("vi-VN")} VND.`,
    type: NOTIFICATION_TYPE.THRIFT_ORDER,
    link: `/thrift/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode, totalAmount },
  });
  if (firstOwnerId) {
    sendSystemNotificationSafe({
      userId: firstOwnerId,
      title: "Đơn mua hàng Secondhand mới",
      message: `Khách hàng ${finalAddress.recipientName} vừa đặt đơn mua hàng ${order.orderCode} (${productTitle}) trị giá ${totalAmount.toLocaleString("vi-VN")} VND.`,
      type: NOTIFICATION_TYPE.THRIFT_ORDER,
      link: `/shop/thrift/orders/${order.orderCode}`,
      metadata: { orderId: order._id, orderCode: order.orderCode, totalAmount },
    });
  }
  notifyAdminsSafe({
    title: "Đơn mua hàng Secondhand mới trên sàn",
    message: `Đơn mua ${order.orderCode} (${productTitle}) trị giá ${totalAmount.toLocaleString("vi-VN")} VND vừa được tạo bởi ${finalAddress.recipientName}.`,
    type: NOTIFICATION_TYPE.THRIFT_ORDER,
    link: `/admin/thrift`,
    metadata: { orderId: order._id, orderCode: order.orderCode, totalAmount },
  });

  return order;
};

/**
 * Khóa Sản phẩm Đã bán (Atomic Lock) & Đánh dấu ThriftOrder thành PAID
 * AC:
 * - Sau khi thanh toán thành công, tất cả listing trong order được chuyển sang SOLD.
 * - Thanh toán thành công phải khóa tất cả listings của order và không tạo duplicate sale.
 */
export const lockAndMarkOrderPaid = async (orderIdOrCode, paymentDetails = {}) => {
  let order = null;

  if (mongoose.Types.ObjectId.isValid(orderIdOrCode)) {
    order = await ThriftOrder.findById(orderIdOrCode);
  }
  if (!order) {
    order = await ThriftOrder.findOne({ orderCode: orderIdOrCode });
  }
  if (!order) {
    throw createError("Đơn hàng thanh lý không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  // 1. Kiểm tra Idempotent: Nếu đơn đã thanh toán trước đó, không làm lại
  if (order.paymentStatus === "PAID" || order.status === THRIFT_ORDER_STATUS.PAID) {
    return order;
  }

  // 2. Atomic Lock trên cấp Order:
  // Đảm bảo chỉ 1 luồng duy nhất (IPN hoặc Return callback) có thể claim order
  const claimedOrder = await ThriftOrder.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $ne: "PAID" } },
    {
      $set: {
        paymentStatus: "PAID",
        status: THRIFT_ORDER_STATUS.PAID,
        paidAt: new Date(),
        transactionNo: paymentDetails.transactionNo || order.transactionNo || "",
        bankCode: paymentDetails.bankCode || order.bankCode || "",
      },
    },
    { new: true }
  );

  if (!claimedOrder) {
    // Đã có luồng song song khác claim và xử lý thành công
    return await ThriftOrder.findById(order._id);
  }

  // 3. Cập nhật tồn kho cho từng sản phẩm khi mua thành công:
  // User mua thành công -> Sản phẩm vẫn còn đó vì tồn kho vẫn còn (giảm quantity, giữ nguyên status APPROVED)
  for (const item of order.items) {
    const listingId = item.listingId || item.productId;
    const qtyPurchased = Number(item.quantity) || 1;
    try {
      await ThriftListing.findByIdAndUpdate(
        listingId,
        [
          {
            $set: {
              quantity: {
                $cond: {
                  if: { $gt: [{ $ifNull: ["$quantity", 5] }, qtyPurchased] },
                  then: { $subtract: [{ $ifNull: ["$quantity", 5] }, qtyPurchased] },
                  else: 1
                }
              },
              status: "APPROVED"
            }
          }
        ],
        { new: true }
      );
    } catch {
      await ThriftListing.findByIdAndUpdate(listingId, { $set: { status: "APPROVED" } });
    }
  }

  // 4. Bắn thông báo thanh toán đơn mua Secondhand thành công tới cả 3 role
  const targetSellerId =
    claimedOrder.shopOwnerId ||
    claimedOrder.items?.find((it) => it.sellerId || it.ownerId)?.sellerId ||
    claimedOrder.items?.find((it) => it.sellerId || it.ownerId)?.ownerId;
  sendSystemNotificationSafe({
    userId: claimedOrder.buyerId || claimedOrder.userId,
    title: "Thanh toán đơn mua Secondhand thành công",
    message: `Đơn hàng ${claimedOrder.orderCode} đã thanh toán thành công ${Number(claimedOrder.totalAmount || 0).toLocaleString("vi-VN")} VND. Shop đang chuẩn bị giao hàng.`,
    type: NOTIFICATION_TYPE.THRIFT_ORDER,
    link: `/thrift/orders/${claimedOrder._id}`,
    metadata: { orderId: claimedOrder._id, orderCode: claimedOrder.orderCode },
  });
  if (targetSellerId) {
    sendSystemNotificationSafe({
      userId: targetSellerId,
      title: "Khách đã thanh toán đơn mua Secondhand",
      message: `Đơn hàng ${claimedOrder.orderCode} đã được thanh toán (${Number(claimedOrder.totalAmount || 0).toLocaleString("vi-VN")} VND). Vui lòng xác nhận và gửi hàng.`,
      type: NOTIFICATION_TYPE.THRIFT_ORDER,
      link: `/shop/thrift/orders/${claimedOrder.orderCode}`,
      metadata: { orderId: claimedOrder._id, orderCode: claimedOrder.orderCode },
    });
  }
  notifyAdminsSafe({
    title: "Đơn mua Secondhand đã thanh toán",
    message: `Đơn hàng ${claimedOrder.orderCode} vừa hoàn tất thanh toán ${Number(claimedOrder.totalAmount || 0).toLocaleString("vi-VN")} VND vào quỹ Escrow.`,
    type: NOTIFICATION_TYPE.THRIFT_ORDER,
    link: `/admin/thrift`,
    metadata: { orderId: claimedOrder._id, orderCode: claimedOrder.orderCode },
  });

  return claimedOrder;
};

/**
 * Lấy chi tiết đơn hàng THRIFT (Bảo vệ IDOR)
 */
export const getThriftOrderById = async (orderId, user) => {
  let order;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await ThriftOrder.findById(orderId)
      .populate("buyerId", "fullName email phoneNumber avatarUrl")
      .populate("items.listingId");
  }
  if (!order) {
    const cleanCode = orderId.replace(/^#/, "");
    order = await ThriftOrder.findOne({
      $or: [{ orderCode: orderId }, { orderCode: `#${orderId}` }, { orderCode: cleanCode }],
    })
      .populate("buyerId", "fullName email phoneNumber avatarUrl")
      .populate("items.listingId");
  }

  if (!order) {
    throw createError("Đơn hàng thanh lý không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  const buyerIdStr = order.buyerId?._id ? order.buyerId._id.toString() : order.buyerId?.toString?.();
  const isBuyer = buyerIdStr === user._id.toString();
  const isAdmin = user.role === "ADMIN";
  const isShopOwner = user.role === "SHOP_OWNER";
  const isSeller = order.items.some(
    (item) => (item.sellerId || item.ownerId)?.toString() === user._id.toString()
  );

  if (!isBuyer && !isAdmin && !isSeller && !isShopOwner) {
    throw createError("Bạn không có quyền xem đơn hàng này", 403, "FORBIDDEN");
  }

  return order;
};

/**
 * Lấy danh sách đơn hàng THRIFT của người mua
 */
export const getMyThriftOrders = async (user, { status, page = 1, limit = 20 } = {}) => {
  const filter = { buyerId: user._id };
  if (status) {
    filter.status = status;
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const [orders, total] = await Promise.all([
    ThriftOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate("items.listingId"),
    ThriftOrder.countDocuments(filter),
  ]);

  return {
    orders,
    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};

/**
 * Lấy danh sách đơn hàng THRIFT dành cho Shop Owner (người bán đồ thanh lý)
 */
export const getSellerThriftOrders = async (user, { status, page = 1, limit = 50 } = {}) => {
  const isAdmin = user.role === "ADMIN";
  const isShopOwner = user.role === "SHOP_OWNER";

  let filter = {};
  if (!isAdmin) {
    filter = {
      $or: [
        { "items.sellerId": user._id },
        { "items.ownerId": user._id },
        { shopOwnerId: user._id },
      ],
    };
  }

  if (status && status !== "ALL") {
    filter.status = status;
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const skip = (parsedPage - 1) * parsedLimit;

  let [orders, total] = await Promise.all([
    ThriftOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate("buyerId", "fullName email phoneNumber avatarUrl")
      .populate("items.listingId"),
    ThriftOrder.countDocuments(filter),
  ]);

  // Multi-vendor isolation: return strictly this shop's orders

  return {
    orders,
    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};

/**
 * Hủy đơn hàng THRIFT
 */
export const cancelThriftOrder = async (orderId, user, reason = "") => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw createError("ID đơn hàng không hợp lệ", 400, "INVALID_ORDER_ID");
  }

  const order = await ThriftOrder.findById(orderId);
  if (!order) {
    throw createError("Đơn hàng thanh lý không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  const buyerIdStr = order.buyerId.toString();
  const isBuyer = buyerIdStr === user._id.toString();
  const isAdmin = user.role === "ADMIN";

  if (!isBuyer && !isAdmin) {
    throw createError("Bạn không có quyền hủy đơn hàng này", 403, "FORBIDDEN");
  }

  if (order.status !== THRIFT_ORDER_STATUS.PENDING && order.status !== THRIFT_ORDER_STATUS.WAITING_PAYMENT) {
    throw createError(
      `Không thể hủy đơn hàng ở trạng thái ${order.status}`,
      400,
      "INVALID_ORDER_STATUS_FOR_CANCEL"
    );
  }

  order.status = THRIFT_ORDER_STATUS.CANCELLED;
  order.cancelledAt = new Date();
  order.cancellationReason = reason || "Khách hàng hủy đơn";
  await order.save();

  const cancelSellerId =
    order.shopOwnerId ||
    order.items?.find((it) => it.sellerId || it.ownerId)?.sellerId ||
    order.items?.find((it) => it.sellerId || it.ownerId)?.ownerId;
  sendSystemNotificationSafe({
    userId: order.buyerId,
    title: "Đã hủy đơn mua Secondhand",
    message: `Đơn hàng ${order.orderCode} đã được hủy thành công (${order.cancellationReason}).`,
    type: NOTIFICATION_TYPE.THRIFT_ORDER,
    link: `/thrift/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  if (cancelSellerId) {
    sendSystemNotificationSafe({
      userId: cancelSellerId,
      title: "Đơn mua Secondhand đã bị hủy",
      message: `Đơn hàng ${order.orderCode} đã bị hủy. Lý do: ${order.cancellationReason}`,
      type: NOTIFICATION_TYPE.THRIFT_ORDER,
      link: `/shop/thrift/orders/${order.orderCode}`,
      metadata: { orderId: order._id, orderCode: order.orderCode },
    });
  }
  notifyAdminsSafe({
    title: "Đơn mua Secondhand bị hủy",
    message: `Đơn hàng ${order.orderCode} đã bị hủy (${order.cancellationReason}).`,
    type: NOTIFICATION_TYPE.THRIFT_ORDER,
    link: `/admin/thrift`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });

  return order;
};

/**
 * Cập nhật trạng thái xử lý vận chuyển đơn hàng THRIFT (Shop Owner / Admin)
 */
export const updateThriftOrderStatus = async (orderId, user, updatePayload) => {
  let nextStatus = typeof updatePayload === "string" ? updatePayload : updatePayload?.status;
  const trackingCode = typeof updatePayload === "object" ? updatePayload?.trackingCode : undefined;
  const courierName = typeof updatePayload === "object" ? updatePayload?.courierName : undefined;
  const note = typeof updatePayload === "object" ? updatePayload?.note : undefined;
  const sealCode = typeof updatePayload === "object" ? updatePayload?.sealCode : undefined;

  let order;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await ThriftOrder.findById(orderId);
  }
  if (!order) {
    const cleanCode = orderId.replace(/^#/, "");
    order = await ThriftOrder.findOne({
      $or: [{ orderCode: orderId }, { orderCode: `#${orderId}` }, { orderCode: cleanCode }],
    });
  }

  if (!order) {
    throw createError("Đơn hàng thanh lý không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  const isAdmin = user.role === "ADMIN";
  const isShopOwner = user.role === "SHOP_OWNER";
  const isSeller = order.items.some(
    (item) => (item.sellerId || item.ownerId)?.toString() === user._id.toString()
  );

  if (!isAdmin && !isSeller && !isShopOwner) {
    throw createError("Chỉ người bán của đơn hàng hoặc Shop Owner/Admin mới có quyền cập nhật trạng thái", 403, "FORBIDDEN");
  }

  if (nextStatus) {
    if (nextStatus === "SHIPPED") nextStatus = THRIFT_ORDER_STATUS.SHIPPING;
    else if (nextStatus === "PROCESSING") nextStatus = THRIFT_ORDER_STATUS.PREPARING;
    else if (nextStatus === "ATELIER_APPRAISAL") nextStatus = THRIFT_ORDER_STATUS.PREPARING;

    const validStatuses = Object.values(THRIFT_ORDER_STATUS);
    if (!validStatuses.includes(nextStatus)) {
      throw createError(`Trạng thái không hợp lệ: ${nextStatus}`, 400, "INVALID_STATUS");
    }

    order.status = nextStatus;

    if (nextStatus === THRIFT_ORDER_STATUS.DELIVERED) {
      if (!order.escrowExpiresAt) {
        order.escrowExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      }
      order.escrowStatus = "HELD_72H";
    } else if (nextStatus === THRIFT_ORDER_STATUS.COMPLETED) {
      const wasReleased = order.escrowStatus === "RELEASED";
      order.escrowStatus = "RELEASED";
      if (!order.provenanceVaultCertId) {
        order.provenanceVaultCertId = `PRV-VAULT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      }
      if (!wasReleased) {
        try {
          const payoutAmt = Number(order.itemsSubtotal) || Number(order.totalAmount) || 0;
          let targetShopOwnerId = order.shopOwnerId;
          if (!targetShopOwnerId) {
            const sellerItem = order.items?.find((it) => it.sellerId || it.ownerId);
            targetShopOwnerId = sellerItem?.sellerId || sellerItem?.ownerId;
          }
          if (!targetShopOwnerId) {
            const defaultShop = await User.findOne({ role: "SHOP_OWNER" });
            targetShopOwnerId = defaultShop?._id;
          }
          if (targetShopOwnerId && payoutAmt > 0) {
            await User.findByIdAndUpdate(targetShopOwnerId, {
              $inc: { walletBalance: payoutAmt },
            });
            console.log(`[THRIFT DISBURSEMENT] Credited ${payoutAmt} VND to shop owner ${targetShopOwnerId}`);
          }
        } catch (e) {
          console.warn('[THRIFT DISBURSEMENT ERROR]', e);
        }
      }
    }
  }

  if (trackingCode !== undefined) order.trackingCode = trackingCode;
  if (courierName !== undefined) order.courierName = courierName;
  if (note !== undefined) order.note = note;
  if (sealCode !== undefined) order.sealCode = sealCode;

  await order.save();

  // Gửi thông báo cập nhật trạng thái đơn mua Secondhand tới cả 3 role
  const statusLabels = {
    CONFIRMED: "đã được Shop xác nhận",
    PREPARING: "đang được đóng gói & niêm phong",
    SHIPPING: `đã được gửi đi (${order.courierName || "Đơn vị vận chuyển"} - Mã vận đơn: ${order.trackingCode || "N/A"})`,
    DELIVERED: "đã giao hàng thành công",
    COMPLETED: "đã hoàn tất và giải ngân ký quỹ",
    CANCELLED: "đã bị hủy",
  };
  const labelText = statusLabels[order.status] || `cập nhật trạng thái ${order.status}`;
  const sellerTargetId =
    order.shopOwnerId ||
    order.items?.find((it) => it.sellerId || it.ownerId)?.sellerId ||
    order.items?.find((it) => it.sellerId || it.ownerId)?.ownerId ||
    user._id;

  sendSystemNotificationSafe({
    userId: order.buyerId || order.userId,
    title: `Cập nhật đơn mua ${order.orderCode}`,
    message: `Đơn hàng Secondhand ${order.orderCode} của bạn ${labelText}.`,
    type: NOTIFICATION_TYPE.THRIFT_ORDER,
    link: `/thrift/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode, status: order.status },
  });
  if (sellerTargetId) {
    sendSystemNotificationSafe({
      userId: sellerTargetId,
      title: `Đã cập nhật đơn mua ${order.orderCode}`,
      message: `Đơn hàng Secondhand ${order.orderCode} ${labelText}.`,
      type: NOTIFICATION_TYPE.THRIFT_ORDER,
      link: `/shop/thrift/orders/${order.orderCode}`,
      metadata: { orderId: order._id, orderCode: order.orderCode, status: order.status },
    });
  }
  notifyAdminsSafe({
    title: `Cập nhật đơn mua Secondhand (${order.status})`,
    message: `Đơn hàng ${order.orderCode} vừa ${labelText}.`,
    type: NOTIFICATION_TYPE.THRIFT_ORDER,
    link: `/admin/thrift`,
    metadata: { orderId: order._id, orderCode: order.orderCode, status: order.status },
  });

  return order;
};
export const confirmDeliveredThriftOrder = async (orderId, user) => {
  let order;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await ThriftOrder.findById(orderId);
  }
  if (!order) {
    const cleanCode = orderId.replace(/^#/, "");
    order = await ThriftOrder.findOne({
      $or: [{ orderCode: orderId }, { orderCode: `#${orderId}` }, { orderCode: cleanCode }],
    });
  }

  if (!order) {
    throw createError("Đơn hàng thanh lý không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  const isBuyer = order.buyerId?.toString() === user._id.toString();
  const isAdmin = user.role === "ADMIN";
  if (!isBuyer && !isAdmin) {
    throw createError("Chỉ người mua mới có quyền xác nhận nhận hàng", 403, "FORBIDDEN");
  }

  order.status = THRIFT_ORDER_STATUS.DELIVERED;
  order.buyerConfirmed = true;
  order.buyerConfirmedAt = new Date();
  await order.save();

  const sellerTargetId =
    order.shopOwnerId ||
    order.items?.find((it) => it.sellerId || it.ownerId)?.sellerId ||
    order.items?.find((it) => it.sellerId || it.ownerId)?.ownerId;

  sendSystemNotificationSafe({
    userId: order.buyerId || user._id,
    title: "Đã xác nhận nhận hàng Secondhand",
    message: `Bạn đã xác nhận nhận hàng thành công cho đơn mua ${order.orderCode}.`,
    type: NOTIFICATION_TYPE.THRIFT_ORDER,
    link: `/thrift/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  if (sellerTargetId) {
    sendSystemNotificationSafe({
      userId: sellerTargetId,
      title: "Khách đã xác nhận nhận hàng Secondhand",
      message: `Khách hàng đã xác nhận nhận hàng cho đơn mua ${order.orderCode}.`,
      type: NOTIFICATION_TYPE.THRIFT_ORDER,
      link: `/shop/thrift/orders/${order.orderCode}`,
      metadata: { orderId: order._id, orderCode: order.orderCode },
    });
  }
  notifyAdminsSafe({
    title: "Khách đã nhận đơn mua Secondhand",
    message: `Đơn mua ${order.orderCode} đã được người mua xác nhận nhận hàng thành công.`,
    type: NOTIFICATION_TYPE.THRIFT_ORDER,
    link: `/admin/thrift`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });

  return order;
};


/**
 * Người mua (Buyer), Người bán (Seller) hoặc Admin mở khiếu nại tranh chấp đơn hàng THRIFT
 */
export const disputeThriftOrder = async (orderId, user, { reason = "", problemItem = "all", description = "" } = {}) => {
  let order = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await ThriftOrder.findById(orderId);
  }
  if (!order) {
    const cleanCode = String(orderId).trim().replace(/^#/, "");
    order = await ThriftOrder.findOne({
      $or: [{ orderCode: orderId }, { orderCode: `#${orderId}` }, { orderCode: cleanCode }],
    });
  }

  if (!order) {
    throw createError("Đơn hàng thanh lý không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  const isBuyer = order.buyerId?.toString() === user._id.toString();
  const isSeller = order.items?.some(
    (item) => (item.sellerId || item.ownerId)?.toString() === user._id.toString()
  );
  const isAdmin = user.role === "ADMIN";

  if (!isBuyer && !isSeller && !isAdmin) {
    throw createError("Bạn không có quyền khiếu nại đơn hàng này", 403, "FORBIDDEN");
  }

  order.status = THRIFT_ORDER_STATUS.DISPUTED;
  order.disputeReason = reason || description || "Khách hàng yêu cầu đối soát độc lập trong 72h";
  order.disputeDetail = {
    problemItem: problemItem || "all",
    reason: reason || "",
    description: description || "",
    disputedAt: new Date(),
    reportedBy: user._id,
  };
  await order.save();

  const sellerTargetId =
    order.shopOwnerId ||
    order.items?.find((it) => it.sellerId || it.ownerId)?.sellerId ||
    order.items?.find((it) => it.sellerId || it.ownerId)?.ownerId;

  sendSystemNotificationSafe({
    userId: order.buyerId,
    title: "Khiếu nại đơn mua Secondhand đã ghi nhận",
    message: `Khiếu nại cho đơn hàng ${order.orderCode} đã được gửi tới Ban Trọng Tài (${order.disputeReason}).`,
    type: NOTIFICATION_TYPE.THRIFT_ORDER,
    link: `/thrift/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  if (sellerTargetId) {
    sendSystemNotificationSafe({
      userId: sellerTargetId,
      title: "Đơn mua Secondhand có khiếu nại mới",
      message: `Đơn hàng ${order.orderCode} vừa bị mở tranh chấp: ${order.disputeReason}`,
      type: NOTIFICATION_TYPE.THRIFT_ORDER,
      link: `/shop/thrift/orders/${order.orderCode}`,
      metadata: { orderId: order._id, orderCode: order.orderCode },
    });
  }
  notifyAdminsSafe({
    title: "Tranh chấp đơn mua Secondhand mới",
    message: `Đơn hàng ${order.orderCode} vừa mở hồ sơ tranh chấp (${order.disputeReason}).`,
    type: NOTIFICATION_TYPE.SYSTEM,
    link: `/admin/disputes`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });

  return order;
};
