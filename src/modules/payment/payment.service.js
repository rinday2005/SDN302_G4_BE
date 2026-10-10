import mongoose from "mongoose";
import Payment from "./payment.model.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../rent/order/order.model.js";
import {
  buildVnPayUrl,
  verifyVnPaySignature,
} from "./vnpay.utils.js";
import {
  VNPAY_TMN_CODE,
  VNPAY_HASH_SECRET,
  VNPAY_URL,
  VNPAY_RETURN_URL,
} from "../../config/env.js";

const createError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

/**
 * [BE-S3-04] Tạo URL thanh toán VNPay Sandbox cho đơn thuê
 */
const createVnPayPaymentUrl = async ({
  user,
  orderId,
  type = "RENT",
  ipAddress = "127.0.0.1",
}) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw createError("Invalid order id", 400, "INVALID_ORDER_ID");
  }

  // 1. Kiểm tra đơn hàng tồn tại
  const order = await RentalOrder.findById(orderId);
  if (!order) {
    throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  // 2. AC: Chỉ User sở hữu order mới tạo được payment URL
  if (order.renterId.toString() !== user._id.toString()) {
    throw createError("Bạn không có quyền thanh toán đơn hàng này", 403, "FORBIDDEN");
  }

  // 3. AC: Order sai trạng thái bị từ chối (chỉ chấp nhận WAITING_PAYMENT)
  if (order.status !== RENTAL_ORDER_STATUS.WAITING_PAYMENT) {
    throw createError(
      `Đơn hàng không ở trạng thái chờ thanh toán (Trạng thái hiện tại: ${order.status})`,
      400,
      "ORDER_NOT_WAITING_PAYMENT"
    );
  }

  // 4. Sinh mã giao dịch duy nhất cho phiên thanh toán
  const txnRef = `${order.orderCode}_${Date.now()}`;
  const description = `Thanh toan don thue ${order.orderCode}`;

  // 5. Lưu payment record trạng thái PENDING
  await Payment.create({
    orderId: order._id,
    orderType: type,
    userId: user._id,
    amount: order.totalAmount, // AC: Số tiền đúng bằng totalAmount
    status: "PENDING",
    method: "VNPAY",
    txnRef,
    description,
  });

  // 6. Tạo VNPay Payment URL (Sandbox)
  const paymentUrl = buildVnPayUrl({
    tmnCode: VNPAY_TMN_CODE,
    hashSecret: VNPAY_HASH_SECRET,
    vnpUrl: VNPAY_URL,
    returnUrl: VNPAY_RETURN_URL,
    ipAddr: ipAddress,
    amount: order.totalAmount,
    txnRef,
    orderInfo: description,
  });

  return {
    orderId: order._id,
    orderCode: order.orderCode,
    totalAmount: order.totalAmount,
    txnRef,
    paymentUrl,
  };
};

/**
 * [BE-S3-05] Xử lý Webhook IPN từ VNPay (Server-to-Server)
 */
const processVnPayIpn = async (queryParams = {}) => {
  // 1. AC: Xác minh chữ ký VNPay (checksum SHA512)
  const isValidSignature = verifyVnPaySignature(queryParams, VNPAY_HASH_SECRET);
  if (!isValidSignature) {
    return { RspCode: "97", Message: "Invalid Checksum" };
  }

  const txnRef = queryParams.vnp_TxnRef;
  const vnpAmount = Number(queryParams.vnp_Amount) / 100;
  const responseCode = queryParams.vnp_ResponseCode;
  const transactionStatus = queryParams.vnp_TransactionStatus;

  // 2. Tìm payment record theo txnRef
  let payment = await Payment.findOne({ txnRef });

  // 3. Tìm RentalOrder
  let order = null;
  if (payment) {
    order = await RentalOrder.findById(payment.orderId);
  } else {
    // Fallback: tìm qua orderCode trong txnRef
    const orderCode = txnRef?.split("_")[0];
    if (orderCode) {
      order = await RentalOrder.findOne({ orderCode });
    }
  }

  if (!order) {
    return { RspCode: "01", Message: "Order not found" };
  }

  // 4. AC: Kiểm tra số tiền
  if (Math.round(order.totalAmount) !== Math.round(vnpAmount)) {
    return { RspCode: "04", Message: "Invalid amount" };
  }

  // 5. AC: Không tạo duplicate payment record / không xử lý đơn đã confirm
  if (
    (payment && payment.status === "PAID") ||
    order.status === RENTAL_ORDER_STATUS.PAID ||
    order.paymentStatus === "PAID"
  ) {
    return { RspCode: "02", Message: "Order already confirmed" };
  }

  // 6. Kiểm tra mã phản hồi giao dịch
  const isSuccess = responseCode === "00" && (!transactionStatus || transactionStatus === "00");

  if (isSuccess) {
    // AC: Thanh toán thành công -> cập nhật RentalOrder thành PAID
    order.status = RENTAL_ORDER_STATUS.PAID;
    order.paymentStatus = "PAID";

    if (payment) {
      payment.status = "PAID";
      payment.transactionNo = queryParams.vnp_TransactionNo || "";
      payment.bankCode = queryParams.vnp_BankCode || "";
      payment.vnpResponse = queryParams;
      payment.paidAt = new Date();
      await payment.save();
    } else {
      await Payment.create({
        orderId: order._id,
        orderType: "RENT",
        userId: order.renterId,
        amount: order.totalAmount,
        status: "PAID",
        method: "VNPAY",
        txnRef,
        transactionNo: queryParams.vnp_TransactionNo || "",
        bankCode: queryParams.vnp_BankCode || "",
        vnpResponse: queryParams,
        paidAt: new Date(),
      });
    }

    await order.save();
    return { RspCode: "00", Message: "Confirm Success" };
  } else {
    // Thanh toán thất bại hoặc khách hủy
    order.paymentStatus = "FAILED";
    if (payment) {
      payment.status = "FAILED";
      payment.vnpResponse = queryParams;
      await payment.save();
    }
    await order.save();

    return { RspCode: "00", Message: "Confirm Success" };
  }
};

