import mongoose from "mongoose";
import Payment from "./payment.model.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../rent/order/order.model.js";
import User from "../user/user.model.js";
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
 * [BE-S3-04] Tạo URL thanh toán VNPay Sandbox (hỗ trợ cả đơn DB lẫn đơn tĩnh)
 */
const createVnPayPaymentUrl = async ({
  user,
  orderId,
  amount,
  orderCode,
  type = "RENT",
  ipAddress = "127.0.0.1",
  returnUrl,
  bankCode,
  items,
  shippingAddress,
  startDate,
  endDate,
  rentalFee,
  depositAmount,
  shippingFee,
}) => {
  let order = null;
  let payAmount = amount ? Number(amount) : null;
  let code = orderCode || `RH_${Date.now().toString().slice(-6)}`;

  // 1. Nếu có orderId hợp lệ, thử tìm trong MongoDB
  if (orderId && typeof orderId === "string" && mongoose.Types.ObjectId.isValid(orderId)) {
    order = await RentalOrder.findById(orderId);
  }

  // Nếu chưa tìm thấy bằng orderId, thử tìm bằng orderCode nếu có
  if (!order && orderCode) {
    order = await RentalOrder.findOne({ orderCode });
  }

  const parseOrderItems = (rawItems) => {
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      return rawItems.map((it) => {
        let pId = it.productId || it.id;
        if (!pId || !mongoose.Types.ObjectId.isValid(pId)) {
          pId = new mongoose.Types.ObjectId();
        }
        return {
          productId: pId,
          productName: it.productName || it.title || `Sản phẩm (${code})`,
          quantity: Math.max(1, Number(it.quantity || it.qty || 1)),
          pricePerDay: Number(it.pricePerDay || it.dailyPrice || it.price || 0),
          depositAmount: Number(it.depositAmount || it.deposit || 0),
          imageUrl: it.imageUrl || it.image || "",
        };
      });
    }
    return null;
  };

  // 2. Nếu tìm thấy đơn hàng trong DB -> dùng thông tin từ DB (hoặc bổ sung items nếu đơn cũ là dummy)
  if (order) {
    if (order.renterId.toString() !== user._id.toString()) {
      throw createError("Bạn không có quyền thanh toán đơn hàng này", 403, "FORBIDDEN");
    }
    const parsed = parseOrderItems(items);
    if (parsed && (order.items.length === 0 || order.items[0]?.productName?.includes("Đơn hàng"))) {
      order.items = parsed;
      if (shippingAddress) {
        order.shippingAddress = {
          recipientName: (shippingAddress.recipientName || order.shippingAddress?.recipientName || user.fullName || "Khách hàng").trim(),
          recipientPhone: (shippingAddress.recipientPhone || order.shippingAddress?.recipientPhone || user.phoneNumber || "0988776655").trim(),
          province: (shippingAddress.province || order.shippingAddress?.province || "Hồ Chí Minh").trim(),
          district: (shippingAddress.district || order.shippingAddress?.district || "Quận 1").trim(),
          ward: (shippingAddress.ward || order.shippingAddress?.ward || "Bến Nghé").trim(),
          detail: (shippingAddress.detail || order.shippingAddress?.detail || "Địa chỉ mặc định").trim(),
        };
      }
      await order.save();
    }
    payAmount = order.totalAmount;
    code = order.orderCode;
  } else {
    // 3. Nếu chưa có đơn trong DB -> Tự tạo 1 RentalOrder hợp lệ trong MongoDB gắn với user đang đăng nhập
    payAmount = payAmount || 1500000;

    let shopOwner = await User.findOne({ role: "SHOP_OWNER" });
    if (!shopOwner) {
      shopOwner = await User.create({
        email: `shop_${Date.now()}@reuse.vn`,
        passwordHash: "dummyPasswordHash123",
        fullName: "ReUse Official Shop",
        phoneNumber: "0901234567",
        role: "SHOP_OWNER",
      });
    }

    const now = startDate ? new Date(startDate) : new Date();
    const nextDay = endDate ? new Date(endDate) : new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const parsedItems = parseOrderItems(items) || [
      {
        productId: new mongoose.Types.ObjectId(),
        productName: `Đơn hàng ${type === "THRIFT" ? "Thrift" : "Thuê"} (${code})`,
        quantity: 1,
        pricePerDay: payAmount,
        depositAmount: 0,
        imageUrl: "",
      },
    ];

    const calcRentalFee = rentalFee !== undefined ? Number(rentalFee) : payAmount;
    const calcDepositAmount = depositAmount !== undefined ? Number(depositAmount) : 0;
    const calcShippingFee = shippingFee !== undefined ? Number(shippingFee) : 0;
    const finalTotal = payAmount || (calcRentalFee + calcDepositAmount + calcShippingFee);

    const shipAddr = shippingAddress || {};
    const effectiveAddress = {
      recipientName: (shipAddr.recipientName || user.fullName || "Khách hàng").trim(),
      recipientPhone: (shipAddr.recipientPhone || user.phoneNumber || "0988776655").trim(),
      province: (shipAddr.province || user.address?.province || "Hồ Chí Minh").trim(),
      district: (shipAddr.district || user.address?.district || "Quận 1").trim(),
      ward: (shipAddr.ward || user.address?.ward || "Bến Nghé").trim(),
      detail: (shipAddr.detail || user.address?.detail || "Địa chỉ mặc định").trim(),
    };

    order = await RentalOrder.create({
      orderCode: code,
      renterId: user._id,
      shopOwnerId: shopOwner._id,
      items: parsedItems,
      startDate: now,
      endDate: nextDay,
      rentalFee: calcRentalFee,
      depositAmount: calcDepositAmount,
      shippingFee: calcShippingFee,
      totalAmount: finalTotal,
      shippingAddress: effectiveAddress,
      status: "WAITING_PAYMENT",
      paymentStatus: "PENDING",
    });
  }

  // 4. Sinh mã giao dịch duy nhất cho phiên thanh toán
  const txnRef = `${code}_${Date.now()}`;
  const description = `Thanh toan don ${type.toLowerCase()} ${code}`;

  // 5. Lưu payment record trạng thái PENDING
  await Payment.create({
    orderId: order._id,
    orderType: type,
    userId: user._id,
    amount: payAmount,
    status: "PENDING",
    method: "VNPAY",
    txnRef,
    description,
  });

  // 6. Tạo VNPay Payment URL (Sandbox)
  const effectiveReturnUrl = returnUrl || VNPAY_RETURN_URL;
  const paymentUrl = buildVnPayUrl({
    tmnCode: VNPAY_TMN_CODE,
    hashSecret: VNPAY_HASH_SECRET,
    vnpUrl: VNPAY_URL,
    returnUrl: effectiveReturnUrl,
    ipAddr: ipAddress,
    amount: payAmount,
    txnRef,
    orderInfo: description,
    bankCode,
  });

  return {
    orderId: order._id,
    orderCode: code,
    totalAmount: payAmount,
    txnRef,
    vnpUrl: paymentUrl,
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
    return {
      success: false,
      status: "FAILED",
      responseCode: "97",
      message: "Chữ ký VNPay không hợp lệ (Invalid Checksum)",
    };
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
    return {
      success: false,
      status: "FAILED",
      responseCode: "01",
      message: "Không tìm thấy đơn hàng",
    };
  }

  // 2. AC: Kiểm tra số tiền
  if (Math.round(order.totalAmount) !== Math.round(vnpAmount)) {
    return {
      success: false,
      orderId: order._id,
      orderCode: order.orderCode,
      status: "FAILED",
      responseCode: "04",
      message: "Số tiền thanh toán không khớp với đơn hàng",
    };
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
