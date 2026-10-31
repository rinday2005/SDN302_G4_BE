import thriftOrderRoutes from "../modules/thrift/order/thriftOrder.routes.js";

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

import productRoutes from "../modules/rent/product/product.route.js";

import uploadRoutes from "./upload.routes.js";

import userRoutes from "../modules/user/user.route.js";

import availabilityRoutes from "../modules/rent/availability/availability.route.js";

import rentReturnRoutes from "../modules/rent/return/return.route.js";

import thriftListingRoutes from "../modules/thrift/listing/thriftListing.routes.js";

import wishlistRoutes from "../modules/wishlist/wishlist.route.js";
import { kycRouter, adminKycRouter } from "../modules/kyc/kyc.route.js";
import adminRouter from "../modules/admin/admin.route.js";

// NOTE [An - BE-S5-02]:
// Review APIs for completed RENT orders.
import reviewRoutes from "../modules/review/review.route.js";

// NOTE [An - BE-S5-01]:
// Chat APIs and Socket.IO schemas
import chatRoutes from "../modules/chat/chat.route.js";

// NOTE [An - BE-S6-02]:
// In-app Notification APIs
import notificationRoutes from "../modules/notification/notification.route.js";

const router = Router();

// ======================================================
// HEALTH CHECK
// ======================================================
router.get("/api/health", (req, res) => {
  return successResponse(
    res,
    "ReUse Hub API is running",
    {
      status: "ok",
    }
  );
});

// ======================================================
// AUTH
// ======================================================
router.use(
  "/api/auth",
  authRoutes
);

// ======================================================
// CATEGORY
// ======================================================
router.use(
  "/api/categories",
  publicCategoryRouter
);

router.use(
  "/api/admin/categories",
  adminCategoryRouter
);

// ======================================================
// PRODUCT
// ======================================================

// Giữ lại route cũ để không làm ảnh hưởng code hiện tại của team
router.use(
  "/api/products",
  productRoutes
);

// NOTE [An - BE-S2-05]:
// Register public RENT product APIs required by Jira BE-S2-05.
// Existing /api/products route is preserved for backward compatibility.
router.use(
  "/api/rent/products",
  productRoutes
);

// ======================================================
// RENT ORDER
// ======================================================

// NOTE [BE-S3-02]:
// Rental order APIs moved from /api/orders to /api/rent/orders
router.use(
  "/api/rent/orders",
  orderRoutes
);

// ======================================================
// REVIEW
// ======================================================

// NOTE [An - BE-S5-02]:
// Review APIs for completed RentalOrders.
router.use(
  "/api/reviews",
  reviewRoutes
);

// ======================================================
// THRIFT ORDER
// ======================================================
router.use(
  "/api/thrift/orders",
  thriftOrderRoutes
);

router.use(
  "/api/thrift-orders",
  thriftOrderRoutes
);

// ======================================================
// CART
// ======================================================
router.use(
  "/api/cart",
  cartRoutes
);

// ======================================================
// PAYMENT
// ======================================================
router.use(
  "/api/payments",
  paymentRoutes
);

router.use(
  "/api/payment",
  paymentRoutes
);

router.use(
  "/payments",
  paymentRoutes
);

// ======================================================
// UPLOAD
// ======================================================
router.use(
  "/api",
  uploadRoutes
);

router.use(
  "/upload",
  uploadRoutes
);

// ======================================================
// USER & PROFILE
// ======================================================
router.use(
  "/api/users",
  userRoutes
);

router.use(
  "/users",
  userRoutes
);

// ======================================================
// RENT AVAILABILITY
// ======================================================
router.use(
  "/api/rent/availability",
  availabilityRoutes
);

// ======================================================
// RENT RETURNS
// ======================================================
router.use(
  "/api/rent/returns",
  rentReturnRoutes
);

// ======================================================
// THRIFT LISTINGS (MARKETPLACE)
// ======================================================
router.use(
  "/api/thrift/listings",
  thriftListingRoutes
);

router.use(
  "/api/thrift-listings",
  thriftListingRoutes
);

// ======================================================
// WISHLIST
// ======================================================
router.use(
  "/api/wishlist",
  wishlistRoutes
);

// ======================================================
// IDENTITY VERIFICATION (KYC)
// ======================================================
router.use("/api/kyc", kycRouter);
router.use("/api/admin/kyc", adminKycRouter);

// ======================================================
// ADMIN: LISTING MODERATION, DISPUTES, FINANCE REPORTING
// ======================================================
router.use("/api/admin", adminRouter);

// ======================================================
// CHAT & MESSAGES
// ======================================================
// NOTE [An - BE-S5-01]: Chat with unique Shop Owner
router.use("/api/chat", chatRoutes);

// ======================================================
// NOTIFICATIONS
// ======================================================
// NOTE [An - BE-S6-02]: In-app Notification APIs
router.use("/api/notifications", notificationRoutes);
router.use("/api/notification", notificationRoutes);

// ======================================================
// SHOP OWNER (PROFILE & REVENUE ANALYTICS)
// ======================================================
import shopRoutes from "../modules/shop/shop.route.js";
import aiRoutes from "../modules/ai/ai.route.js";
router.use("/api/ai", aiRoutes);
router.use("/api/shop", shopRoutes);
router.use("/shop", shopRoutes);
router.use("/api/api/shop", shopRoutes);

export default router;