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

// NOTE [BE-S3-02]:
// Cart APIs (add/remove/update quantity/get)
import cartRoutes from "../modules/cart/cart.route.js";

import paymentRoutes from "../modules/payment/payment.route.js";
import productRoutes, {
  adminProductRouter,
} from "../modules/rent/product/product.route.js";
import uploadRoutes from "./upload.routes.js";
import userRoutes from "../modules/user/user.route.js";

const router = Router();

// ======================================================
// HEALTH CHECK
// ======================================================
router.get("/api/health", (req, res) => {
  return successResponse(res, "ReUse Hub API is running", {
    status: "ok",
  });
});

// ======================================================
// AUTH
// ======================================================
router.use("/api/auth", authRoutes);

// ======================================================
// CATEGORY
// ======================================================
router.use("/api/categories", publicCategoryRouter);
router.use("/api/admin/categories", adminCategoryRouter);

// ======================================================
// PRODUCT - EXISTING ROUTE
// ======================================================

// Giữ lại route cũ để không làm ảnh hưởng code hiện tại của team
router.use("/api/products", productRoutes);

// NOTE [An - BE-S2-05]:
// Register public RENT product APIs required by Jira BE-S2-05.
// Existing /api/products route is preserved for backward compatibility.
router.use("/api/rent/products", productRoutes);

// NOTE [BE-S2-04]:
// Register Admin RENT product APIs (approve / reject rental product status).
router.use("/api/admin/rent/products", adminProductRouter);
router.use("/api/admin/products", adminProductRouter);

// ======================================================
// RENT ORDER
// ======================================================

// NOTE [BE-S3-02]:
// Rental order APIs moved from /api/orders to /api/rent/orders
router.use("/api/rent/orders", orderRoutes);

// ======================================================
// CART
// ======================================================
router.use("/api/cart", cartRoutes);

// ======================================================
// PAYMENT
// ======================================================
router.use("/api/payments", paymentRoutes);
router.use("/api/payment", paymentRoutes);
router.use("/payments", paymentRoutes);

// ======================================================
// UPLOAD
// ======================================================
router.use("/api", uploadRoutes);
router.use("/upload", uploadRoutes);

// ======================================================
// USER & PROFILE
// ======================================================
router.use("/api/users", userRoutes);
router.use("/users", userRoutes);

export default router;