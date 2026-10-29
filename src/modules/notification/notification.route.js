import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import {
  getNotificationsController,
  getUnreadCountController,
  markAsReadController,
  markAllAsReadController,
  createNotificationController,
} from "./notification.controller.js";
import {
  validateNotificationId,
  validateCreateNotificationInput,
} from "./notification.validation.js";

const router = Router();

// Tất cả endpoints thông báo đều yêu cầu đăng nhập
router.use(authMiddleware);

// 1. Lấy danh sách thông báo của user (có phân trang & lọc isRead)
// GET /api/notifications
router.get("/", getNotificationsController);

// 2. Lấy số lượng thông báo chưa đọc
// GET /api/notifications/unread-count
router.get("/unread-count", getUnreadCountController);

// 3. Đánh dấu tất cả thông báo là đã đọc
// PATCH /api/notifications/read-all
router.patch("/read-all", markAllAsReadController);

// 4. Đánh dấu một thông báo là đã đọc
// PATCH /api/notifications/:id/read
router.patch("/:id/read", validateNotificationId, markAsReadController);

// 5. Tạo thông báo (cho user đã xác thực/admin)
// POST /api/notifications
router.post("/", validateCreateNotificationInput, createNotificationController);

export default router;
