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
 * [BE-S3-04] Táº¡o URL thanh toÃ¡n VNPay Sandbox (há»— trá»£ cáº£ Ä‘Æ¡n DB láº«n Ä‘Æ¡n tÄ©nh)
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

  // 1. Náº¿u cÃ³ orderId há»£p lá»‡, thá»­ tÃ¬m trong MongoDB
  if (orderId && typeof orderId === "string" && mongoose.Types.ObjectId.isValid(orderId)) {
    order = await RentalOrder.findById(orderId);
  }

  // Náº¿u chÆ°a tÃ¬m tháº¥y báº±ng orderId, thá»­ tÃ¬m báº±ng orderCode náº¿u cÃ³
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
          productName: it.productName || it.title || `Sáº£n pháº©m (${code})`,
          quantity: Math.max(1, Number(it.quantity || it.qty || 1)),
          pricePerDay: Number(it.pricePerDay || it.dailyPrice || it.price || 0),
          depositAmount: Number(it.depositAmount || it.deposit || 0),
          imageUrl: it.imageUrl || it.image || "",
        };
      });
    }
    return null;
  };

  // 2. Náº¿u tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng trong DB -> dÃ¹ng thÃ´ng tin tá»« DB (hoáº·c bá»• sung items náº¿u Ä‘Æ¡n cÅ© lÃ  dummy)
  if (order) {
    if (order.renterId.toString() !== user._id.toString()) {
      throw createError("Báº¡n khÃ´ng cÃ³ quyá»n thanh toÃ¡n Ä‘Æ¡n hÃ ng nÃ y", 403, "FORBIDDEN");
    }
    const parsed = parseOrderItems(items);
    if (parsed && (order.items.length === 0 || order.items[0]?.productName?.includes("ÄÆ¡n hÃ ng"))) {
      order.items = parsed;
      if (shippingAddress) {
        order.shippingAddress = {
          recipientName: (shippingAddress.recipientName || order.shippingAddress?.recipientName || user.fullName || "KhÃ¡ch hÃ ng").trim(),
          recipientPhone: (shippingAddress.recipientPhone || order.shippingAddress?.recipientPhone || user.phoneNumber || "0988776655").trim(),
          province: (shippingAddress.province || order.shippingAddress?.province || "Há»“ ChÃ­ Minh").trim(),
          district: (shippingAddress.district || order.shippingAddress?.district || "Quáº­n 1").trim(),
          ward: (shippingAddress.ward || order.shippingAddress?.ward || "Báº¿n NghÃ©").trim(),
          detail: (shippingAddress.detail || order.shippingAddress?.detail || "Äá»‹a chá»‰ máº·c Ä‘á»‹nh").trim(),
        };
      }
      await order.save();
    }
    payAmount = order.totalAmount;
    code = order.orderCode;
  } else {
    // 3. Náº¿u chÆ°a cÃ³ Ä‘Æ¡n trong DB -> Tá»± táº¡o 1 RentalOrder há»£p lá»‡ trong MongoDB gáº¯n vá»›i user Ä‘ang Ä‘Äƒng nháº­p
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
        productName: `ÄÆ¡n hÃ ng ${type === "THRIFT" ? "Thrift" : "ThuÃª"} (${code})`,
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
      recipientName: (shipAddr.recipientName || user.fullName || "KhÃ¡ch hÃ ng").trim(),
      recipientPhone: (shipAddr.recipientPhone || user.phoneNumber || "0988776655").trim(),
      province: (shipAddr.province || user.address?.province || "Há»“ ChÃ­ Minh").trim(),
      district: (shipAddr.district || user.address?.district || "Quáº­n 1").trim(),
      ward: (shipAddr.ward || user.address?.ward || "Báº¿n NghÃ©").trim(),
      detail: (shipAddr.detail || user.address?.detail || "Äá»‹a chá»‰ máº·c Ä‘á»‹nh").trim(),
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

  // 4. Sinh mÃ£ giao dá»‹ch duy nháº¥t cho phiÃªn thanh toÃ¡n
  const txnRef = `${code}_${Date.now()}`;
  const description = `Thanh toan don ${type.toLowerCase()} ${code}`;

  // 5. LÆ°u payment record tráº¡ng thÃ¡i PENDING
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

  // 6. Táº¡o VNPay Payment URL (Sandbox)
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
 * [BE-S3-05] Xá»­ lÃ½ Webhook IPN tá»« VNPay (Server-to-Server)
 */
const processVnPayIpn = async (queryParams = {}) => {
  // 1. AC: XÃ¡c minh chá»¯ kÃ½ VNPay (checksum SHA512)
  const isValidSignature = verifyVnPaySignature(queryParams, VNPAY_HASH_SECRET);
  if (!isValidSignature) {
    return { RspCode: "97", Message: "Invalid Checksum" };
  }

  const txnRef = queryParams.vnp_TxnRef;
  const vnpAmount = Number(queryParams.vnp_Amount) / 100;
  const responseCode = queryParams.vnp_ResponseCode;
  const transactionStatus = queryParams.vnp_TransactionStatus;

  // 2. TÃ¬m payment record theo txnRef
  let payment = await Payment.findOne({ txnRef });

  // 3. TÃ¬m RentalOrder
  let order = null;
  if (payment) {
    order = await RentalOrder.findById(payment.orderId);
  } else {
    // Fallback: tÃ¬m qua orderCode trong txnRef
    const orderCode = txnRef?.split("_")[0];
    if (orderCode) {
      order = await RentalOrder.findOne({ orderCode });
    }
  }

  if (!order) {
    return { RspCode: "01", Message: "Order not found" };
  }

  // 4. AC: Kiá»ƒm tra sá»‘ tiá»n
  if (Math.round(order.totalAmount) !== Math.round(vnpAmount)) {
    return { RspCode: "04", Message: "Invalid amount" };
  }

  // 5. AC: KhÃ´ng táº¡o duplicate payment record / khÃ´ng xá»­ lÃ½ Ä‘Æ¡n Ä‘Ã£ confirm
  if (
    (payment && payment.status === "PAID") ||
    order.status === RENTAL_ORDER_STATUS.PAID ||
    order.paymentStatus === "PAID"
  ) {
    return { RspCode: "02", Message: "Order already confirmed" };
  }

  // 6. Kiá»ƒm tra mÃ£ pháº£n há»“i giao dá»‹ch
  const isSuccess = responseCode === "00" && (!transactionStatus || transactionStatus === "00");

  if (isSuccess) {
    // AC: Thanh toÃ¡n thÃ nh cÃ´ng -> cáº­p nháº­t RentalOrder thÃ nh PAID
    order.status = RENTAL_ORDER_STATUS.DELIVERED; if (!order.shippingDetails) { order.shippingDetails = {}; } order.shippingDetails.deliveredAt = new Date(); order.shippingDetails.carrierName = "Nanuk White-Glove (2 chiều)";
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
    // Thanh toÃ¡n tháº¥t báº¡i hoáº·c khÃ¡ch há»§y
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
 * [BE-S3-05] Xá»­ lÃ½ Return URL tá»« VNPay (Browser callback sau thanh toÃ¡n)
 */
const processVnPayReturn = async (queryParams = {}) => {
  // 1. AC: XÃ¡c minh chá»¯ kÃ½
  const isValidSignature = verifyVnPaySignature(queryParams, VNPAY_HASH_SECRET);
  if (!isValidSignature) {
    return {
      success: false,
      status: "FAILED",
      responseCode: "97",
      message: "Chá»¯ kÃ½ VNPay khÃ´ng há»£p lá»‡ (Invalid Checksum)",
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
      message: "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng",
    };
  }

  // 2. AC: Kiá»ƒm tra sá»‘ tiá»n
  if (Math.round(order.totalAmount) !== Math.round(vnpAmount)) {
    return {
      success: false,
      orderId: order._id,
      orderCode: order.orderCode,
      status: "FAILED",
      responseCode: "04",
      message: "Sá»‘ tiá»n thanh toÃ¡n khÃ´ng khá»›p vá»›i Ä‘Æ¡n hÃ ng",
    };
  }

  const isSuccess = responseCode === "00" && (!transactionStatus || transactionStatus === "00");

  if (isSuccess) {
    // Äáº£m báº£o Ä‘Æ¡n Ä‘Æ°á»£c cáº­p nháº­t PAID náº¿u IPN chÆ°a xá»­ lÃ½ ká»‹p
    if (order.status !== RENTAL_ORDER_STATUS.PAID) {
      order.status = RENTAL_ORDER_STATUS.DELIVERED; if (!order.shippingDetails) { order.shippingDetails = {}; } order.shippingDetails.deliveredAt = new Date(); order.shippingDetails.carrierName = "Nanuk White-Glove (2 chiều)";
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
      message: "Thanh toÃ¡n thÃ nh cÃ´ng",
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
      message: "Thanh toÃ¡n khÃ´ng thÃ nh cÃ´ng hoáº·c ngÆ°á»i dÃ¹ng Ä‘Ã£ há»§y giao dá»‹ch",
    };
  }
};

export {
  createVnPayPaymentUrl,
  processVnPayIpn,
  processVnPayReturn,
};
