import mongoose from "mongoose";
import RentalOrder, { canTransitionStatus, RENTAL_ORDER_STATUS } from "./order.model.js";
import RentalProduct from "../product/product.model.js";
import Cart from "../../cart/cart.model.js";
import { removeRentItems } from "../../cart/cart.service.js";
import { checkRentalAvailability } from "../availability/availability.service.js";
import User from "../../user/user.model.js";
import { calculateShippingFee } from "../../../utils/shipping.js";

const DEFAULT_SHOP_PROVINCE = "HÃ¡Â»â€œ ChÃƒÂ­ Minh";
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const createError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

const assertValidOrderId = (orderId) => {
  if (!orderId) {
    throw createError("Invalid order id", 400, "INVALID_ORDER_ID");
  }
  const str = String(orderId).trim();
  if (!mongoose.Types.ObjectId.isValid(str) && !str.includes("RH-RNT-")) {
    throw createError("Invalid order id", 400, "INVALID_ORDER_ID");
  }
};

/**
 * Checkout RENT: tÃ¡ÂºÂ¡o Ã„â€˜ÃƒÂºng 1 RentalOrder cho toÃƒÂ n bÃ¡Â»â„¢ RENT items trong Cart cÃ¡Â»Â§a user
 */
const createOrder = async ({ user, startDate, endDate, shippingAddress }) => {
  // 1. User phÃ¡ÂºÂ£i Ã„â€˜Ã†Â°Ã¡Â»Â£c duyÃ¡Â»â€¡t KYC
  if (user.kycStatus !== "APPROVED") {
    throw createError("TÃƒÂ i khoÃ¡ÂºÂ£n cÃ¡ÂºÂ§n Ã„â€˜Ã†Â°Ã¡Â»Â£c duyÃ¡Â»â€¡t KYC trÃ†Â°Ã¡Â»â€ºc khi thuÃƒÂª", 403, "KYC_NOT_APPROVED");
  }

  // 2. AC: KhÃƒÂ´ng thÃ¡Â»Æ’ checkout nÃ¡ÂºÂ¿u Cart RENT trÃ¡Â»â€˜ng
  const cart = await Cart.findOne({ userId: user._id });
  const rentItems = cart?.rentItems || [];
  if (rentItems.length === 0) {
    throw createError("GiÃ¡Â»Â hÃƒÂ ng thuÃƒÂª Ã„â€˜ang trÃ¡Â»â€˜ng", 400, "EMPTY_RENT_CART");
  }

  const renterId = user._id;
  const start = new Date(startDate);
  const end = new Date(endDate);
  // SÃ¡Â»â€˜ ngÃƒÂ y thuÃƒÂª dÃƒÂ¹ng chung cho toÃƒÂ n bÃ¡Â»â„¢ RENT items
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
      "MÃ¡Â»â„¢t hoÃ¡ÂºÂ·c nhiÃ¡Â»Âu sÃ¡ÂºÂ£n phÃ¡ÂºÂ©m trong giÃ¡Â»Â khÃƒÂ´ng cÃƒÂ²n tÃ¡Â»â€œn tÃ¡ÂºÂ¡i hoÃ¡ÂºÂ·c chÃ†Â°a Ã„â€˜Ã†Â°Ã¡Â»Â£c duyÃ¡Â»â€¡t",
      404,
      "PRODUCT_NOT_FOUND"
    );
  }

  // AC: shopOwnerId luÃƒÂ´n lÃƒÂ  Shop Owner duy nhÃ¡ÂºÂ¥t
  const ownerIds = new Set(products.map((p) => p.ownerId.toString()));
  if (ownerIds.size !== 1) {
    throw createError("TÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ sÃ¡ÂºÂ£n phÃ¡ÂºÂ©m trong Ã„â€˜Ã†Â¡n thuÃƒÂª phÃ¡ÂºÂ£i thuÃ¡Â»â„¢c cÃƒÂ¹ng 1 Shop Owner", 400, "MULTIPLE_SHOP_OWNERS");
  }
  const shopOwnerId = [...ownerIds][0];

  // 3. AC: KhÃƒÂ´ng thÃ¡Â»Æ’ checkout khi mÃ¡Â»â„¢t item hÃ¡ÂºÂ¿t hÃƒÂ ng trong khoÃ¡ÂºÂ£ng ngÃƒÂ y thuÃƒÂª
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

  // Snapshot thÃƒÂ´ng tin sÃ¡ÂºÂ£n phÃ¡ÂºÂ©m tÃ¡ÂºÂ¡i thÃ¡Â»Âi Ã„â€˜iÃ¡Â»Æ’m Ã„â€˜Ã¡ÂºÂ·t
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
    };
  });

  const shopOwner = await User.findById(shopOwnerId).select("address");
  const shopProvince = shopOwner?.address?.province || DEFAULT_SHOP_PROVINCE;

  let shippingFee;
  try {
    shippingFee = calculateShippingFee(shopProvince, shippingAddress.province);
  } catch (error) {
    // TÃ¡Â»â€°nh thÃƒÂ nh chÃ†Â°a chuÃ¡ÂºÂ©n theo mapping thÃƒÂ¬ ÃƒÂ¡p dÃ¡Â»Â¥ng phÃƒÂ­ vÃƒÂ¹ng tiÃƒÂªu chuÃ¡ÂºÂ©n
    shippingFee = 35000;
  }

  // AC: totalAmount = tÃ¡Â»â€¢ng chi phÃƒÂ­ tÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ item (thuÃƒÂª + cÃ¡Â»Âc) + shipping (tÃƒÂ­nh 1 lÃ¡ÂºÂ§n)
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
    // AC: order ban Ã„â€˜Ã¡ÂºÂ§u PENDING
    status: RENTAL_ORDER_STATUS.PENDING,
  });

  // 4. LoÃ¡ÂºÂ¡i cÃƒÂ¡c RENT items Ã„â€˜ÃƒÂ£ checkout khÃ¡Â»Âi Cart
  await removeRentItems(
    renterId,
    products.map((p) => p._id)
  );

  return order;
};

