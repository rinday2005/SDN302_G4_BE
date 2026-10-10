import mongoose from "mongoose";
import RentalOrder, { canTransitionStatus } from "./order.model.js";
import RentalProduct from "../product/product.model.js";
import User from "../../user/user.model.js";
import { calculateShippingFee } from "../../../utils/shipping.js";

const DEFAULT_SHOP_PROVINCE = "Hồ Chí Minh";
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const createError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

const assertValidOrderId = (orderId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw createError("Invalid order id", 400, "INVALID_ORDER_ID");
  }
};

/**
 * Tạo đơn thuê mới chứa nhiều sản phẩm RENT của cùng 1 Shop Owner
 * items: [{ productId, quantity }]
 */
const createOrder = async ({
  renterId,
  items,
  startDate,
  endDate,
  shippingAddress,
}) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const rentalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY));

  // Gộp các item trùng productId
  const quantityByProduct = new Map();
  for (const item of items) {
    const key = item.productId.toString();
    quantityByProduct.set(key, (quantityByProduct.get(key) || 0) + Number(item.quantity));
  }

  const products = await RentalProduct.find({
    _id: { $in: [...quantityByProduct.keys()] },
    status: "APPROVED",
  });

  if (products.length !== quantityByProduct.size) {
    throw createError("Một hoặc nhiều sản phẩm không tồn tại hoặc chưa được duyệt", 404, "PRODUCT_NOT_FOUND");
  }

  // AC: shopOwnerId luôn là Shop Owner duy nhất
  const ownerIds = new Set(products.map((p) => p.ownerId.toString()));
  if (ownerIds.size !== 1) {
    throw createError("Tất cả sản phẩm trong đơn thuê phải thuộc cùng 1 Shop Owner", 400, "MULTIPLE_SHOP_OWNERS");
  }
  const shopOwnerId = [...ownerIds][0];

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

  const totalAmount = rentalFee + depositAmount + shippingFee;

  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderCode = `RO-${Date.now()}-${randomSuffix}`;

  return RentalOrder.create({
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
  });
};

/**
 * Lấy danh sách đơn thuê của Renter hiện tại
 */
const getUserOrders = async (renterId, { page = 1, limit = 10, status } = {}) => {
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
  assertValidOrderId(orderId);

  const order = await RentalOrder.findById(orderId)
    .populate("renterId", "fullName email phoneNumber")
    .populate("shopOwnerId", "fullName email phoneNumber");

  if (!order) {
    throw createError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const userId = user._id.toString();
  const isRenter = order.renterId._id.toString() === userId;
  const isShopOwner = order.shopOwnerId._id.toString() === userId;
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
  assertValidOrderId(orderId);

  const order = await RentalOrder.findById(orderId);
  if (!order) {
    throw createError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  if (user.role === "SHOP_OWNER" && order.shopOwnerId.toString() !== user._id.toString()) {
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

export {
  createOrder,
  getUserOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
};
