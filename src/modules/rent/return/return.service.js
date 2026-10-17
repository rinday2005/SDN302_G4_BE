import mongoose from "mongoose";
import RentalReturn from "./return.model.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../order/order.model.js";

/**
 * Renter gửi yêu cầu trả đồ & biên bản hình ảnh đối kiểm
 */
export const createReturnRequest = async (user, data) => {
  const { orderId, items, evidenceImages, renterNote, pickupDetails } = data;

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
    const error = new Error("Đơn thuê không tồn tại");
    error.statusCode = 404;
    error.errorCode = "ORDER_NOT_FOUND";
    throw error;
  }

  // Chặn IDOR: Chỉ Renter của đơn mới được gửi yêu cầu trả hàng
  if (order.renterId.toString() !== user._id.toString() && user.role !== "ADMIN") {
    const error = new Error("Bạn không có quyền yêu cầu hoàn trả cho đơn hàng này");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  // Không cho trả lại đơn đã hủy hoặc đã hoàn tất
  if ([RENTAL_ORDER_STATUS.CANCELLED, RENTAL_ORDER_STATUS.REJECTED, RENTAL_ORDER_STATUS.COMPLETED].includes(order.status)) {
    const error = new Error(`Không thể yêu cầu trả hàng cho đơn ở trạng thái ${order.status}`);
    error.statusCode = 400;
    error.errorCode = "INVALID_ORDER_STATUS";
    throw error;
  }

  const trackingCode =
    pickupDetails?.trackingCode ||
    `VN-${(order.orderCode || "").replace(/\D/g, "").slice(-6) || Date.now().toString().slice(-6)}-RNT`;

  // 1. Tạo hoặc cập nhật bản ghi RentalReturn
  let rentalReturn = await RentalReturn.findOne({ orderId: order._id });
  if (rentalReturn) {
    rentalReturn.items = items || rentalReturn.items;
    rentalReturn.evidenceImages = evidenceImages || rentalReturn.evidenceImages;
    rentalReturn.renterNote = renterNote || rentalReturn.renterNote;
    rentalReturn.status = "RETURN_REQUESTED";
    rentalReturn.pickupDetails = {
      ...rentalReturn.pickupDetails,
      ...pickupDetails,
      trackingCode,
    };
    await rentalReturn.save();
  } else {
    rentalReturn = await RentalReturn.create({
      orderId: order._id,
      orderCode: order.orderCode,
      renterId: order.renterId,
      shopOwnerId: order.shopOwnerId,
      items: items || order.items.map((i) => ({
        productId: i.productId,
        productName: i.productName || i.productTitle,
        condition: "GOOD",
        checklist: [true, true, true, true],
        photos: evidenceImages || [],
        note: renterNote || "Hiện trạng tốt",
      })),
      evidenceImages: evidenceImages || [],
      renterNote: renterNote || "",
      status: "RETURN_REQUESTED",
      pickupDetails: {
        carrier: pickupDetails?.carrier || "ReUse Logistics / ViettelPost",
        trackingCode,
        pickupDate: new Date(),
        address: pickupDetails?.address || order.shippingAddress?.detail || "",
      },
    });
  }

  // 2. Cập nhật trạng thái đơn hàng sang RETURN_REQUESTED
  order.status = RENTAL_ORDER_STATUS.RETURN_REQUESTED;
  if (!order.shippingDetails) order.shippingDetails = {};
  order.shippingDetails.returnTrackingCode = trackingCode;
  order.shippingDetails.returnedAt = new Date();
  await order.save();

  return rentalReturn;
};

/**
 * Lấy danh sách phiếu hoàn trả của Renter hiện tại
 */
