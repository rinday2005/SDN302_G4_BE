import mongoose from "mongoose";
import OrderGroup from "./orderGroup.model.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../rent/order/order.model.js";
import ThriftOrder, { THRIFT_ORDER_STATUS } from "../thrift/order/thriftOrder.model.js";
import RentalProduct from "../rent/product/product.model.js";
import ThriftListing from "../thrift/listing/thriftListing.model.js";
import Cart from "../cart/cart.model.js";
import { removeRentItems, removeThriftItems } from "../cart/cart.service.js";
import { checkRentalAvailability } from "../rent/availability/availability.service.js";
import User from "../user/user.model.js";
import { calculateShippingFee, normalizeShopBranch } from "../../utils/shipping.js";
import { sendSystemNotificationSafe, notifyAdminsSafe } from "../notification/notification.service.js";
import { NOTIFICATION_TYPE } from "../notification/notification.model.js";
import { buildVnPayUrl } from "../payment/vnpay.utils.js";
import Payment from "../payment/payment.model.js";
import {
  VNPAY_TMN_CODE,
  VNPAY_HASH_SECRET,
  VNPAY_URL,
  VNPAY_RETURN_URL,
} from "../../config/env.js";

const DEFAULT_HASH_SECRET = VNPAY_HASH_SECRET || "REUSE_HUB_VNPAY_SECRET_2026";
const DEFAULT_TMN_CODE = VNPAY_TMN_CODE || "REUSEHUB";
const DEFAULT_VNP_URL = VNPAY_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const DEFAULT_RETURN_URL = VNPAY_RETURN_URL || "http://localhost:5173/payment-return";
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const createError = (message, statusCode = 400, errorCode = "BAD_REQUEST") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

/**
 * Multi-Shop Checkout: One Customer Checkout -> One Parent Order (OrderGroup) -> Multiple Shop Orders
 */