/**
 * [BE-S3-05] Xử lý Return URL từ VNPay (Browser callback sau thanh toán)
 */
const processVnPayReturn = async (queryParams = {}) => {
  // 1. AC: Xác minh chữ ký
  const isValidSignature = verifyVnPaySignature(queryParams, VNPAY_HASH_SECRET);
  if (!isValidSignature) {
    throw createError("Chữ ký VNPay không hợp lệ", 400, "INVALID_CHECKSUM");
  }

  const txnRef = queryParams.vnp_TxnRef;
  const vnpAmount = Number(queryParams.vnp_Amount) / 100;
  const responseCode = queryParams.vnp_ResponseCode;
  const transactionStatus = queryParams.vnp_TransactionStatus;

  let payment = await Payment.findOne({ txnRef });
  let order = null;

  if (payment) {
    order = await RentalOrder.findById(payment.orderId);
  } else {
    const orderCode = txnRef?.split("_")[0];
    if (orderCode) {
      order = await RentalOrder.findOne({ orderCode });
    }
  }

  if (!order) {
    throw createError("Không tìm thấy đơn hàng", 404, "ORDER_NOT_FOUND");
  }

  // 2. AC: Kiểm tra số tiền
  if (Math.round(order.totalAmount) !== Math.round(vnpAmount)) {
    throw createError("Số tiền thanh toán không khớp với đơn hàng", 400, "INVALID_AMOUNT");
  }

  const isSuccess = responseCode === "00" && (!transactionStatus || transactionStatus === "00");

  if (isSuccess) {
    // Đảm bảo đơn được cập nhật PAID nếu IPN chưa xử lý kịp
    if (order.status !== RENTAL_ORDER_STATUS.PAID) {
      order.status = RENTAL_ORDER_STATUS.PAID;
      order.paymentStatus = "PAID";
      await order.save();
    }

    if (payment && payment.status !== "PAID") {
      payment.status = "PAID";
      payment.transactionNo = queryParams.vnp_TransactionNo || "";
      payment.bankCode = queryParams.vnp_BankCode || "";
      payment.vnpResponse = queryParams;
      payment.paidAt = new Date();
      await payment.save();
    }

    return {
      success: true,
      orderId: order._id,
      orderCode: order.orderCode,
      totalAmount: order.totalAmount,
      transactionNo: queryParams.vnp_TransactionNo || "",
      status: "PAID",
      message: "Thanh toán thành công",
    };
  } else {
    if (payment && payment.status === "PENDING") {
      payment.status = "FAILED";
      payment.vnpResponse = queryParams;
      await payment.save();
    }
    order.paymentStatus = "FAILED";
    await order.save();

    return {
      success: false,
      orderId: order._id,
      orderCode: order.orderCode,
      totalAmount: order.totalAmount,
      status: "FAILED",
      responseCode,
      message: "Thanh toán không thành công hoặc người dùng đã hủy giao dịch",
    };
  }
};

export {
  createVnPayPaymentUrl,
  processVnPayIpn,
  processVnPayReturn,
};
