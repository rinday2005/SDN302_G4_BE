import { Router } from "express";
import authMiddleware from "../../../middleware/auth.middleware.js";
import authorize from "../../../middleware/role.middleware.js";
import upload from "../../../middleware/upload.middleware.js";
import {
  createReturnController,
  getMyReturnsController,
  getReturnByIdController,
  getReturnByOrderIdController,
  inspectReturnController,
} from "./return.controller.js";
import {
  validateCreateReturn,
  validateInspectReturn,
} from "./return.validation.js";

const router = Router();

// Tất cả API trong module return đều yêu cầu đăng nhập
router.use(authMiddleware);

// 1. Renter gửi yêu cầu trả đồ & ảnh đối kiểm hiện trạng
router.post(
  "/",
  authorize(["USER"]),
  upload.array("images", 5),
  validateCreateReturn,
  createReturnController
);

// 2. Renter xem danh sách các đơn đã gửi yêu cầu trả hàng
router.get("/my-returns", authorize(["USER"]), getMyReturnsController);

// 3. Xem chi tiết phiếu trả hàng theo orderId
router.get("/order/:orderId", getReturnByOrderIdController);

// 4. Xem chi tiết phiếu trả hàng theo returnId
router.get("/:id", getReturnByIdController);

// 5. Shop Owner / Bench Lab thẩm định đối soát và giải tỏa cọc
router.post(
  "/:id/inspect",
  authorize(["SHOP_OWNER", "ADMIN"]),
  validateInspectReturn,
  inspectReturnController
);

export default router;
