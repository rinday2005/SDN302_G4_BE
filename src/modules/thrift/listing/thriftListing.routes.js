import { Router } from "express";
import authMiddleware, { optionalAuthMiddleware } from "../../../middleware/auth.middleware.js";
import authorize from "../../../middleware/role.middleware.js";
import {
  getThriftListingsController,
  getThriftListingByIdController,
  createThriftListingController,
  updateThriftListingController,
  deleteThriftListingController,
} from "./thriftListing.controller.js";

const router = Router();

// 1. Xem danh sách sản phẩm thanh lý (Công khai)
router.get("/", getThriftListingsController);

// 2. Xem chi tiết sản phẩm thanh lý (Công khai)
router.get("/:id", getThriftListingByIdController);

// 3. Đăng bán sản phẩm thanh lý mới (Yêu cầu đăng nhập USER hoặc SHOP_OWNER)
router.post(
  "/",
  authMiddleware,
  authorize(["USER", "SHOP_OWNER", "ADMIN"]),
  createThriftListingController
);

// 4. Cập nhật sản phẩm thanh lý (Chủ shop hoặc Admin)
router.put(
  "/:id",
  authMiddleware,
  authorize(["USER", "SHOP_OWNER", "ADMIN"]),
  updateThriftListingController
);

// 5. Xóa / Ẩn sản phẩm thanh lý
router.delete(
  "/:id",
  authMiddleware,
  authorize(["USER", "SHOP_OWNER", "ADMIN"]),
  deleteThriftListingController
);

export default router;
