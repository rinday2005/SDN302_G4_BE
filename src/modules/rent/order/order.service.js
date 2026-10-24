import mongoose from "mongoose";
import RentalOrder, { canTransitionStatus, RENTAL_ORDER_STATUS } from "./order.model.js";
import RentalProduct from "../product/product.model.js";
import Cart from "../../cart/cart.model.js";
import { removeRentItems } from "../../cart/cart.service.js";
import { checkRentalAvailability } from "../availability/availability.service.js";
import User from "../../user/user.model.js";
import { calculateShippingFee } from "../../../utils/shipping.js";
import RentalReturn from "../return/return.model.js";

const DEFAULT_SHOP_PROVINCE = "Hồ Chí Minh";
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const createError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

const findRentalOrder = async (orderId) => {
  if (!orderId) return null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    const o = await RentalOrder.findById(orderId);
    if (o) return o;
  }
  const clean = String(orderId).trim().replace("#", "");
  if (!clean) return null;
  return await RentalOrder.findOne({
    $or: [
      { orderCode: clean },
      { orderCode: `#${clean}` },
      { orderCode: new RegExp(clean.replace("RH-RNT-", ""), "i") }
    ]
  });
};

const assertValidOrderId = (orderId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw createError("Invalid order id", 400, "INVALID_ORDER_ID");
  }
};

/**
 * Checkout RENT: tạo đúng 1 RentalOrder cho toàn bộ RENT items trong Cart của user
 */
const createOrder = async ({ user, startDate, endDate, shippingAddress }) => {
  // 1. User phải được duyệt KYC
  if (user.kycStatus !== "APPROVED") {
    throw createError("Tài khoản cần được duyệt KYC trước khi thuê", 403, "KYC_NOT_APPROVED");
  }

  // 2. AC: Không thể checkout nếu Cart RENT trống
  const cart = await Cart.findOne({ userId: user._id });
  const rentItems = cart?.rentItems || [];
  if (rentItems.length === 0) {
    throw createError("Giỏ hàng thuê đang trống", 400, "EMPTY_RENT_CART");
  }

  const renterId = user._id;
  const start = new Date(startDate);
  const end = new Date(endDate);
  // Số ngày thuê dùng chung cho toàn bộ RENT items
  const rentalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY));

  const quantityByProduct = new Map();
  for (const item of rentItems) {
    const key = item.productId.toString();
    quantityByProduct.set(key, (quantityByProduct.get(key) || 0) + item.quantity);
  }

  const products = await RentalProduct.find({
    _id: { $in: [...quantityByProduct.keys()] },
    status: "APPROVED",
  });

  if (products.length !== quantityByProduct.size) {
    throw createError(
      "Một hoặc nhiều sản phẩm trong giỏ không còn tồn tại hoặc chưa được duyệt",
      404,
      "PRODUCT_NOT_FOUND"
    );
  }

  // AC: shopOwnerId luôn là Shop Owner duy nhất
  const ownerIds = new Set(products.map((p) => p.ownerId.toString()));
  if (ownerIds.size !== 1) {
    throw createError("Tất cả sản phẩm trong đơn thuê phải thuộc cùng 1 Shop Owner", 400, "MULTIPLE_SHOP_OWNERS");
  }
  const shopOwnerId = [...ownerIds][0];

  // 3. AC: Không thể checkout khi một item hết hàng trong khoảng ngày thuê
  for (const product of products) {
    const quantity = quantityByProduct.get(product._id.toString());
    try {
      await checkRentalAvailability(product._id, start, end, quantity);
    } catch (error) {
      error.message = `${product.name}: ${error.message}`;
      throw error;
    }
  }

  let rentalFee = 0;
  let depositAmount = 0;

  // Snapshot thông tin sản phẩm tại thời điểm đặt
  const orderItems = products.map((product) => {
    const quantity = quantityByProduct.get(product._id.toString());
    rentalFee += product.pricePerDay * quantity * rentalDays;
    depositAmount += product.depositAmount * quantity;

    return {
      productId: product._id,
      productName: product.name,
      quantity,
      pricePerDay: product.pricePerDay,
      depositAmount: product.depositAmount,
      imageUrl: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : "",
    };
  });

  const shopOwner = await User.findById(shopOwnerId).select("address");
  const shopProvince = shopOwner?.address?.province || DEFAULT_SHOP_PROVINCE;

  let shippingFee;
  try {
    shippingFee = calculateShippingFee(shopProvince, shippingAddress.province);
  } catch (error) {
    // Tỉnh thành chưa chuẩn theo mapping thì áp dụng phí vùng tiêu chuẩn
    shippingFee = 35000;
  }

  // AC: totalAmount = tổng chi phí tất cả item (thuê + cọc) + shipping (tính 1 lần)
  const totalAmount = rentalFee + depositAmount + shippingFee;

  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderCode = `RO-${Date.now()}-${randomSuffix}`;

  const order = await RentalOrder.create({
    orderCode,
    renterId,
    shopOwnerId,
    items: orderItems,
    startDate: start,
    endDate: end,
    rentalFee,
    depositAmount,
    shippingFee,
    totalAmount,
    shippingAddress: {
      recipientName: shippingAddress.recipientName.trim(),
      recipientPhone: shippingAddress.recipientPhone.trim(),
      province: shippingAddress.province.trim(),
      district: shippingAddress.district.trim(),
      ward: shippingAddress.ward.trim(),
      detail: shippingAddress.detail.trim(),
    },
    // AC: order ban đầu PENDING
    status: RENTAL_ORDER_STATUS.PENDING,
  });

  // 4. Loại các RENT items đã checkout khỏi Cart
  await removeRentItems(
    renterId,
    products.map((p) => p._id)
  );

  return order;
};

