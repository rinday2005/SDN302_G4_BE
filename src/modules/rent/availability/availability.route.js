import { Router } from "express";
import authMiddleware, { optionalAuthMiddleware } from "../../../middleware/auth.middleware.js";
import authorize from "../../../middleware/role.middleware.js";
import {
  checkAvailabilityController,
  getProductBookedDatesController,
  blockDatesController,
} from "./availability.controller.js";
import {
  validateCheckAvailability,
  validateBlockDates,
} from "./availability.validation.js";

const router = Router();

// 1. Kiểm tra tính sẵn sàng theo khoảng thời gian (Public hoặc có đăng nhập)
router.get("/check", validateCheckAvailability, checkAvailabilityController);
router.post("/check", validateCheckAvailability, checkAvailabilityController);

// 2. Lấy các khoảng thời gian đã được đặt của sản phẩm (cho DatePicker lịch FE)
router.get("/:productId/booked-dates", getProductBookedDatesController);

// 3. Shop Owner / Admin khóa ngày bảo dưỡng thiết bị
router.post(
  "/block",
  authMiddleware,
  authorize(["SHOP_OWNER", "ADMIN"]),
  validateBlockDates,
  blockDatesController
);

export default router;
