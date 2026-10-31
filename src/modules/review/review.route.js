import { Router } from "express";

import authMiddleware from "../../middleware/auth.middleware.js";

import {
  createReviewController,
  getProductReviewsController,
  getOrderReviewsController,
  getAIProductReviewSummaryController,
} from "./review.controller.js";

import { validateCreateReview } from "./review.validation.js";

const router = Router();

/**
 * =====================================================
 * PUBLIC ROUTES
 * =====================================================
 */

/**
 * Lấy danh sách đánh giá của sản phẩm (Rent hoặc Thrift Detail)
 * Hỗ trợ query: ?page=1&limit=10&productType=RENT&rating=5
 */
router.get("/product/:productId", getProductReviewsController);

/**
 * Lấy dữ liệu phân tích đánh giá phục vụ AI model và tính năng thông minh
 */
router.get(
  "/product/:productId/ai-summary",
  getAIProductReviewSummaryController
);

/**
 * =====================================================
 * PROTECTED ROUTES (Yêu cầu tài khoản thực đã xác thực)
 * =====================================================
 */
router.use(authMiddleware);

/**
 * Gửi đánh giá / bình luận (từ trang Order hoặc trực tiếp từ Product Detail)
 */
router.post("/", validateCreateReview, createReviewController);

/**
 * Lấy danh sách các đánh giá của người dùng trong đơn hàng
 */
router.get("/order/:orderId", getOrderReviewsController);

export default router;
