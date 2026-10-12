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
 * [BE-S3-05] GET /api/payments/vnpay-return
 * Client Browser redirect từ VNPay sau khi thực hiện giao dịch
 */
const vnPayReturnController = async (req, res, next) => {
  try {
    const result = await processVnPayReturn(req.query);

    const isAjax =
      req.xhr ||
      req.headers.accept?.includes("application/json") ||
      req.query.format === "json" ||
      req.headers["x-requested-with"] === "XMLHttpRequest";

    // 1. Nếu là AJAX/Fetch request từ Frontend: Trả JSON
    if (isAjax) {
      return successResponse(res, "VNPay return processed successfully", result);
    }

    // 2. Nếu là Browser redirect trực tiếp từ VNPay: Chuyển hướng về Frontend
    const frontendBase = (process.env.FRONTEND_URL || FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
    if (result.success) {
      const redirectUrl = `${frontendBase}/payment-success?orderId=${result.orderId}&orderCode=${result.orderCode}&amount=${result.totalAmount}&txnRef=${result.txnRef || ""}&transactionNo=${result.transactionNo || ""}`;
      return res.redirect(redirectUrl);
    } else {
      const redirectUrl = `${frontendBase}/payment-failed?orderId=${result.orderId || ""}&orderCode=${result.orderCode || ""}&code=${result.responseCode || "99"}&message=${encodeURIComponent(result.message || "Thanh toán không thành công")}`;
      return res.redirect(redirectUrl);
    }
  } catch (error) {
    next(error);
  }
};

export {
  createVnPayUrlController,
  vnPayIpnController,
  vnPayReturnController,
};