export const getMyReturns = async (userId, { page = 1, limit = 10, status } = {}) => {
  const query = { renterId: userId };
  if (status) query.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [returns, total] = await Promise.all([
    RentalReturn.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("orderId", "orderCode status rentalFee depositAmount totalAmount"),
    RentalReturn.countDocuments(query),
  ]);

  return {
    returns,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

/**
 * Lấy chi tiết phiếu hoàn trả theo ID
 */
export const getReturnById = async (returnId, user) => {
  let rentalReturn = null;
  if (mongoose.Types.ObjectId.isValid(returnId)) {
    rentalReturn = await RentalReturn.findById(returnId)
      .populate("renterId", "fullName email phoneNumber")
      .populate("shopOwnerId", "fullName email phoneNumber")
      .populate("orderId");
  }

  if (!rentalReturn) {
    const error = new Error("Phiếu hoàn trả không tồn tại");
    error.statusCode = 404;
    error.errorCode = "RETURN_NOT_FOUND";
    throw error;
  }

  // Kiểm tra quyền
  const isOwner = rentalReturn.renterId._id?.toString() === user._id.toString();
  const isShop = rentalReturn.shopOwnerId._id?.toString() === user._id.toString();
  const isAdmin = user.role === "ADMIN";

  if (!isOwner && !isShop && !isAdmin) {
    const error = new Error("Bạn không có quyền xem phiếu hoàn trả này");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  return rentalReturn;
};

/**
 * Lấy phiếu hoàn trả theo orderId
 */
export const getReturnByOrderId = async (orderId, user) => {
  let queryOrderId = orderId;
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    const clean = String(orderId).trim().replace("#", "");
    const order = await RentalOrder.findOne({
      $or: [{ orderCode: orderId }, { orderCode: `#${clean}` }, { orderCode: clean }],
    });
    if (order) queryOrderId = order._id;
  }

  const rentalReturn = await RentalReturn.findOne({ orderId: queryOrderId })
    .populate("renterId", "fullName email phoneNumber")
    .populate("shopOwnerId", "fullName email phoneNumber")
    .populate("orderId");

  return rentalReturn;
};

/**
 * Shop Owner / Bench Lab thẩm định tình trạng đồ và hoàn tất giải tỏa cọc
 */
export const inspectAndCompleteReturn = async (returnId, user, inspectionData) => {
  const rentalReturn = await RentalReturn.findById(returnId).populate("orderId");
  if (!rentalReturn) {
    const error = new Error("Phiếu hoàn trả không tồn tại");
    error.statusCode = 404;
    error.errorCode = "RETURN_NOT_FOUND";
    throw error;
  }

  const isShop = rentalReturn.shopOwnerId.toString() === user._id.toString();
  const isAdmin = user.role === "ADMIN";

  if (!isShop && !isAdmin) {
    const error = new Error("Chỉ Shop Owner hoặc Bench Lab mới có quyền thẩm định hoàn cọc");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  const {
    isApproved = true,
    conditionGrade = "Grade A",
    deductionAmount = 0,
    inspectorNotes = "Biên bản Bench Lab đối soát đạt chuẩn.",
    inspectionPhotos = [],
  } = inspectionData;

  const order = rentalReturn.orderId;
  const deposit = order ? order.depositAmount || 0 : 0;
  const finalRefund = isApproved ? Math.max(0, deposit - Number(deductionAmount)) : 0;

  // 1. Cập nhật phiếu hoàn trả
  rentalReturn.status = isApproved
    ? Number(deductionAmount) > 0
      ? "PARTIAL_REFUND"
      : "APPROVED"
    : "REJECTED";

  rentalReturn.inspectionResult = {
    inspectorName: user.fullName || "Bench Lab QA Specialist",
    inspectedAt: new Date(),
    conditionGrade,
    isApproved,
    deductionAmount: Number(deductionAmount),
    refundAmount: finalRefund,
    inspectorNotes,
    inspectionPhotos,
  };
  await rentalReturn.save();

  // 2. Chuyển trạng thái đơn hàng sang COMPLETED
  if (order) {
    order.status = RENTAL_ORDER_STATUS.COMPLETED;
    await order.save();
  }

  return rentalReturn;
};
