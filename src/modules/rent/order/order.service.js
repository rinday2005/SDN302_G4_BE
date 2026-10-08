import mongoose from "mongoose";
import Order from "./order.model.js";
import User from "../../user/user.model.js";
import { calculateShippingFee } from "../../../utils/shipping.js";

const DEFAULT_SHOP_PROVINCE = "Hồ Chí Minh";

/**
 * Tạo đơn hàng mới hỗ trợ thanh toán nhiều món đồ cùng lúc (Multi-item checkout)
 */
const createOrder = async ({
  userId,
  items,
  shippingAddress,
  paymentMethod = "COD",
  note = "",
}) => {
  // Lấy thông tin Shop Owner duy nhất trong hệ thống để xác định vị trí shop tính phí ship
  const shopOwner = await User.findOne({ role: "SHOP_OWNER" });
  const shopProvince = shopOwner?.address?.province || DEFAULT_SHOP_PROVINCE;

  // Tính phí vận chuyển theo khu vực giữa địa chỉ shop và địa chỉ khách hàng
  let shippingFee = 30000;
  try {
    shippingFee = calculateShippingFee(shopProvince, shippingAddress.province);
  } catch (error) {
    // Nếu tỉnh thành nhập chưa chuẩn theo mapping thì áp dụng phí vùng tiêu chuẩn
    shippingFee = 35000;
  }

  let subtotal = 0;
  let totalDeposit = 0;

  // Xử lý tính toán từng món đồ trong danh sách items
  const processedItems = items.map((item) => {
    const orderType = item.orderType || "RENT";
    const quantity = Number(item.quantity) || 1;
    const price = Number(item.price) || 0;
    const depositPerItem = orderType === "RENT" ? Number(item.deposit || 0) : 0;

    let rentalDays = 1;
    let itemSubtotal = 0;

    if (orderType === "RENT") {
      const startDate = new Date(item.rentalStartDate);
      const endDate = new Date(item.rentalEndDate);
      const diffTime = endDate.getTime() - startDate.getTime();
      rentalDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      itemSubtotal = price * rentalDays * quantity;
    } else {
      rentalDays = 0;
      itemSubtotal = price * quantity;
    }

    const itemDeposit = depositPerItem * quantity;

    subtotal += itemSubtotal;
    totalDeposit += itemDeposit;

    return {
      product: item.productId || item.product || null,
      productName: item.productName.trim(),
      productImage: item.productImage || "",
      orderType,
      quantity,
      size: item.size || "FreeSize",
      rentalStartDate: item.rentalStartDate ? new Date(item.rentalStartDate) : null,
      rentalEndDate: item.rentalEndDate ? new Date(item.rentalEndDate) : null,
      rentalDays,
      price,
      deposit: depositPerItem,
      itemSubtotal,
      itemDeposit,
    };
  });

  // Tổng số tiền thanh toán 1 lần cho cả đơn hàng
  const totalAmount = subtotal + totalDeposit + shippingFee;

  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderCode = `ORD-${Date.now()}-${randomSuffix}`;

  const order = await Order.create({
    orderCode,
    user: userId,
    items: processedItems,
    shippingAddress: {
      recipientName: shippingAddress.recipientName.trim(),
      recipientPhone: shippingAddress.recipientPhone.trim(),
      province: shippingAddress.province.trim(),
      district: shippingAddress.district.trim(),
      ward: shippingAddress.ward.trim(),
      detail: shippingAddress.detail.trim(),
    },
    subtotal,
    totalDeposit,
    shippingFee,
    totalAmount,
    paymentMethod,
    paymentStatus: "PENDING",
    orderStatus: "PENDING",
    note: (note || "").trim(),
  });

  return order;
};

/**
 * Lấy danh sách đơn hàng của người dùng hiện tại
 */
const getUserOrders = async (userId, { page = 1, limit = 10, status } = {}) => {
  const query = { user: userId };
  if (status) {
    query.orderStatus = status;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [orders, total] = await Promise.all([
    Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Order.countDocuments(query),
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
 * Lấy chi tiết đơn hàng
 */
const getOrderById = async (orderId, user) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid order id");
    error.statusCode = 400;
    error.errorCode = "INVALID_ORDER_ID";
    throw error;
  }

  const order = await Order.findById(orderId).populate("user", "fullName email phoneNumber");

  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    error.errorCode = "ORDER_NOT_FOUND";
    throw error;
  }

  // Khách hàng thường chỉ xem được đơn của chính họ
  const isOwner = order.user._id.toString() === user._id.toString();
  const isStaff = ["SHOP_OWNER", "ADMIN"].includes(user.role);

  if (!isOwner && !isStaff) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  return order;
};

/**
 * Lấy toàn bộ đơn hàng của shop (Dành cho SHOP_OWNER và ADMIN)
 */
const getAllOrders = async ({
  page = 1,
  limit = 10,
  orderStatus,
  paymentStatus,
} = {}) => {
  const query = {};
  if (orderStatus) query.orderStatus = orderStatus;
  if (paymentStatus) query.paymentStatus = paymentStatus;

  const skip = (Number(page) - 1) * Number(limit);

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate("user", "fullName email phoneNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Order.countDocuments(query),
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
 * Cập nhật trạng thái đơn hàng (Dành cho SHOP_OWNER và ADMIN)
 */
const updateOrderStatus = async (orderId, orderStatus) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid order id");
    error.statusCode = 400;
    error.errorCode = "INVALID_ORDER_ID";
    throw error;
  }

  const order = await Order.findById(orderId);

  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    error.errorCode = "ORDER_NOT_FOUND";
    throw error;
  }

  order.orderStatus = orderStatus;
  await order.save();

  return order;
};

/**
 * Hủy đơn hàng
 */
const cancelOrder = async (orderId, user) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid order id");
    error.statusCode = 400;
    error.errorCode = "INVALID_ORDER_ID";
    throw error;
  }

  const order = await Order.findById(orderId);

  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    error.errorCode = "ORDER_NOT_FOUND";
    throw error;
  }

  const isOwner = order.user.toString() === user._id.toString();
  const isStaff = ["SHOP_OWNER", "ADMIN"].includes(user.role);

  if (!isOwner && !isStaff) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  // Khách hàng chỉ có thể hủy khi đơn còn PENDING
  if (isOwner && !isStaff && order.orderStatus !== "PENDING") {
    const error = new Error("Cannot cancel order that has already been processed");
    error.statusCode = 400;
    error.errorCode = "ORDER_CANNOT_BE_CANCELLED";
    throw error;
  }

  order.orderStatus = "CANCELLED";
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