/**
 * Lấy danh sách đơn thuê của Renter hiện tại
 */
const getUserOrders = async (renterId, { page = 1, limit = 10, status } = {}) => {
  try { await RentalOrder.updateMany({ renterId, status: "PAID", "claProof.isSigned": true }, { $set: { status: "RENTING" } }); await RentalOrder.updateMany({ renterId, status: "PAID" }, { $set: { status: "DELIVERED" } }); } catch (e) { }
  const query = { renterId };
  if (status) query.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [orders, total] = await Promise.all([
    RentalOrder.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    RentalOrder.countDocuments(query),
  ]);

  return {
    orders,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

/**
 * Lấy chi tiết đơn thuê
 */
const getOrderById = async (orderId, user) => {
  let order = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    let q = RentalOrder.findById(orderId);
    if (typeof q?.populate === "function") q = q.populate("renterId", "fullName email phoneNumber");
    if (typeof q?.populate === "function") q = q.populate("shopOwnerId", "fullName email phoneNumber");
    if (typeof q?.populate === "function") q = q.populate("items.productId", "name images pricePerDay depositAmount condition location");
    order = await q;
  }
  if (!order) {
    const clean = String(orderId || "").trim().replace("#", "");
    order = await RentalOrder.findOne({
      $or: [
        { orderCode: clean },
        { orderCode: `#${clean}` },
        { orderCode: new RegExp(clean.replace("RH-RNT-", ""), "i") }
      ]
    })
      .populate("renterId", "fullName email phoneNumber")
      .populate("shopOwnerId", "fullName email phoneNumber")
      .populate("items.productId", "name images pricePerDay depositAmount condition location");
  }

  if (!order) {
    throw createError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const userId = user._id.toString();
  const renterIdStr = (order.renterId?._id || order.renterId)?.toString();
  const shopOwnerIdStr = (order.shopOwnerId?._id || order.shopOwnerId)?.toString();
  const isRenter = renterIdStr === userId;
  const isShopOwner = shopOwnerIdStr === userId;
  const isAdmin = user.role === "ADMIN";

  if (!isRenter && !isShopOwner && !isAdmin) {
    throw createError("Forbidden", 403, "FORBIDDEN");
  }

  return order;
};

/**
 * Lấy danh sách đơn thuê của shop (SHOP_OWNER chỉ thấy đơn của mình, ADMIN thấy tất cả)
 */
const getAllOrders = async (user, { page = 1, limit = 10, status } = {}) => {
  const query = {};
  if (user.role === "SHOP_OWNER") query.shopOwnerId = user._id;
  if (status) query.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [orders, total] = await Promise.all([
    RentalOrder.find(query)
      .populate("renterId", "fullName email phoneNumber")
      .populate("items.productId", "name images pricePerDay depositAmount condition location")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    RentalOrder.countDocuments(query),
  ]);

  return {
    orders,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

/**
 * Cập nhật trạng thái đơn thuê theo vòng đời hợp lệ
 */
const updateOrderStatus = async (orderId, status, user) => {
  const order = await findRentalOrder(orderId);
  if (!order) {
    throw createError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const isShopOwner =
    user.role === "SHOP_OWNER" &&
    order.shopOwnerId.toString() === user._id.toString();
  const isAdmin = user.role === "ADMIN";

  if (!isShopOwner && !isAdmin) {
    throw createError("Forbidden", 403, "FORBIDDEN");
  }

  if (!canTransitionStatus(order.status, status)) {
    throw createError(
      `Không thể chuyển trạng thái từ ${order.status} sang ${status}`,
      400,
      "INVALID_STATUS_TRANSITION"
    );
  }

  order.status = status;
  await order.save();

  return order;
};

/**
 * Hủy đơn thuê
 */
const cancelOrder = async (orderId, user) => {
  const order = await findRentalOrder(orderId);
  if (!order) {
    throw createError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const userId = user._id.toString();
  const isRenter = order.renterId.toString() === userId;
  const isShopOwner = order.shopOwnerId.toString() === userId;
  const isAdmin = user.role === "ADMIN";

  if (!isRenter && !isShopOwner && !isAdmin) {
    throw createError("Forbidden", 403, "FORBIDDEN");
  }

  // Renter chỉ được hủy khi đơn còn PENDING
  if (isRenter && !isShopOwner && !isAdmin && order.status !== "PENDING") {
    throw createError("Cannot cancel order that has already been processed", 400, "ORDER_CANNOT_BE_CANCELLED");
  }

  if (!canTransitionStatus(order.status, "CANCELLED")) {
    throw createError(`Không thể hủy đơn ở trạng thái ${order.status}`, 400, "ORDER_CANNOT_BE_CANCELLED");
  }

  order.status = "CANCELLED";
  await order.save();

  return order;
};

/**
 * Phê duyệt đơn thuê (Chỉ Shop Owner duy nhất của hệ thống)
 * Chuyển trạng thái đơn sang WAITING_PAYMENT
 */
const approveOrder = async (orderId, user) => {
  if (user.role !== "SHOP_OWNER" && user.role !== "ADMIN") {
    throw createError("Chỉ Shop Owner mới có quyền phê duyệt đơn thuê", 403, "FORBIDDEN");
  }

  const order = await findRentalOrder(orderId);
  if (!order) {
    throw createError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  if (user.role !== "ADMIN" && order.shopOwnerId.toString() !== user._id.toString()) {
    throw createError("Forbidden", 403, "FORBIDDEN");
  }

  // AC: order đã xử lý không thể approve/reject lại
  if (order.status !== RENTAL_ORDER_STATUS.PENDING) {
    throw createError(
      `Đơn hàng đã được xử lý hoặc không ở trạng thái chờ duyệt (Trạng thái hiện tại: ${order.status})`,
      400,
      "ORDER_ALREADY_PROCESSED"
    );
  }

  // AC: khi approve toàn bộ đơn chuyển WAITING_PAYMENT (toàn bộ items cùng được xử lý)
  order.status = RENTAL_ORDER_STATUS.WAITING_PAYMENT;
  await order.save();

  return order;
};

/**
 * Từ chối đơn thuê (Chỉ Shop Owner duy nhất của hệ thống)
 * Chuyển trạng thái đơn sang REJECTED và giải phóng reservation
 */
const rejectOrder = async (orderId, user, { reason = "" } = {}) => {
  if (user.role !== "SHOP_OWNER" && user.role !== "ADMIN") {
    throw createError("Chỉ Shop Owner mới có quyền từ chối đơn thuê", 403, "FORBIDDEN");
  }

  const order = await findRentalOrder(orderId);
  if (!order) {
    throw createError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  if (user.role !== "ADMIN" && order.shopOwnerId.toString() !== user._id.toString()) {
    throw createError("Forbidden", 403, "FORBIDDEN");
  }

  // AC: order đã xử lý không thể approve/reject lại
  if (order.status !== RENTAL_ORDER_STATUS.PENDING) {
    throw createError(
      `Đơn hàng đã được xử lý hoặc không ở trạng thái chờ duyệt (Trạng thái hiện tại: ${order.status})`,
      400,
      "ORDER_ALREADY_PROCESSED"
    );
  }

  // AC: khi reject toàn bộ đơn chuyển REJECTED và giải phóng reservation
  order.status = RENTAL_ORDER_STATUS.REJECTED;
  if (reason) {
    order.rejectionReason = reason.trim();
  }
  await order.save();

  return order;
};

/**
 * [BE-S3-06] Cập nhật trạng thái giao hàng / bàn giao (Shop Owner)
 * Chỉ order PAID mới được chuyển sang READY_FOR_HANDOVER hoặc HANDED_OVER
 */
const handoverOrder = async (
  orderId,
  user,
  { carrierName, trackingCode, status = RENTAL_ORDER_STATUS.HANDED_OVER } = {}
) => {
  if (user.role !== "SHOP_OWNER" && user.role !== "ADMIN") {
    throw createError("Chỉ Shop Owner mới có quyền cập nhật trạng thái bàn giao", 403, "FORBIDDEN");
  }

  const order = await findRentalOrder(orderId);
  if (!order) {
    throw createError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  if (user.role !== "ADMIN" && order.shopOwnerId.toString() !== user._id.toString()) {
    throw createError("Forbidden", 403, "FORBIDDEN");
  }

  // AC: Không cho cập nhật order chưa thanh toán
  const validCurrentStatuses = [
    RENTAL_ORDER_STATUS.PAID,
    RENTAL_ORDER_STATUS.READY_FOR_HANDOVER,
  ];

  if (!validCurrentStatuses.includes(order.status)) {
    throw createError(
      `Chỉ đơn hàng đã thanh toán (PAID) mới có thể bàn giao vận chuyển (Trạng thái hiện tại: ${order.status})`,
      400,
      "ORDER_NOT_PAID"
    );
  }

  const targetStatus =
    status === RENTAL_ORDER_STATUS.READY_FOR_HANDOVER
      ? RENTAL_ORDER_STATUS.READY_FOR_HANDOVER
      : RENTAL_ORDER_STATUS.HANDED_OVER;

  // AC: Lưu carrier/tracking code ở cấp order
  order.shippingDetails = {
    ...(order.shippingDetails?.toObject ? order.shippingDetails.toObject() : order.shippingDetails),
    carrier: carrierName.trim(),
    carrierName: carrierName.trim(),
    trackingCode: trackingCode.trim(),
    shippedAt: order.shippingDetails?.shippedAt || new Date(),
  };

  // AC: order chuyển đúng trạng thái
  order.status = targetStatus;
  await order.save();

  return order;
};

/**
 * [BE-S3-07] Xác nhận đã nhận đồ & bắt đầu tính thời gian thuê (Renter)
 * Chỉ renterId của order mới được xác nhận
 * Chuyển trạng thái sang RENTING và lưu timestamp receivedAt
 */
const confirmReceivedOrder = async (orderId, user, payload = {}) => {
  const order = await findRentalOrder(orderId);
  if (!order) {
    throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  // AC: Chỉ renterId của order mới được xác nhận (User khác không thể gọi API, Admin được phép hỗ trợ)
  const isRenter = order.renterId.toString() === user._id.toString();
  const isAdmin = user.role === "ADMIN";
  if (!isRenter && !isAdmin) {
    throw createError(
      "Chỉ người thuê của đơn hàng mới có quyền xác nhận đã nhận đồ",
      403,
      "FORBIDDEN"
    );
  }

  // AC: order chỉ chuyển RENTING từ trạng thái hợp lệ
  const validCurrentStatuses = [
    RENTAL_ORDER_STATUS.HANDED_OVER,
    RENTAL_ORDER_STATUS.SHIPPING,
    RENTAL_ORDER_STATUS.DELIVERED,
    RENTAL_ORDER_STATUS.RENTING,
    RENTAL_ORDER_STATUS.PAID,
    RENTAL_ORDER_STATUS.READY_FOR_HANDOVER,
    RENTAL_ORDER_STATUS.PREPARING,
  ];

  if (!validCurrentStatuses.includes(order.status)) {
    throw createError(
      `Đơn hàng chưa ở trạng thái vận chuyển để xác nhận nhận hàng (Trạng thái hiện tại: ${order.status})`,
      400,
      "ORDER_NOT_READY_TO_RECEIVE"
    );
  }

  const receivedTimestamp = order.receivedAt || new Date();

  // AC: lưu timestamp xác nhận (bắt đầu tính thời gian thuê thực tế)
  order.receivedAt = receivedTimestamp;
  if (order.shippingDetails) {
    order.shippingDetails.deliveredAt = order.shippingDetails.deliveredAt || receivedTimestamp;
  }

  // Lưu biên bản bàn giao CLA và nhật ký đối kiểm 3 góc
  const {
    photos = {},
    images = [],
    note = "",
    signerName = "",
    signerPhone = "",
  } = payload;

  const slot1 = photos?.slot1 || images[0] || (order.claProof?.photos?.slot1 || "");
  const slot2 = photos?.slot2 || images[1] || (order.claProof?.photos?.slot2 || "");
  const slot3 = photos?.slot3 || images[2] || (order.claProof?.photos?.slot3 || "");
  const combinedImages = images.length > 0 ? images : [slot1, slot2, slot3].filter(Boolean);

  order.claProof = {
    isSigned: true,
    signedAt: receivedTimestamp,
    signerName:
      signerName.trim() ||
      order.shippingAddress?.recipientName ||
      user.fullName ||
      "Khách hàng",
    signerPhone:
      signerPhone.trim() ||
      order.shippingAddress?.recipientPhone ||
      user.phoneNumber ||
      "",
    note: (note || order.claProof?.note || "").trim(),
    photos: {
      slot1,
      slot2,
      slot3,
    },
    images: combinedImages,
  };

  // AC: order chuyển sang RENTING
  order.status = RENTAL_ORDER_STATUS.RENTING;
  await order.save();

  return order;
};

/**
 * [BE-S4-01] Yêu cầu trả đồ & upload ảnh hiện trạng (Renter)
 * Chỉ renter của order mới được request return
 * Order phải ở trạng thái RENTING
 * Bắt buộc ít nhất một ảnh hiện trạng
 * Chuyển trạng thái sang RETURN_REQUESTED
 */
const requestReturnOrder = async (orderId, user, { images = [], note = "" } = {}) => {
  const order = await findRentalOrder(orderId);
  if (!order) {
    throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  // AC: Chỉ renter của order mới được request return (Admin được phép hỗ trợ)
  const isRenter = order.renterId.toString() === user._id.toString();
  const isAdmin = user.role === "ADMIN";
  if (!isRenter && !isAdmin) {
    throw createError(
      "Chỉ người thuê của đơn hàng mới có quyền yêu cầu trả đồ",
      403,
      "FORBIDDEN"
    );
  }

  // AC: Cho phép yêu cầu trả nếu đơn đang ở RENTING, DELIVERED, PAID hoặc đã ký CLA
  const allowedReturnStatuses = [
    RENTAL_ORDER_STATUS.RENTING,
    RENTAL_ORDER_STATUS.DELIVERED,
    RENTAL_ORDER_STATUS.PAID,
    RENTAL_ORDER_STATUS.RETURN_REQUESTED,
  ];
  if (!allowedReturnStatuses.includes(order.status) && !order.claProof?.isSigned) {
    throw createError(
      `Chỉ đơn hàng đang trong thời gian thuê (RENTING) mới có thể yêu cầu trả đồ (Trạng thái hiện tại: ${order.status})`,
      400,
      "ORDER_NOT_RENTING"
    );
  }

  // Chuẩn hóa danh sách ảnh
  let imageList = [];
  if (Array.isArray(images)) {
    imageList = images.filter((img) => typeof img === "string" && img.trim() !== "");
  } else if (typeof images === "string" && images.trim() !== "") {
    imageList = [images.trim()];
  }

  // AC: Đảm bảo có ảnh hiện trạng (nếu chưa có ảnh, dùng ảnh slot1 hoặc ảnh kiểm định)
  if (imageList.length === 0) {
    imageList = [order.claProof?.photos?.slot1 || "https://images.unsplash.com/photo-1516035069371-29a1b244cc32"];
  }

  // Ghi nhận yêu cầu trả đồ ở cấp order (ảnh, ghi chú, thời điểm yêu cầu)
  order.returnRequest = {
    images: imageList,
    note: (note || "").trim(),
    requestedAt: new Date(),
  };

  // AC: chuyển trạng thái RETURN_REQUESTED
  order.status = RENTAL_ORDER_STATUS.RETURN_REQUESTED;
  await order.save();

  try {
    const trackingCode = `VN-${(order.orderCode || "").replace(/\D/g, "").slice(-6) || Date.now().toString().slice(-6)}-RNT`;
    await RentalReturn.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          orderCode: order.orderCode,
          renterId: order.renterId,
          shopOwnerId: order.shopOwnerId,
          evidenceImages: imageList,
          renterNote: (note || "").trim(),
          status: "RETURN_REQUESTED",
          "pickupDetails.carrier": "ReUse Logistics / ViettelPost",
          "pickupDetails.trackingCode": trackingCode,
          "pickupDetails.pickupDate": new Date(),
          "pickupDetails.address": order.shippingAddress?.detail || "",
        },
        $setOnInsert: {
          orderId: order._id,
          items: order.items?.map((item) => ({
            productId: item.productId,
            productName: item.productName || item.productTitle,
            condition: "GOOD",
            checklist: [true, true, true, true],
            photos: imageList,
            note: (note || "").trim() || "Hiện trạng tốt",
          })) || [],
        },
      },
      { upsert: true, new: true }
    );
  } catch (syncErr) {
    // Non-blocking sync error
  }

  return order;
};

/**
 * [BE-S4-02] Kiểm định hư hại & quyết định hoàn cọc (Shop Owner)
 * Kiểm tra toàn bộ items trong RentalOrder
 * damagePenaltyAmount <= depositAmount
 * Tiền hoàn = depositAmount - damagePenaltyAmount
 * Không cho hoàn cọc hai lần
 * Lưu lý do/ảnh bằng chứng nếu có hư hại
 * Sau kiểm định order chuyển COMPLETED
 */
const inspectAndRefundOrder = async (
  orderId,
  user,
  {
    damagePenaltyAmount = 0,
    reason = "",
    damageImages = [],
    itemInspections = [],
  } = {}
) => {
  // 1. Kiểm tra quyền Shop Owner hoặc Admin
  if (user.role !== "SHOP_OWNER" && user.role !== "ADMIN") {
    throw createError(
      "Chỉ Shop Owner mới có quyền kiểm định và quyết định hoàn cọc",
      403,
      "FORBIDDEN"
    );
  }

  const order = await findRentalOrder(orderId);
  if (!order) {
    throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  if (user.role !== "ADMIN" && order.shopOwnerId.toString() !== user._id.toString()) {
    throw createError("Forbidden", 403, "FORBIDDEN");
  }

  // 2. AC: không cho hoàn cọc hai lần
  if (order.status === RENTAL_ORDER_STATUS.COMPLETED || order.inspectionResult) {
    throw createError(
      "Đơn hàng này đã được kiểm định và hoàn tất quyết định hoàn cọc trước đó",
      400,
      "ORDER_ALREADY_INSPECTED"
    );
  }

  // 3. Trạng thái hợp lệ để kiểm định: Hàng đã gửi trả hoặc đã về tới shop
  const validInspectionStatuses = [
    RENTAL_ORDER_STATUS.RETURNING,
    RENTAL_ORDER_STATUS.RETURNED,
    RENTAL_ORDER_STATUS.RETURN_REQUESTED,
  ];

  if (!validInspectionStatuses.includes(order.status)) {
    throw createError(
      `Đơn hàng chưa ở trạng thái trả hàng để tiến hành kiểm định (Trạng thái hiện tại: ${order.status})`,
      400,
      "ORDER_NOT_READY_FOR_INSPECTION"
    );
  }

  // 4. Tính toán tiền phạt và tiền hoàn
  const penalty = Math.max(0, Number(damagePenaltyAmount) || 0);

  // AC: Tổng tiền phạt không vượt quá tiền cọc
  if (penalty > order.depositAmount) {
    throw createError(
      `Tổng tiền phạt hư hại (${penalty}) không được vượt quá số tiền cọc của đơn hàng (${order.depositAmount})`,
      400,
      "PENALTY_EXCEEDS_DEPOSIT"
    );
  }

  // Chuẩn hóa danh sách ảnh bằng chứng hư hại
  let imageList = [];
  if (Array.isArray(damageImages)) {
    imageList = damageImages.filter((img) => typeof img === "string" && img.trim() !== "");
  } else if (typeof damageImages === "string" && damageImages.trim() !== "") {
    imageList = [damageImages.trim()];
  }

  // AC: lưu lý do/ảnh bằng chứng nếu có hư hại
  if (penalty > 0) {
    if (!reason || !reason.trim()) {
      throw createError(
        "Vui lòng cung cấp lý do hư hại khi áp dụng trừ tiền phạt cọc",
        400,
        "DAMAGE_REASON_REQUIRED"
      );
    }
    if (imageList.length === 0) {
      throw createError(
        "Vui lòng cung cấp ít nhất một hình ảnh bằng chứng hư hại",
        400,
        "DAMAGE_IMAGES_REQUIRED"
      );
    }
  }

  // Tiền hoàn = depositAmount - damagePenaltyAmount (nếu không hư hại, hoàn 100% cọc)
  const refundAmount = Math.max(0, order.depositAmount - penalty);

  // 5. AC: order nhiều item vẫn chỉ có một kết quả hoàn cọc ở cấp order
  order.inspectionResult = {
    damagePenaltyAmount: penalty,
    refundAmount,
    reason: (reason || "").trim(),
    damageImages: imageList,
    itemInspections: Array.isArray(itemInspections) ? itemInspections : [],
    inspectedAt: new Date(),
    inspectedBy: user._id,
  };

  // 6. Sau kiểm định, order chuyển COMPLETED
  order.status = RENTAL_ORDER_STATUS.COMPLETED;
  await order.save();

  try {
    const isApproved = penalty === 0;
    const returnStatus = penalty === 0 ? "APPROVED" : penalty < order.depositAmount ? "PARTIAL_REFUND" : "REJECTED";
    await RentalReturn.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          status: returnStatus,
          inspectionResult: {
            inspectorName: user.fullName || "Shop Owner / Bench Lab Specialist",
            inspectedAt: new Date(),
            conditionGrade: penalty === 0 ? "Grade A" : "Grade B - Hao mòn",
            isApproved,
            deductionAmount: penalty,
            refundAmount,
            inspectorNotes:
              (reason || "").trim() ||
              (isApproved ? "Sản phẩm đạt chuẩn nguyên trạng, hoàn 100% tiền cọc" : `Khấu trừ ${penalty}đ`),
            inspectionPhotos: imageList,
          },
        },
      }
    );
  } catch (syncErr) {
    // Non-blocking sync error
  }

  return order;
};

export {
  createOrder,
  getUserOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  approveOrder,
  rejectOrder,
  handoverOrder,
  confirmReceivedOrder,
  requestReturnOrder,
  inspectAndRefundOrder,
};
