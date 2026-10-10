import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import authorize from "../../middleware/role.middleware.js";
import {
  createVnPayUrlController,
  vnPayIpnController,
  vnPayReturnController,
} from "./payment.controller.js";
import { validateCreateVnPayUrl } from "./payment.validation.js";

const router = Router();

// [BE-S3-04] Tạo URL thanh toán VNPay Sandbox (chỉ Renter/User sở hữu đơn)
router.post(
  "/create-vnpay-url",
  authMiddleware,
  authorize(["USER"]),
  validateCreateVnPayUrl,
  createVnPayUrlController
);

// [BE-S3-05] VNPay Return URL (Browser redirect, public callback)
router.get("/vnpay-return", vnPayReturnController);

// [BE-S3-05] VNPay IPN Webhook (Server-to-Server, public endpoint)
router.post("/vnpay-ipn", vnPayIpnController);
router.get("/vnpay-ipn", vnPayIpnController);

export default router;
