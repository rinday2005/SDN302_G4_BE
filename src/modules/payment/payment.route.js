import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import {
  createVnPayUrlController,
  vnPayIpnController,
  vnPayReturnController,
} from "./payment.controller.js";
import { validateCreateVnPayUrl } from "./payment.validation.js";

const router = Router();

// [BE-S3-04] Tạo URL thanh toán VNPay Sandbox
router.post(
  "/create-vnpay-url",
  authMiddleware,
  validateCreateVnPayUrl,
  createVnPayUrlController
);

// Alias cho FE
router.post(
  "/create-payment-url",
  authMiddleware,
  validateCreateVnPayUrl,
  createVnPayUrlController
);

// [BE-S3-05] VNPay Return URL (Browser redirect hoặc AJAX verify)
router.get("/vnpay-return", vnPayReturnController);

// [BE-S3-05] VNPay IPN Webhook (Server-to-Server, public endpoint)
router.post("/vnpay-ipn", vnPayIpnController);
router.get("/vnpay-ipn", vnPayIpnController);

export default router;
