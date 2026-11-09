import {
  createVnPayPaymentUrl,
  processVnPayIpn,
  processVnPayReturn,
} from "./payment.service.js";
import { successResponse } from "../../utils/response.js";
import { FRONTEND_URL } from "../../config/env.js";

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const rawIp = req.socket?.remoteAddress || req.ip || "127.0.0.1";
  return rawIp === "::1" ? "127.0.0.1" : rawIp;
};

/**
 * [BE-S3-04] POST /api/payments/create-vnpay-url
 */
const createVnPayUrlController = async (req, res, next) => {
  try {
    const ipAddress = getClientIp(req);
    const result = await createVnPayPaymentUrl({
      user: req.user,
      orderId: req.body.orderId,
      amount: req.body.amount,
      orderCode: req.body.orderCode,
      type: req.body.type || "RENT",
      ipAddress,
      returnUrl: req.body.returnUrl,
      bankCode: req.body.bankCode,
      productId: req.body.productId,
      items: req.body.items,
      shippingAddress: req.body.shippingAddress,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      rentalFee: req.body.rentalFee,
      depositAmount: req.body.depositAmount,
      shippingFee: req.body.shippingFee,
    });

    // Trả về vnpUrl trực tiếp và trong data để tương thích hoàn toàn với FE
    return res.status(200).json({
      success: true,
      message: "VNPay payment URL created successfully",
      vnpUrl: result.paymentUrl,
      paymentUrl: result.paymentUrl,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * [BE-S3-05] POST /api/payments/vnpay-ipn (và GET /api/payments/vnpay-ipn)
 * VNPay Server-to-Server IPN webhook
 */
const vnPayIpnController = async (req, res) => {
  try {
    // VNPay có thể gửi qua GET query hoặc POST body/query
    const params = Object.keys(req.query).length > 0 ? req.query : req.body;
    const result = await processVnPayIpn(params);

    // Chuẩn VNPay IPN phản hồi HTTP 200 kèm JSON { RspCode, Message }
    return res.status(200).json(result);
  } catch (error) {
    console.error("VNPay IPN error:", error);
    return res.status(200).json({ RspCode: "99", Message: "Unknown error" });
  }
};

/**
 * [BE-S3-05] GET /api/payments/vnpay-return (hoặc /api/payment/vnpay-return)
 * Client Browser redirect từ VNPay sau khi thực hiện giao dịch
 * Được bọc try/catch an toàn tuyệt đối: Luôn redirect về Frontend (cổng 5173), không bao giờ làm sập kết nối
 */
const vnPayReturnController = async (req, res) => {
  let frontendBase = (process.env.FRONTEND_URL || FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  const isAjax =
    req.xhr ||
    req.headers.accept?.includes("application/json") ||
    req.query.format === "json" ||
    req.headers["x-requested-with"] === "XMLHttpRequest";

  try {
    const result = await processVnPayReturn(req.query);

    // 1. Nếu là AJAX/Fetch request từ Frontend: Trả JSON
    if (isAjax) {
      return successResponse(res, "VNPay return processed successfully", result);
    }

    // 2. Nếu là Browser redirect trực tiếp từ VNPay: Luôn ép về Frontend Vite (port 5173)
    if (frontendBase.includes("localhost:3000") || frontendBase.includes("127.0.0.1:3000")) {
      frontendBase = "http://localhost:5173";
    }

    if (result.success) {
      const redirectUrl = `${frontendBase}/payment-success?orderId=${result.orderId}&orderCode=${encodeURIComponent(result.orderCode || "")}&amount=${result.totalAmount}&type=${result.orderType || "RENT"}&txnRef=${encodeURIComponent(result.txnRef || req.query.vnp_TxnRef || "")}&transactionNo=${encodeURIComponent(result.transactionNo || req.query.vnp_TransactionNo || "")}`;
      return res.redirect(redirectUrl);
    } else {
      const redirectUrl = `${frontendBase}/payment-failed?orderId=${result.orderId || ""}&orderCode=${encodeURIComponent(result.orderCode || "")}&type=${result.orderType || "RENT"}&code=${result.responseCode || "99"}&message=${encodeURIComponent(result.message || "Thanh toán không thành công")}`;
      return res.redirect(redirectUrl);
    }
  } catch (error) {
    console.error("Lỗi xử lý VNPay Return:", error);

    if (isAjax) {
      return res.status(500).json({
        success: false,
        message: error.message || "Lỗi xử lý phản hồi từ VNPay",
      });
    }

    // Bắt buộc redirect về Front-end kèm lỗi thay vì throw để tránh sập connection
    const fallbackRedirect = `${frontendBase}/payment-failed?code=500&message=${encodeURIComponent("Lỗi hệ thống khi xử lý kết quả: " + (error.message || "Unknown error"))}`;
    return res.redirect(fallbackRedirect);
  }
};

export {
  createVnPayUrlController,
  vnPayIpnController,
  vnPayReturnController,
};
