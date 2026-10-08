import { Router } from "express";
import { successResponse } from "../utils/response.js";
import authRoutes from "../modules/auth/auth.routes.js";

// NOTE [An - BE-S1-07]:
// Added Category routes required by Jira task BE-S1-07.
// This file is owned by N; change made only to register Category APIs.
import {
  publicCategoryRouter,
  adminCategoryRouter,
} from "../modules/category/category.route.js";
import orderRoutes from "../modules/rent/order/order.route.js";
import paymentRoutes from "../modules/payment/payment.route.js";
import productRoutes from "../modules/rent/product/product.route.js";
import uploadRoutes from "./upload.routes.js";

const router = Router();

router.get("/api/health", (req, res) => {
  return successResponse(res, "ReUse Hub API is running", {
    status: "ok",
  });
});

router.use("/api/auth", authRoutes);
router.use("/api/categories", publicCategoryRouter);
router.use("/api/admin/categories", adminCategoryRouter);
router.use("/api/products", productRoutes);
router.use("/api/orders", orderRoutes);
router.use("/api/payments", paymentRoutes);
router.use("/api", uploadRoutes);

export default router;