/**
 * LÃ¡ÂºÂ¥y danh sÃƒÂ¡ch Ã„â€˜Ã†Â¡n thuÃƒÂª cÃ¡Â»Â§a Renter hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i
 */
const getUserOrders = async (renterId, { page = 1, limit = 10, status } = {}) => {
  try { await RentalOrder.updateMany({ renterId, status: "PAID", "claProof.isSigned": true }, { $set: { status: "RENTING" } }); await RentalOrder.updateMany({ renterId, status: "PAID" }, { $set: { status: "DELIVERED" } }); } catch (e) {}
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
 * LÃ¡ÂºÂ¥y chi tiÃ¡ÂºÂ¿t Ã„â€˜Ã†Â¡n thuÃƒÂª
 */
const getOrderById = async (orderId, user) => {
  assertValidOrderId(orderId);

  let order = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await RentalOrder.findById(orderId)
      .populate("renterId", "fullName email phoneNumber")
      .populate("shopOwnerId", "fullName email phoneNumber");
  }
  if (!order) {
    const clean = String(orderId).trim().replace("#", "");
    order = await RentalOrder.findOne({
      $or: [{ orderCode: orderId }, { orderCode: `#${clean}` }, { orderCode: clean }],
    })
      .populate("renterId", "fullName email phoneNumber")
      .populate("shopOwnerId", "fullName email phoneNumber");
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
 * LÃ¡ÂºÂ¥y danh sÃƒÂ¡ch Ã„â€˜Ã†Â¡n thuÃƒÂª cÃ¡Â»Â§a shop (SHOP_OWNER chÃ¡Â»â€° thÃ¡ÂºÂ¥y Ã„â€˜Ã†Â¡n cÃ¡Â»Â§a mÃƒÂ¬nh, ADMIN thÃ¡ÂºÂ¥y tÃ¡ÂºÂ¥t cÃ¡ÂºÂ£)
 */
const getAllOrders = async (user, { page = 1, limit = 10, status } = {}) => {
  const query = {};
  if (user.role === "SHOP_OWNER") query.shopOwnerId = user._id;
  if (status) query.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [orders, total] = await Promise.all([
    RentalOrder.find(query)
      .populate("renterId", "fullName email phoneNumber")
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
 * CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t trÃ¡ÂºÂ¡ng thÃƒÂ¡i Ã„â€˜Ã†Â¡n thuÃƒÂª theo vÃƒÂ²ng Ã„â€˜Ã¡Â»Âi hÃ¡Â»Â£p lÃ¡Â»â€¡
 */
const updateOrderStatus = async (orderId, status, user) => {
  assertValidOrderId(orderId);

  const order = await RentalOrder.findById(orderId);
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
      `KhÃƒÂ´ng thÃ¡Â»Æ’ chuyÃ¡Â»Æ’n trÃ¡ÂºÂ¡ng thÃƒÂ¡i tÃ¡Â»Â« ${order.status} sang ${status}`,
      400,
      "INVALID_STATUS_TRANSITION"
    );
  }

  order.status = status;
  await order.save();

  return order;
};

/**
 * HÃ¡Â»Â§y Ã„â€˜Ã†Â¡n thuÃƒÂª
 */
const cancelOrder = async (orderId, user) => {
  assertValidOrderId(orderId);

  const order = await RentalOrder.findById(orderId);
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

  // Renter chÃ¡Â»â€° Ã„â€˜Ã†Â°Ã¡Â»Â£c hÃ¡Â»Â§y khi Ã„â€˜Ã†Â¡n cÃƒÂ²n PENDING
  if (isRenter && !isShopOwner && !isAdmin && order.status !== "PENDING") {
    throw createError("Cannot cancel order that has already been processed", 400, "ORDER_CANNOT_BE_CANCELLED");
  }

  if (!canTransitionStatus(order.status, "CANCELLED")) {
    throw createError(`KhÃƒÂ´ng thÃ¡Â»Æ’ hÃ¡Â»Â§y Ã„â€˜Ã†Â¡n Ã¡Â»Å¸ trÃ¡ÂºÂ¡ng thÃƒÂ¡i ${order.status}`, 400, "ORDER_CANNOT_BE_CANCELLED");
  }

  order.status = "CANCELLED";
  await order.save();

  return order;
};

/**
 * PhÃƒÂª duyÃ¡Â»â€¡t Ã„â€˜Ã†Â¡n thuÃƒÂª (ChÃ¡Â»â€° Shop Owner duy nhÃ¡ÂºÂ¥t cÃ¡Â»Â§a hÃ¡Â»â€¡ thÃ¡Â»â€˜ng)
 * ChuyÃ¡Â»Æ’n trÃ¡ÂºÂ¡ng thÃƒÂ¡i Ã„â€˜Ã†Â¡n sang WAITING_PAYMENT
 */
const approveOrder = async (orderId, user) => {
  assertValidOrderId(orderId);

  if (user.role !== "SHOP_OWNER") {
    throw createError("ChÃ¡Â»â€° Shop Owner mÃ¡Â»â€ºi cÃƒÂ³ quyÃ¡Â»Ân phÃƒÂª duyÃ¡Â»â€¡t Ã„â€˜Ã†Â¡n thuÃƒÂª", 403, "FORBIDDEN");
  }

  const order = await RentalOrder.findById(orderId);
  if (!order) {
    throw createError("Order not found", 404, "ORDER_NOT_FOUND");
  }
  

  if (order.shopOwnerId.toString() !== user._id.toString()) {
    throw createError("Forbidden", 403, "FORBIDDEN");
  }

  // AC: order Ã„â€˜ÃƒÂ£ xÃ¡Â»Â­ lÃƒÂ½ khÃƒÂ´ng thÃ¡Â»Æ’ approve/reject lÃ¡ÂºÂ¡i
  if (order.status !== RENTAL_ORDER_STATUS.PENDING) {
    throw createError(
      `Ã„ÂÃ†Â¡n hÃƒÂ ng Ã„â€˜ÃƒÂ£ Ã„â€˜Ã†Â°Ã¡Â»Â£c xÃ¡Â»Â­ lÃƒÂ½ hoÃ¡ÂºÂ·c khÃƒÂ´ng Ã¡Â»Å¸ trÃ¡ÂºÂ¡ng thÃƒÂ¡i chÃ¡Â»Â duyÃ¡Â»â€¡t (TrÃ¡ÂºÂ¡ng thÃƒÂ¡i hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i: ${order.status})`,
      400,
      "ORDER_ALREADY_PROCESSED"
    );
  }

  // AC: khi approve toÃƒÂ n bÃ¡Â»â„¢ Ã„â€˜Ã†Â¡n chuyÃ¡Â»Æ’n WAITING_PAYMENT (toÃƒÂ n bÃ¡Â»â„¢ items cÃƒÂ¹ng Ã„â€˜Ã†Â°Ã¡Â»Â£c xÃ¡Â»Â­ lÃƒÂ½)
  order.status = RENTAL_ORDER_STATUS.WAITING_PAYMENT;
  await order.save();

  return order;
};

/**
 * TÃ¡Â»Â« chÃ¡Â»â€˜i Ã„â€˜Ã†Â¡n thuÃƒÂª (ChÃ¡Â»â€° Shop Owner duy nhÃ¡ÂºÂ¥t cÃ¡Â»Â§a hÃ¡Â»â€¡ thÃ¡Â»â€˜ng)
 * ChuyÃ¡Â»Æ’n trÃ¡ÂºÂ¡ng thÃƒÂ¡i Ã„â€˜Ã†Â¡n sang REJECTED vÃƒÂ  giÃ¡ÂºÂ£i phÃƒÂ³ng reservation
 */
const rejectOrder = async (orderId, user, { reason = "" } = {}) => {
  assertValidOrderId(orderId);

  if (user.role !== "SHOP_OWNER") {
    throw createError("ChÃ¡Â»â€° Shop Owner mÃ¡Â»â€ºi cÃƒÂ³ quyÃ¡Â»Ân tÃ¡Â»Â« chÃ¡Â»â€˜i Ã„â€˜Ã†Â¡n thuÃƒÂª", 403, "FORBIDDEN");
  }

  const order = await RentalOrder.findById(orderId);
  if (!order) {
    throw createError("Order not found", 404, "ORDER_NOT_FOUND");
  }
  

  if (order.shopOwnerId.toString() !== user._id.toString()) {
    throw createError("Forbidden", 403, "FORBIDDEN");
  }

  // AC: order Ã„â€˜ÃƒÂ£ xÃ¡Â»Â­ lÃƒÂ½ khÃƒÂ´ng thÃ¡Â»Æ’ approve/reject lÃ¡ÂºÂ¡i
  if (order.status !== RENTAL_ORDER_STATUS.PENDING) {
    throw createError(
      `Ã„ÂÃ†Â¡n hÃƒÂ ng Ã„â€˜ÃƒÂ£ Ã„â€˜Ã†Â°Ã¡Â»Â£c xÃ¡Â»Â­ lÃƒÂ½ hoÃ¡ÂºÂ·c khÃƒÂ´ng Ã¡Â»Å¸ trÃ¡ÂºÂ¡ng thÃƒÂ¡i chÃ¡Â»Â duyÃ¡Â»â€¡t (TrÃ¡ÂºÂ¡ng thÃƒÂ¡i hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i: ${order.status})`,
      400,
      "ORDER_ALREADY_PROCESSED"
    );
  }

  // AC: khi reject toÃƒÂ n bÃ¡Â»â„¢ Ã„â€˜Ã†Â¡n chuyÃ¡Â»Æ’n REJECTED vÃƒÂ  giÃ¡ÂºÂ£i phÃƒÂ³ng reservation
  order.status = RENTAL_ORDER_STATUS.REJECTED;
  if (reason) {
    order.rejectionReason = reason.trim();
  }
  await order.save();

  return order;
};

/**
 * [BE-S3-06] CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t trÃ¡ÂºÂ¡ng thÃƒÂ¡i giao hÃƒÂ ng / bÃƒÂ n giao (Shop Owner)
 * ChÃ¡Â»â€° order PAID mÃ¡Â»â€ºi Ã„â€˜Ã†Â°Ã¡Â»Â£c chuyÃ¡Â»Æ’n sang READY_FOR_HANDOVER hoÃ¡ÂºÂ·c HANDED_OVER
 */
const handoverOrder = async (
  orderId,
  user,
  { carrierName, trackingCode, status = RENTAL_ORDER_STATUS.HANDED_OVER } = {}
) => {
  assertValidOrderId(orderId);

  if (user.role !== "SHOP_OWNER") {
    throw createError("ChÃ¡Â»â€° Shop Owner mÃ¡Â»â€ºi cÃƒÂ³ quyÃ¡Â»Ân cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t trÃ¡ÂºÂ¡ng thÃƒÂ¡i bÃƒÂ n giao", 403, "FORBIDDEN");
  }

  const order = await RentalOrder.findById(orderId);
  if (!order) {
    throw createError("Order not found", 404, "ORDER_NOT_FOUND");
  }
  

  if (order.shopOwnerId.toString() !== user._id.toString()) {
    throw createError("Forbidden", 403, "FORBIDDEN");
  }

  // AC: KhÃƒÂ´ng cho cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t order chÃ†Â°a thanh toÃƒÂ¡n
  const validCurrentStatuses = [
    RENTAL_ORDER_STATUS.PAID,
    RENTAL_ORDER_STATUS.READY_FOR_HANDOVER,
  ];

  if (!validCurrentStatuses.includes(order.status)) {
    throw createError(
      `ChÃ¡Â»â€° Ã„â€˜Ã†Â¡n hÃƒÂ ng Ã„â€˜ÃƒÂ£ thanh toÃƒÂ¡n (PAID) mÃ¡Â»â€ºi cÃƒÂ³ thÃ¡Â»Æ’ bÃƒÂ n giao vÃ¡ÂºÂ­n chuyÃ¡Â»Æ’n (TrÃ¡ÂºÂ¡ng thÃƒÂ¡i hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i: ${order.status})`,
      400,
      "ORDER_NOT_PAID"
    );
  }

  const targetStatus =
    status === RENTAL_ORDER_STATUS.READY_FOR_HANDOVER
      ? RENTAL_ORDER_STATUS.READY_FOR_HANDOVER
      : RENTAL_ORDER_STATUS.HANDED_OVER;

  // AC: LÃ†Â°u carrier/tracking code Ã¡Â»Å¸ cÃ¡ÂºÂ¥p order
  order.shippingDetails = {
    ...(order.shippingDetails?.toObject ? order.shippingDetails.toObject() : order.shippingDetails),
    carrier: carrierName.trim(),
    carrierName: carrierName.trim(),
    trackingCode: trackingCode.trim(),
    shippedAt: order.shippingDetails?.shippedAt || new Date(),
  };

  // AC: order chuyÃ¡Â»Æ’n Ã„â€˜ÃƒÂºng trÃ¡ÂºÂ¡ng thÃƒÂ¡i
  order.status = targetStatus;
  await order.save();

  return order;
};

/**
 * [BE-S3-07] XÃƒÂ¡c nhÃ¡ÂºÂ­n Ã„â€˜ÃƒÂ£ nhÃ¡ÂºÂ­n Ã„â€˜Ã¡Â»â€œ & bÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u tÃƒÂ­nh thÃ¡Â»Âi gian thuÃƒÂª (Renter)
 * ChÃ¡Â»â€° renterId cÃ¡Â»Â§a order mÃ¡Â»â€ºi Ã„â€˜Ã†Â°Ã¡Â»Â£c xÃƒÂ¡c nhÃ¡ÂºÂ­n
 * ChuyÃ¡Â»Æ’n trÃ¡ÂºÂ¡ng thÃƒÂ¡i sang RENTING vÃƒÂ  lÃ†Â°u timestamp receivedAt
 */
const confirmReceivedOrder = async (orderId, user, payload = {}) => {
  assertValidOrderId(orderId);

  let order = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await RentalOrder.findById(orderId);
  }
  if (!order) {
    const clean = String(orderId).trim().replace("#", "");
    order = await RentalOrder.findOne({
      $or: [{ orderCode: orderId }, { orderCode: `#${clean}` }, { orderCode: clean }],
    });
  }
  if (!order) {
    throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  // AC: ChÃ¡Â»â€° renterId cÃ¡Â»Â§a order mÃ¡Â»â€ºi Ã„â€˜Ã†Â°Ã¡Â»Â£c xÃƒÂ¡c nhÃ¡ÂºÂ­n (User khÃƒÂ¡c khÃƒÂ´ng thÃ¡Â»Æ’ gÃ¡Â»Âi API)
  if (order.renterId.toString() !== user._id.toString()) {
    throw createError(
      "ChÃ¡Â»â€° ngÃ†Â°Ã¡Â»Âi thuÃƒÂª cÃ¡Â»Â§a Ã„â€˜Ã†Â¡n hÃƒÂ ng mÃ¡Â»â€ºi cÃƒÂ³ quyÃ¡Â»Ân xÃƒÂ¡c nhÃ¡ÂºÂ­n Ã„â€˜ÃƒÂ£ nhÃ¡ÂºÂ­n Ã„â€˜Ã¡Â»â€œ",
      403,
      "FORBIDDEN"
    );
  }

  // AC: order chÃ¡Â»â€° chuyÃ¡Â»Æ’n RENTING tÃ¡Â»Â« trÃ¡ÂºÂ¡ng thÃƒÂ¡i hÃ¡Â»Â£p lÃ¡Â»â€¡
  const validCurrentStatuses = [
    RENTAL_ORDER_STATUS.PAID,
    RENTAL_ORDER_STATUS.READY_FOR_HANDOVER,
    RENTAL_ORDER_STATUS.HANDED_OVER,
    RENTAL_ORDER_STATUS.SHIPPING,
    RENTAL_ORDER_STATUS.DELIVERED,
    RENTAL_ORDER_STATUS.RENTING,
  ];

  if (!validCurrentStatuses.includes(order.status)) {
    throw createError(
      `Ã„ÂÃ†Â¡n hÃƒÂ ng chÃ†Â°a Ã¡Â»Å¸ trÃ¡ÂºÂ¡ng thÃƒÂ¡i vÃ¡ÂºÂ­n chuyÃ¡Â»Æ’n Ã„â€˜Ã¡Â»Æ’ xÃƒÂ¡c nhÃ¡ÂºÂ­n nhÃ¡ÂºÂ­n hÃƒÂ ng (TrÃ¡ÂºÂ¡ng thÃƒÂ¡i hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i: ${order.status})`,
      400,
      "ORDER_NOT_READY_TO_RECEIVE"
    );
  }

  const receivedTimestamp = order.receivedAt || new Date();

  // AC: lÃ†Â°u timestamp xÃƒÂ¡c nhÃ¡ÂºÂ­n (bÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u tÃƒÂ­nh thÃ¡Â»Âi gian thuÃƒÂª thÃ¡Â»Â±c tÃ¡ÂºÂ¿)
  order.receivedAt = receivedTimestamp;
  if (order.shippingDetails) {
    order.shippingDetails.deliveredAt = order.shippingDetails.deliveredAt || receivedTimestamp;
  }

  // LÃ†Â°u biÃƒÂªn bÃ¡ÂºÂ£n bÃƒÂ n giao CLA vÃƒÂ  nhÃ¡ÂºÂ­t kÃƒÂ½ Ã„â€˜Ã¡Â»â€˜i kiÃ¡Â»Æ’m 3 gÃƒÂ³c
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
      "KhÃƒÂ¡ch hÃƒÂ ng",
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

  // AC: order chuyÃ¡Â»Æ’n sang RENTING
  order.status = RENTAL_ORDER_STATUS.RENTING;
  await order.save();

  return order;
};

/**
 * [BE-S4-01] YÃƒÂªu cÃ¡ÂºÂ§u trÃ¡ÂºÂ£ Ã„â€˜Ã¡Â»â€œ & upload Ã¡ÂºÂ£nh hiÃ¡Â»â€¡n trÃ¡ÂºÂ¡ng (Renter)
 * ChÃ¡Â»â€° renter cÃ¡Â»Â§a order mÃ¡Â»â€ºi Ã„â€˜Ã†Â°Ã¡Â»Â£c request return
 * Order phÃ¡ÂºÂ£i Ã¡Â»Å¸ trÃ¡ÂºÂ¡ng thÃƒÂ¡i RENTING
 * BÃ¡ÂºÂ¯t buÃ¡Â»â„¢c ÃƒÂ­t nhÃ¡ÂºÂ¥t mÃ¡Â»â„¢t Ã¡ÂºÂ£nh hiÃ¡Â»â€¡n trÃ¡ÂºÂ¡ng
 * ChuyÃ¡Â»Æ’n trÃ¡ÂºÂ¡ng thÃƒÂ¡i sang RETURN_REQUESTED
 */
const requestReturnOrder = async (orderId, user, { images = [], note = "" } = {}) => {
  assertValidOrderId(orderId);

  let order = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await RentalOrder.findById(orderId);
  }
  if (!order) {
    const clean = String(orderId).trim().replace("#", "");
    order = await RentalOrder.findOne({
      $or: [{ orderCode: orderId }, { orderCode: `#${clean}` }, { orderCode: clean }],
    });
  }
  if (!order) {
    throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  // AC: ChÃ¡Â»â€° renter cÃ¡Â»Â§a order mÃ¡Â»â€ºi Ã„â€˜Ã†Â°Ã¡Â»Â£c request return
  if (order.renterId.toString() !== user._id.toString()) {
    throw createError(
      "ChÃ¡Â»â€° ngÃ†Â°Ã¡Â»Âi thuÃƒÂª cÃ¡Â»Â§a Ã„â€˜Ã†Â¡n hÃƒÂ ng mÃ¡Â»â€ºi cÃƒÂ³ quyÃ¡Â»Ân yÃƒÂªu cÃ¡ÂºÂ§u trÃ¡ÂºÂ£ Ã„â€˜Ã¡Â»â€œ",
      403,
      "FORBIDDEN"
    );
  }

  // AC: order phÃ¡ÂºÂ£i Ã¡Â»Å¸ RENTING
  if (order.status !== RENTAL_ORDER_STATUS.RENTING) {
    throw createError(
      `ChÃ¡Â»â€° Ã„â€˜Ã†Â¡n hÃƒÂ ng Ã„â€˜ang trong thÃ¡Â»Âi gian thuÃƒÂª (RENTING) mÃ¡Â»â€ºi cÃƒÂ³ thÃ¡Â»Æ’ yÃƒÂªu cÃ¡ÂºÂ§u trÃ¡ÂºÂ£ Ã„â€˜Ã¡Â»â€œ (TrÃ¡ÂºÂ¡ng thÃƒÂ¡i hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i: ${order.status})`,
      400,
      "ORDER_NOT_RENTING"
    );
  }

  // ChuÃ¡ÂºÂ©n hÃƒÂ³a danh sÃƒÂ¡ch Ã¡ÂºÂ£nh
  let imageList = [];
  if (Array.isArray(images)) {
    imageList = images.filter((img) => typeof img === "string" && img.trim() !== "");
  } else if (typeof images === "string" && images.trim() !== "") {
    imageList = [images.trim()];
  }

  // AC: BÃ¡ÂºÂ¯t buÃ¡Â»â„¢c ÃƒÂ­t nhÃ¡ÂºÂ¥t mÃ¡Â»â„¢t Ã¡ÂºÂ£nh
  if (imageList.length === 0) {
    throw createError(
      "BÃ¡ÂºÂ¯t buÃ¡Â»â„¢c phÃ¡ÂºÂ£i cung cÃ¡ÂºÂ¥p ÃƒÂ­t nhÃ¡ÂºÂ¥t mÃ¡Â»â„¢t hÃƒÂ¬nh Ã¡ÂºÂ£nh hiÃ¡Â»â€¡n trÃ¡ÂºÂ¡ng sÃ¡ÂºÂ£n phÃ¡ÂºÂ©m khi yÃƒÂªu cÃ¡ÂºÂ§u trÃ¡ÂºÂ£ Ã„â€˜Ã¡Â»â€œ",
      400,
      "IMAGES_REQUIRED"
    );
  }

  // Ghi nhÃ¡ÂºÂ­n yÃƒÂªu cÃ¡ÂºÂ§u trÃ¡ÂºÂ£ Ã„â€˜Ã¡Â»â€œ Ã¡Â»Å¸ cÃ¡ÂºÂ¥p order (Ã¡ÂºÂ£nh, ghi chÃƒÂº, thÃ¡Â»Âi Ã„â€˜iÃ¡Â»Æ’m yÃƒÂªu cÃ¡ÂºÂ§u)
  order.returnRequest = {
    images: imageList,
    note: (note || "").trim(),
    requestedAt: new Date(),
  };

  // AC: chuyÃ¡Â»Æ’n trÃ¡ÂºÂ¡ng thÃƒÂ¡i RETURN_REQUESTED
  order.status = RENTAL_ORDER_STATUS.RETURN_REQUESTED;
  await order.save();

  return order;
};

/**
 * [BE-S4-02] KiÃ¡Â»Æ’m Ã„â€˜Ã¡Â»â€¹nh hÃ†Â° hÃ¡ÂºÂ¡i & quyÃ¡ÂºÂ¿t Ã„â€˜Ã¡Â»â€¹nh hoÃƒÂ n cÃ¡Â»Âc (Shop Owner)
 * KiÃ¡Â»Æ’m tra toÃƒÂ n bÃ¡Â»â„¢ items trong RentalOrder
 * damagePenaltyAmount <= depositAmount
 * TiÃ¡Â»Ân hoÃƒÂ n = depositAmount - damagePenaltyAmount
 * KhÃƒÂ´ng cho hoÃƒÂ n cÃ¡Â»Âc hai lÃ¡ÂºÂ§n
 * LÃ†Â°u lÃƒÂ½ do/Ã¡ÂºÂ£nh bÃ¡ÂºÂ±ng chÃ¡Â»Â©ng nÃ¡ÂºÂ¿u cÃƒÂ³ hÃ†Â° hÃ¡ÂºÂ¡i
 * Sau kiÃ¡Â»Æ’m Ã„â€˜Ã¡Â»â€¹nh order chuyÃ¡Â»Æ’n COMPLETED
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
  assertValidOrderId(orderId);

  // 1. KiÃ¡Â»Æ’m tra quyÃ¡Â»Ân Shop Owner
  if (user.role !== "SHOP_OWNER") {
    throw createError(
      "ChÃ¡Â»â€° Shop Owner mÃ¡Â»â€ºi cÃƒÂ³ quyÃ¡Â»Ân kiÃ¡Â»Æ’m Ã„â€˜Ã¡Â»â€¹nh vÃƒÂ  quyÃ¡ÂºÂ¿t Ã„â€˜Ã¡Â»â€¹nh hoÃƒÂ n cÃ¡Â»Âc",
      403,
      "FORBIDDEN"
    );
  }

  const order = await RentalOrder.findById(orderId);
  if (!order) {
    throw createError("Ã„ÂÃ†Â¡n hÃƒÂ ng khÃƒÂ´ng tÃ¡Â»â€œn tÃ¡ÂºÂ¡i", 404, "ORDER_NOT_FOUND");
  }

  if (order.shopOwnerId.toString() !== user._id.toString()) {
    throw createError("Forbidden", 403, "FORBIDDEN");
  }

  // 2. AC: khÃƒÂ´ng cho hoÃƒÂ n cÃ¡Â»Âc hai lÃ¡ÂºÂ§n
  if (order.status === RENTAL_ORDER_STATUS.COMPLETED || order.inspectionResult) {
    throw createError(
      "Ã„ÂÃ†Â¡n hÃƒÂ ng nÃƒÂ y Ã„â€˜ÃƒÂ£ Ã„â€˜Ã†Â°Ã¡Â»Â£c kiÃ¡Â»Æ’m Ã„â€˜Ã¡Â»â€¹nh vÃƒÂ  hoÃƒÂ n tÃ¡ÂºÂ¥t quyÃ¡ÂºÂ¿t Ã„â€˜Ã¡Â»â€¹nh hoÃƒÂ n cÃ¡Â»Âc trÃ†Â°Ã¡Â»â€ºc Ã„â€˜ÃƒÂ³",
      400,
      "ORDER_ALREADY_INSPECTED"
    );
  }

  // 3. TrÃ¡ÂºÂ¡ng thÃƒÂ¡i hÃ¡Â»Â£p lÃ¡Â»â€¡ Ã„â€˜Ã¡Â»Æ’ kiÃ¡Â»Æ’m Ã„â€˜Ã¡Â»â€¹nh: HÃƒÂ ng Ã„â€˜ÃƒÂ£ gÃ¡Â»Â­i trÃ¡ÂºÂ£ hoÃ¡ÂºÂ·c Ã„â€˜ÃƒÂ£ vÃ¡Â»Â tÃ¡Â»â€ºi shop
  const validInspectionStatuses = [
    RENTAL_ORDER_STATUS.RETURNING,
    RENTAL_ORDER_STATUS.RETURNED,
    RENTAL_ORDER_STATUS.RETURN_REQUESTED,
  ];

  if (!validInspectionStatuses.includes(order.status)) {
    throw createError(
      `Ã„ÂÃ†Â¡n hÃƒÂ ng chÃ†Â°a Ã¡Â»Å¸ trÃ¡ÂºÂ¡ng thÃƒÂ¡i trÃ¡ÂºÂ£ hÃƒÂ ng Ã„â€˜Ã¡Â»Æ’ tiÃ¡ÂºÂ¿n hÃƒÂ nh kiÃ¡Â»Æ’m Ã„â€˜Ã¡Â»â€¹nh (TrÃ¡ÂºÂ¡ng thÃƒÂ¡i hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i: ${order.status})`,
      400,
      "ORDER_NOT_READY_FOR_INSPECTION"
    );
  }

  // 4. TÃƒÂ­nh toÃƒÂ¡n tiÃ¡Â»Ân phÃ¡ÂºÂ¡t vÃƒÂ  tiÃ¡Â»Ân hoÃƒÂ n
  const penalty = Math.max(0, Number(damagePenaltyAmount) || 0);

  // AC: TÃ¡Â»â€¢ng tiÃ¡Â»Ân phÃ¡ÂºÂ¡t khÃƒÂ´ng vÃ†Â°Ã¡Â»Â£t quÃƒÂ¡ tiÃ¡Â»Ân cÃ¡Â»Âc
  if (penalty > order.depositAmount) {
    throw createError(
      `TÃ¡Â»â€¢ng tiÃ¡Â»Ân phÃ¡ÂºÂ¡t hÃ†Â° hÃ¡ÂºÂ¡i (${penalty}) khÃƒÂ´ng Ã„â€˜Ã†Â°Ã¡Â»Â£c vÃ†Â°Ã¡Â»Â£t quÃƒÂ¡ sÃ¡Â»â€˜ tiÃ¡Â»Ân cÃ¡Â»Âc cÃ¡Â»Â§a Ã„â€˜Ã†Â¡n hÃƒÂ ng (${order.depositAmount})`,
      400,
      "PENALTY_EXCEEDS_DEPOSIT"
    );
  }

  // ChuÃ¡ÂºÂ©n hÃƒÂ³a danh sÃƒÂ¡ch Ã¡ÂºÂ£nh bÃ¡ÂºÂ±ng chÃ¡Â»Â©ng hÃ†Â° hÃ¡ÂºÂ¡i
  let imageList = [];
  if (Array.isArray(damageImages)) {
    imageList = damageImages.filter((img) => typeof img === "string" && img.trim() !== "");
  } else if (typeof damageImages === "string" && damageImages.trim() !== "") {
    imageList = [damageImages.trim()];
  }

  // AC: lÃ†Â°u lÃƒÂ½ do/Ã¡ÂºÂ£nh bÃ¡ÂºÂ±ng chÃ¡Â»Â©ng nÃ¡ÂºÂ¿u cÃƒÂ³ hÃ†Â° hÃ¡ÂºÂ¡i
  if (penalty > 0) {
    if (!reason || !reason.trim()) {
      throw createError(
        "Vui lÃƒÂ²ng cung cÃ¡ÂºÂ¥p lÃƒÂ½ do hÃ†Â° hÃ¡ÂºÂ¡i khi ÃƒÂ¡p dÃ¡Â»Â¥ng trÃ¡Â»Â« tiÃ¡Â»Ân phÃ¡ÂºÂ¡t cÃ¡Â»Âc",
        400,
        "DAMAGE_REASON_REQUIRED"
      );
    }
    if (imageList.length === 0) {
      throw createError(
        "Vui lÃƒÂ²ng cung cÃ¡ÂºÂ¥p ÃƒÂ­t nhÃ¡ÂºÂ¥t mÃ¡Â»â„¢t hÃƒÂ¬nh Ã¡ÂºÂ£nh bÃ¡ÂºÂ±ng chÃ¡Â»Â©ng hÃ†Â° hÃ¡ÂºÂ¡i",
        400,
        "DAMAGE_IMAGES_REQUIRED"
      );
    }
  }

  // TiÃ¡Â»Ân hoÃƒÂ n = depositAmount - damagePenaltyAmount (nÃ¡ÂºÂ¿u khÃƒÂ´ng hÃ†Â° hÃ¡ÂºÂ¡i, hoÃƒÂ n 100% cÃ¡Â»Âc)
  const refundAmount = Math.max(0, order.depositAmount - penalty);

  // 5. AC: order nhiÃ¡Â»Âu item vÃ¡ÂºÂ«n chÃ¡Â»â€° cÃƒÂ³ mÃ¡Â»â„¢t kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ hoÃƒÂ n cÃ¡Â»Âc Ã¡Â»Å¸ cÃ¡ÂºÂ¥p order
  order.inspectionResult = {
    damagePenaltyAmount: penalty,
    refundAmount,
    reason: (reason || "").trim(),
    damageImages: imageList,
    itemInspections: Array.isArray(itemInspections) ? itemInspections : [],
    inspectedAt: new Date(),
    inspectedBy: user._id,
  };

  // 6. Sau kiÃ¡Â»Æ’m Ã„â€˜Ã¡Â»â€¹nh, order chuyÃ¡Â»Æ’n COMPLETED
  order.status = RENTAL_ORDER_STATUS.COMPLETED;
  await order.save();

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
