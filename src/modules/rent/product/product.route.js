import express from "express";
import authMiddleware from "../../../middleware/auth.middleware.js";

import {
  createProductController,
  updateProductController,
  deleteProductController,
  getPublicProductsController,
  getPublicProductDetailController,
  getShopProductsController,
} from "./product.controller.js";

const router = express.Router();

/**
 * Middleware chỉ cho SHOP_OWNER
 */
const requireShopOwner = (req, res, next) => {
  if (!req.user || req.user.role !== "SHOP_OWNER") {
    return res.status(403).json({
      success: false,
      message: "Chỉ Shop Owner mới có quyền thực hiện thao tác này",
    });
  }

  next();
};

/**
 * =====================================================
 * PUBLIC ROUTES
 * =====================================================
 */

/**
 * [BE-S2-05]
 * GET /api/rent/products
 *
 * Search + filter + sort + pagination
 */
router.get(
  "/",
  getPublicProductsController
);

/**
 * SHOP_OWNER lấy toàn bộ sản phẩm của shop mình (bao gồm PENDING, APPROVED, REJECTED)
 */
router.get(
  "/shop/mine",
  authMiddleware,
  requireShopOwner,
  getShopProductsController
);

/**
 * [BE-S2-06]
 * GET /api/rent/products/:id
 *
 * Product detail + Shop Owner + Availability Calendar
 *
 * Route này phải đặt SAU /shop/mine để tránh nuốt URL
 * để Guest có thể xem sản phẩm APPROVED.
 */
router.get(
  "/:id",
  getPublicProductDetailController
);

/**
 * =====================================================
 * PROTECTED ROUTES
 * =====================================================
 *
 * Từ đây trở xuống bắt buộc đăng nhập.
 */
router.use(authMiddleware);

/**
 * Chỉ SHOP_OWNER được tạo / sửa / xóa sản phẩm.
 */
router.use(requireShopOwner);

/**
 * SHOP_OWNER tạo sản phẩm RENT
 */
router.post(
  "/",
  createProductController
);

/**
 * SHOP_OWNER cập nhật sản phẩm RENT
 */
router.put(
  "/:id",
  updateProductController
);

/**
 * SHOP_OWNER xóa sản phẩm RENT
 */
router.delete(
  "/:id",
  deleteProductController
);

export default router;