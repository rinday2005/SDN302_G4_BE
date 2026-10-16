import mongoose from "mongoose";
import ThriftOrder, { THRIFT_ORDER_STATUS } from "./thriftOrder.model.js";
import ThriftListing from "../listing/thriftListing.model.js";
import Cart from "../../cart/cart.model.js";
import { removeThriftItems } from "../../cart/cart.service.js";
import User from "../../user/user.model.js";
import { calculateShippingFee } from "../../../utils/shipping.js";

const DEFAULT_SHOP_PROVINCE = "Hồ Chí Minh";

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

  // AC: Không thể mua listing đã SOLD
  const soldListings = listings.filter((l) => l.status === "SOLD");
  if (soldListings.length > 0) {
    throw createError(
      `Không thể mua sản phẩm đã bán: ${soldListings.map((l) => l.name).join(", ")}`,
      400,
      "LISTING_ALREADY_SOLD"
    );
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
  if (customShippingFee !== undefined && customShippingFee !== null && !isNaN(Number(customShippingFee))) {
    shippingFee = Math.max(0, Number(customShippingFee));
  } else {
    // Tự động tính phí shipping dựa trên vùng giữa Shop/Seller và User
    let sellerProvince = DEFAULT_SHOP_PROVINCE;
    const firstOwnerId = listings[0]?.ownerId;
    if (firstOwnerId) {
      const owner = await User.findById(firstOwnerId).select("address");
      if (owner?.address?.province) {
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

  const order = await ThriftOrder.create({
    orderCode,
    buyerId: user._id,
    userId: user._id,
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

  // 3. Atomic Lock trên từng Listing:
  // Cập nhật điều kiện { _id: listingId, status: { $ne: "SOLD" } }
  // Để không cho phép bán trùng (duplicate sale) nếu có 2 đơn song song
  const listingIds = order.items.map((item) => item.listingId || item.productId);
  const lockedListingIds = [];
  let lockFailed = false;
  let conflictedListingId = null;

  for (const listingId of listingIds) {
    const locked = await ThriftListing.findOneAndUpdate(
      { _id: listingId, status: { $ne: "SOLD" } },
      { $set: { status: "SOLD" } },
      { new: true }
    );

    if (!locked) {
      lockFailed = true;
      conflictedListingId = listingId;
      break;
    }
    lockedListingIds.push(listingId);
  }

  // 4. Nếu phát hiện xung đột (có sản phẩm đã bị bán bởi đơn khác trước đó):
  if (lockFailed) {
    // Rollback các sản phẩm đã khóa trong lượt này lại trạng thái APPROVED
    if (lockedListingIds.length > 0) {
      await ThriftListing.updateMany(
        { _id: { $in: lockedListingIds } },
        { $set: { status: "APPROVED" } }
      );
    }

    // Đánh dấu đơn này FAILED do tranh chấp sản phẩm đã bán
    await ThriftOrder.findByIdAndUpdate(order._id, {
      $set: {
        status: THRIFT_ORDER_STATUS.CANCELLED,
        paymentStatus: "FAILED",
        cancellationReason: `Sản phẩm ${conflictedListingId} đã được mua bởi người khác`,
      },
    });

    throw createError(
      "Không thể hoàn tất đơn hàng vì một hoặc nhiều sản phẩm đã được bán cho người khác",
      409,
      "LISTING_ALREADY_SOLD"
    );
  }

  return claimedOrder;
};

/**
 * Lấy chi tiết đơn hàng THRIFT (Bảo vệ IDOR)
 */
export const getThriftOrderById = async (orderId, user) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw createError("ID đơn hàng không hợp lệ", 400, "INVALID_ORDER_ID");
  }

  const order = await ThriftOrder.findById(orderId)
    .populate("buyerId", "fullName email phoneNumber")
    .populate("items.listingId");

  if (!order) {
    throw createError("Đơn hàng thanh lý không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  // AC: Chặn IDOR - Chỉ chính chủ buyer, seller sở hữu item, hoặc ADMIN mới xem được
  const buyerIdStr = order.buyerId?._id ? order.buyerId._id.toString() : order.buyerId.toString();
  const isBuyer = buyerIdStr === user._id.toString();
  const isAdmin = user.role === "ADMIN";
  const isSeller = order.items.some(
    (item) => (item.sellerId || item.ownerId)?.toString() === user._id.toString()
  );

  if (!isBuyer && !isAdmin && !isSeller) {
    throw createError("Bạn không có quyền xem đơn hàng này", 403, "FORBIDDEN");
  }

  return order;
};

/**
 * Lấy danh sách đơn hàng THRIFT của người mua (User)
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
export const getSellerThriftOrders = async (user, { status, page = 1, limit = 20 } = {}) => {
  const filter = {
    $or: [{ "items.sellerId": user._id }, { "items.ownerId": user._id }],
  };
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
      .populate("buyerId", "fullName email phoneNumber")
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
 * Hủy đơn hàng THRIFT (chỉ khi đơn chưa thanh toán)
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

  return order;
};

/**
 * Cập nhật trạng thái xử lý vận chuyển đơn hàng THRIFT (Shop Owner / Admin)
 */
export const updateThriftOrderStatus = async (orderId, user, nextStatus) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw createError("ID đơn hàng không hợp lệ", 400, "INVALID_ORDER_ID");
  }

  const order = await ThriftOrder.findById(orderId);
  if (!order) {
    throw createError("Đơn hàng thanh lý không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  const isAdmin = user.role === "ADMIN";
  const isSeller = order.items.some(
    (item) => (item.sellerId || item.ownerId)?.toString() === user._id.toString()
  );

  if (!isAdmin && !isSeller) {
    throw createError("Chỉ người bán của đơn hàng hoặc Admin mới có quyền cập nhật trạng thái", 403, "FORBIDDEN");
  }

  const validStatuses = Object.values(THRIFT_ORDER_STATUS);
  if (!validStatuses.includes(nextStatus)) {
    throw createError(`Trạng thái không hợp lệ: ${nextStatus}`, 400, "INVALID_STATUS");
  }

  order.status = nextStatus;
  await order.save();

  return order;
};
