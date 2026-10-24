import { Router } from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import authorize from "../../middleware/role.middleware.js";

import {
  createReviewController,
  getProductReviewsController,
  getOrderReviewsController,
} from "./review.controller.js";

import {
  validateCreateReview,
} from "./review.validation.js";

const router = Router();

/**
 * =====================================================
 * PUBLIC
 * =====================================================
 */

/**
 * Product detail có thể lấy review mà không cần login.
 */
router.get(
  "/product/:productId",
  getProductReviewsController
);

/**
 * =====================================================
 * PROTECTED
 * =====================================================
 */

router.use(authMiddleware);

/**
 * User tạo review.
 */
router.post(
  "/",
  authorize(["USER"]),
  validateCreateReview,
  createReviewController
);

/**
 * User xem những review mình đã gửi trong order.
 */
router.get(
  "/order/:orderId",
  authorize(["USER"]),
  getOrderReviewsController
);

export default router;