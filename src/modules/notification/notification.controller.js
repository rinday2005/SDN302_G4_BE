import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification,
} from "./notification.service.js";
import { successResponse } from "../../utils/response.js";

/**
 * [BE-S6-02] Notification Controller
 */

/**
 * Lấy danh sách thông báo của người dùng hiện tại
 * GET /api/notifications
 */
export const getNotificationsController = async (req, res, next) => {
  try {
    const { page, limit, isRead } = req.query;
    const result = await getUserNotifications(req.user._id, { page, limit, isRead });

    return successResponse(res, "Lấy danh sách thông báo thành công", result);
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy số lượng thông báo chưa đọc
 * GET /api/notifications/unread-count
 */
export const getUnreadCountController = async (req, res, next) => {
  try {
    const result = await getUnreadNotificationCount(req.user._id);

    return successResponse(res, "Lấy số lượng thông báo chưa đọc thành công", result);
  } catch (error) {
    next(error);
  }
};

/**
 * Đánh dấu một thông báo là đã đọc
 * PATCH /api/notifications/:id/read
 */
export const markAsReadController = async (req, res, next) => {
  try {
    const result = await markNotificationAsRead(req.user._id, req.params.id);

    return successResponse(res, "Đánh dấu thông báo đã đọc thành công", result);
  } catch (error) {
    next(error);
  }
};

/**
 * Đánh dấu tất cả thông báo là đã đọc
 * PATCH /api/notifications/read-all
 */
export const markAllAsReadController = async (req, res, next) => {
  try {
    const result = await markAllNotificationsAsRead(req.user._id);

    return successResponse(res, "Đã đánh dấu tất cả thông báo là đã đọc", result);
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo thông báo trực tiếp qua API
 * POST /api/notifications
 */
export const createNotificationController = async (req, res, next) => {
  try {
    const { userId, title, message, type, link, metadata } = req.body;
    const result = await createNotification({
      userId,
      title,
      message,
      type,
      link,
      metadata,
    });

    return successResponse(res, "Tạo thông báo thành công", result, 201);
  } catch (error) {
    next(error);
  }
};