export const createGroupCheckout = async ({
  user,
  shippingAddress,
  paymentMethod = "VNPAY",
  rentDates = {},
  selectedRentItemIds,
  selectedThriftItemIds,
  note = "",
  ipAddress = "127.0.0.1",
}) => {
  if (!user || !user._id) {
    throw createError("Vui lòng đăng nhập để thực hiện thanh toán", 401, "UNAUTHORIZED");
  }

  // 1. Validate shipping address
  const recipientName = (shippingAddress?.recipientName || user.fullName || "Khách hàng").trim();
  const recipientPhone = (shippingAddress?.recipientPhone || user.phoneNumber || "0900000000").trim();
  const province = (shippingAddress?.province || user.address?.province || "Thành phố Đà Nẵng").trim();
  const district = (shippingAddress?.district || user.address?.district || "").trim();
  const ward = (shippingAddress?.ward || user.address?.ward || "").trim();
  const detail = (shippingAddress?.detail || user.address?.detail || "Địa chỉ mặc định").trim();

  if (!province) {
    throw createError("Vui lòng cung cấp Tỉnh/Thành phố nhận hàng để tính phí vận chuyển", 400, "MISSING_PROVINCE");
  }

  const finalShippingAddress = {
    recipientName,
    recipientPhone,
    province,
    district,
    ward,
    detail,
  };

  // 2. Lấy dữ liệu giỏ hàng
  const cart = await Cart.findOne({ userId: user._id })
    .populate("rentItems.productId")
    .populate("thriftItems.productId");

  if (!cart) {
    throw createError("Giỏ hàng của bạn đang trống", 400, "CART_EMPTY");
  }

  // Lọc items theo selected list nếu client gửi
  let rentItems = cart.rentItems.filter((it) => it.productId);
  if (Array.isArray(selectedRentItemIds) && selectedRentItemIds.length > 0) {
    const setIds = new Set(selectedRentItemIds.map((id) => id.toString()));
    rentItems = rentItems.filter((it) => setIds.has(it.productId._id.toString()));
  }

  let thriftItems = cart.thriftItems.filter((it) => it.productId);
  if (Array.isArray(selectedThriftItemIds) && selectedThriftItemIds.length > 0) {
    const setIds = new Set(selectedThriftItemIds.map((id) => id.toString()));
    thriftItems = thriftItems.filter((it) => setIds.has(it.productId._id.toString()));
  }

  if (rentItems.length === 0 && thriftItems.length === 0) {
    throw createError("Không có sản phẩm nào được chọn để thanh toán", 400, "NO_ITEMS_SELECTED");
  }

  // 3. Nếu có RENT items: kiểm tra KYC của khách hàng & thời gian thuê
  if (rentItems.length > 0) {
    if (user.kycStatus !== "APPROVED") {
      throw createError("Tài khoản cần được xác thực KYC thành công trước khi thuê đồ", 403, "KYC_NOT_APPROVED");
    }
    if (!rentDates.startDate || !rentDates.endDate) {
      throw createError("Vui lòng chọn ngày bắt đầu và kết thúc thuê cho các sản phẩm RENT", 400, "MISSING_RENT_DATES");
    }
  }

  const startDate = rentDates.startDate ? new Date(rentDates.startDate) : new Date();
  const endDate = rentDates.endDate ? new Date(rentDates.endDate) : new Date(Date.now() + MS_PER_DAY);
  const rentalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / MS_PER_DAY));

  // 4. Group RENT items by Shop (ownerId)
  const rentByShop = new Map();
  for (const item of rentItems) {
    const prod = item.productId;
    if (prod.status !== "APPROVED") {
      throw createError(`Sản phẩm "${prod.name}" chưa được duyệt hoặc đã tạm ẩn`, 400, "PRODUCT_NOT_AVAILABLE");
    }
    const shopId = prod.ownerId?.toString();
    if (!shopId) continue;
    if (!rentByShop.has(shopId)) {
      rentByShop.set(shopId, []);
    }
    rentByShop.get(shopId).push({
      product: prod,
      quantity: item.quantity,
    });
  }

  // 5. Group THRIFT items by Shop (ownerId)
  const thriftByShop = new Map();
  for (const item of thriftItems) {
    const listing = item.productId;
    if (listing.status !== "APPROVED") {
      throw createError(`Sản phẩm thanh lý "${listing.name}" chưa sẵn sàng để bán hoặc đã được bán`, 400, "LISTING_NOT_AVAILABLE");
    }
    const shopId = listing.ownerId?.toString();
    if (!shopId) continue;
    if (!thriftByShop.has(shopId)) {
      thriftByShop.set(shopId, []);
    }
    thriftByShop.get(shopId).push({
      listing,
      quantity: item.quantity || 1,
    });
  }

  // 6. Tạo các child orders cho từng Shop
  const childOrderResults = [];
  const parentOrderGroupId = new mongoose.Types.ObjectId();
  let totalSubtotal = 0;
  let totalShipping = 0;
  let totalDeposit = 0;

  // A. Xử lý các đơn RENT theo từng Shop
  for (const [shopId, shopItems] of rentByShop.entries()) {
    const shopOwner = await User.findById(shopId).select("fullName email shopProfile address");
    const shopProvince =
      shopOwner?.address?.province ||
      shopOwner?.shopProfile?.cityRegion ||
      shopItems[0]?.product?.location ||
      "Thành phố Đà Nẵng";

    let shopRentalFee = 0;
    let shopDepositAmount = 0;

    const orderItemSnapshots = [];
    for (const { product, quantity } of shopItems) {
      // Check availability
      try {
        await checkRentalAvailability(product._id, startDate, endDate, quantity);
      } catch (err) {
        throw createError(`${product.name}: ${err.message}`, 400, "AVAILABILITY_ERROR");
      }

      const itemRentalTotal = product.pricePerDay * quantity * rentalDays;
      const itemDeposit = product.depositAmount * quantity;

      shopRentalFee += itemRentalTotal;
      shopDepositAmount += itemDeposit;

      orderItemSnapshots.push({
        productId: product._id,
        productName: product.name,
        quantity,
        pricePerDay: product.pricePerDay,
        depositAmount: product.depositAmount,
        imageUrl: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : "",
        location: normalizeShopBranch(shopProvince),
      });
    }

    let shopShippingFee = 35000;
    try {
      shopShippingFee = calculateShippingFee(shopProvince, province);
    } catch {
      shopShippingFee = 35000;
    }

    const shopTotalAmount = shopRentalFee + shopDepositAmount + shopShippingFee;
    const childOrderCode = `RO-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const childRentalOrder = await RentalOrder.create({
      orderCode: childOrderCode,
      renterId: user._id,
      shopOwnerId: shopId,
      orderGroupId: parentOrderGroupId,
      items: orderItemSnapshots,
      startDate,
      endDate,
      rentalFee: shopRentalFee,
      depositAmount: shopDepositAmount,
      shippingFee: shopShippingFee,
      totalAmount: shopTotalAmount,
      shippingAddress: finalShippingAddress,
      status: RENTAL_ORDER_STATUS.WAITING_PAYMENT,
      paymentStatus: "PENDING",
    });

    totalSubtotal += shopRentalFee;
    totalDeposit += shopDepositAmount;
    totalShipping += shopShippingFee;

    // Bắn thông báo ngay cho Shop Owner khi có đơn thuê mới cần duyệt
    if (shopId) {
      const primaryItemName = orderItemSnapshots?.[0]?.productName || orderItemSnapshots?.[0]?.name || "Sản phẩm cho thuê";
      sendSystemNotificationSafe({
        userId: shopId,
        title: "Đơn thuê mới chờ duyệt",
        message: `Khách hàng ${user?.fullName || "Khách hàng"} vừa gửi yêu cầu duyệt đơn thuê ${childOrderCode} ("${primaryItemName}").`,
        type: NOTIFICATION_TYPE.RENTAL_ORDER,
        link: `/shop/rent/orders/${childOrderCode}`,
        metadata: {
          orderId: childRentalOrder._id,
          orderCode: childOrderCode,
          productName: primaryItemName,
          renterId: user?._id,
          totalAmount: shopTotalAmount,
          depositAmount: shopDepositAmount,
          rentalFee: shopRentalFee,
          status: childRentalOrder.status,
        },
      });
    }

    childOrderResults.push({
      orderId: childRentalOrder._id,
      orderModel: "RentalOrder",
      orderType: "RENT",
      shopId: new mongoose.Types.ObjectId(shopId),
      shopName: shopOwner?.shopProfile?.shopName || shopOwner?.fullName || "Cửa hàng ReUse",
      orderCode: childOrderCode,
      subtotal: shopRentalFee,
      shippingFee: shopShippingFee,
      depositAmount: shopDepositAmount,
      totalAmount: shopTotalAmount,
      status: childRentalOrder.status,
    });
  }

  // B. Xử lý các đơn THRIFT theo từng Shop
  for (const [shopId, shopItems] of thriftByShop.entries()) {
    const shopOwner = await User.findById(shopId).select("fullName email shopProfile address");
    const shopProvince =
      shopOwner?.address?.province ||
      shopOwner?.shopProfile?.cityRegion ||
      shopItems[0]?.listing?.location ||
      "Thành phố Đà Nẵng";

    let shopItemsTotal = 0;
    const orderItemSnapshots = [];

    for (const { listing, quantity } of shopItems) {
      shopItemsTotal += listing.price * (quantity || 1);
      orderItemSnapshots.push({
        listingId: listing._id,
        productId: listing._id,
        name: listing.name,
        price: listing.price,
        quantity: quantity || 1,
        condition: listing.condition || "",
        images: listing.images || [],
        sellerId: shopId,
        ownerId: shopId,
      });
    }

    let shopShippingFee = 35000;
    try {
      shopShippingFee = calculateShippingFee(shopProvince, province);
    } catch {
      shopShippingFee = 35000;
    }

    const shopTotalAmount = shopItemsTotal + shopShippingFee;
    const childOrderCode = `TO-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const childThriftOrder = await ThriftOrder.create({
      orderCode: childOrderCode,
      buyerId: user._id,
      userId: user._id,
      orderGroupId: parentOrderGroupId,
      items: orderItemSnapshots,
      itemsTotal: shopItemsTotal,
      subtotal: shopItemsTotal,
      shippingFee: shopShippingFee,
      totalAmount: shopTotalAmount,
      shippingAddress: finalShippingAddress,
      status: THRIFT_ORDER_STATUS.PENDING,
      paymentStatus: "PENDING",
      paymentMethod,
      note,
    });

    totalSubtotal += shopItemsTotal;
    totalShipping += shopShippingFee;

    if (shopId) {
      const primaryThriftName = orderItemSnapshots?.[0]?.name || "Sản phẩm Secondhand";
      sendSystemNotificationSafe({
        userId: shopId,
        title: "Đơn mua Secondhand mới",
        message: `Khách hàng ${user?.fullName || "Khách hàng"} vừa đặt mua đơn ${childOrderCode} ("${primaryThriftName}").`,
        type: NOTIFICATION_TYPE.THRIFT_ORDER,
        link: `/shop/thrift/orders/${childOrderCode}`,
        metadata: {
          orderId: childThriftOrder._id,
          orderCode: childOrderCode,
          productName: primaryThriftName,
          totalAmount: shopTotalAmount,
        },
      });
    }

    childOrderResults.push({
      orderId: childThriftOrder._id,
      orderModel: "ThriftOrder",
      orderType: "THRIFT",
      shopId: new mongoose.Types.ObjectId(shopId),
      shopName: shopOwner?.shopProfile?.shopName || shopOwner?.fullName || "Cửa hàng ReUse",
      orderCode: childOrderCode,
      subtotal: shopItemsTotal,
      shippingFee: shopShippingFee,
      depositAmount: 0,
      totalAmount: shopTotalAmount,
      status: childThriftOrder.status,
    });
  }

  // 7. Tạo Parent Order (OrderGroup)
  const groupOrderCode = `OG-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const totalAmount = totalSubtotal + totalShipping + totalDeposit;

  const orderGroup = await OrderGroup.create({
    _id: parentOrderGroupId,
    orderCode: groupOrderCode,
    customerId: user._id,
    childOrders: childOrderResults,
    shippingAddress: finalShippingAddress,
    subtotal: totalSubtotal,
    totalShippingFee: totalShipping,
    totalDeposit,
    discount: 0,
    totalAmount,
    paymentMethod,
    paymentStatus: "PENDING",
    status: "PENDING",
    note,
  });

  // Bắn thông báo cho Khách hàng và Admin khi đặt đơn gộp
  sendSystemNotificationSafe({
    userId: user._id,
    title: "Đặt đơn hàng thành công",
    message: `Đơn hàng ${groupOrderCode} gồm ${childOrderResults.length} kiện hàng (${totalAmount.toLocaleString("vi-VN")} VND) đã được khởi tạo.`,
    type: NOTIFICATION_TYPE.RENTAL_ORDER,
    link: `/orders`,
    metadata: { orderGroupId: orderGroup._id, orderCode: groupOrderCode, totalAmount },
  });
  notifyAdminsSafe({
    title: "Đơn hàng mới trên hệ thống",
    message: `Khách hàng ${user?.fullName || "Khách hàng"} vừa tạo đơn hàng ${groupOrderCode} (${childOrderResults.length} kiện - ${totalAmount.toLocaleString("vi-VN")} VND).`,
    type: NOTIFICATION_TYPE.RENTAL_ORDER,
    link: `/admin/rent`,
    metadata: { orderGroupId: orderGroup._id, orderCode: groupOrderCode, totalAmount },
  });

  // 8. Dọn các items đã checkout khỏi giỏ hàng
  if (rentItems.length > 0) {
    await removeRentItems(user._id, rentItems.map((it) => it.productId._id));
  }
  if (thriftItems.length > 0) {
    await removeThriftItems(user._id, thriftItems.map((it) => it.productId._id));
  }

  // 9. Nếu chọn thanh toán VNPAY -> tạo URL thanh toán cho OrderGroup
  let paymentUrl = null;
  if (paymentMethod === "VNPAY") {
    const txnRef = `${groupOrderCode}_${Date.now()}`;
    const description = `Thanh toan don hang tong hop ${groupOrderCode}`;

    await Payment.create({
      orderId: orderGroup._id,
      orderModel: "OrderGroup",
      orderType: "ORDER_GROUP",
      userId: user._id,
      amount: totalAmount,
      status: "PENDING",
      method: "VNPAY",
      txnRef,
      description,
    });

    paymentUrl = buildVnPayUrl({
      tmnCode: DEFAULT_TMN_CODE,
      hashSecret: DEFAULT_HASH_SECRET,
      vnpUrl: DEFAULT_VNP_URL,
      returnUrl: DEFAULT_RETURN_URL,
      ipAddr: ipAddress,
      amount: totalAmount,
      txnRef,
      orderInfo: description,
    });
  }

  return {
    orderGroup,
    childOrders: childOrderResults,
    paymentUrl,
  };
};

/**
 * Lấy chi tiết OrderGroup
 */
export const getOrderGroupById = async (groupId, user) => {
  let group = null;
  if (mongoose.Types.ObjectId.isValid(groupId)) {
    group = await OrderGroup.findById(groupId)
      .populate("customerId", "fullName email phoneNumber")
      .populate("childOrders.shopId", "fullName email shopProfile");
  }
  if (!group) {
    group = await OrderGroup.findOne({ orderCode: groupId })
      .populate("customerId", "fullName email phoneNumber")
      .populate("childOrders.shopId", "fullName email shopProfile");
  }

  if (!group) {
    throw createError("Không tìm thấy đơn hàng tổng", 404, "ORDER_GROUP_NOT_FOUND");
  }

  const isCustomer = group.customerId?._id?.toString() === user._id.toString();
  const isAdmin = user.role === "ADMIN";
  const isShopOwner = group.childOrders.some(
    (co) => co.shopId?._id?.toString() === user._id.toString()
  );

  if (!isCustomer && !isAdmin && !isShopOwner) {
    throw createError("Bạn không có quyền xem đơn hàng này", 403, "FORBIDDEN");
  }

  return group;
};

/**
 * Lấy danh sách OrderGroups của khách hàng
 */
export const getUserOrderGroups = async (userId, { page = 1, limit = 20 } = {}) => {
  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const [orderGroups, total] = await Promise.all([
    OrderGroup.find({ customerId: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate("childOrders.shopId", "fullName email shopProfile"),
    OrderGroup.countDocuments({ customerId: userId }),
  ]);

  return {
    orderGroups,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};

