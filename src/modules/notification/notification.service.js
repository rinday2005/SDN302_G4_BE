import mongoose from "mongoose";
import Notification, { NOTIFICATION_TYPE } from "./notification.model.js";
import { getIO } from "../chat/chat.socket.js";

const createError = (message, statusCode = 400, errorCode = "BAD_REQUEST") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

/**
 * [BE-S6-02] Service Tự động Bắn Thông báo Hệ thống (In-app Notification)
 */

/**
 * Tạo Notification và bắn Socket.IO realtime tới room của User nhận
 * AC: Notification được tạo đúng User nhận; không gửi nhầm User; người dùng online nhận realtime.
 */
export const createNotification = async ({
  userId,
  title,
  message,
  type = NOTIFICATION_TYPE.SYSTEM,
  link = "",
  metadata = {},
}) => {
  if (!userId) {
    throw createError("userId là bắt buộc để tạo thông báo", 400, "MISSING_USER_ID");
  }
  if (!title || !String(title).trim()) {
    throw createError("title là bắt buộc để tạo thông báo", 400, "MISSING_TITLE");
  }
  if (!message || !String(message).trim()) {
    throw createError("message là bắt buộc để tạo thông báo", 400, "MISSING_MESSAGE");
  }

  const notification = await Notification.create({
    userId,
    title: String(title).trim(),
    message: String(message).trim(),
    type,
    link: String(link || "").trim(),
    isRead: false,
    metadata,
  });

  // Bắn Socket.IO realtime tới room riêng của User: `user:${userId}`
  try {
    const io = getIO();
    if (io) {
      const room = `user:${userId.toString()}`;
      io.to(room).emit("notification", notification);
      io.to(room).emit("new_notification", notification);
    }
  } catch (socketErr) {
    console.error("[Notification] Socket emission error:", socketErr.message);
  }

  return notification;
};

/**
 * Helper an toàn để gọi từ các module khác (Order, Payment, Admin...)
 * Không làm crash luồng chính nếu có lỗi xảy ra
 */
export const sendSystemNotificationSafe = async (payload) => {
  try {
    return await createNotification(payload);
  } catch (err) {
    console.error("[Notification] Non-blocking notification creation error:", err.message);
    return null;
  }
};

/**
 * Lấy danh sách notifications của một user (phân trang + đếm số chưa đọc)
 * AC: Chỉ User hiện tại mới được xem thông báo của mình.
 */
export const getUserNotifications = async (userId, { page = 1, limit = 20, isRead } = {}) => {
  const query = { userId };

  if (isRead !== undefined && isRead !== null && isRead !== "") {
    query.isRead = String(isRead) === "true";
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const skip = (pageNum - 1) * limitNum;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    Notification.countDocuments(query),
    Notification.countDocuments({ userId, isRead: false }),
  ]);

  return {
    notifications,
    total,
    unreadCount,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
};

/**
 * Đếm số lượng thông báo chưa đọc của user
 */
export const getUnreadNotificationCount = async (userId) => {
  const count = await Notification.countDocuments({ userId, isRead: false });
  return { unreadCount: count };
};

/**
 * Đánh dấu một thông báo là đã đọc
 * AC: Notification có thể đánh dấu đã đọc; chỉ chính chủ mới được sửa.
 */
export const markNotificationAsRead = async (userId, notificationId) => {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw createError("notificationId không hợp lệ", 400, "INVALID_ID");
  }

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    throw createError("Không tìm thấy thông báo", 404, "NOTIFICATION_NOT_FOUND");
  }

  // Chặn IDOR: Không cho phép User này sửa thông báo của User khác
  if (notification.userId.toString() !== userId.toString()) {
    throw createError("Bạn không có quyền thao tác trên thông báo này", 403, "FORBIDDEN");
  }

  notification.isRead = true;
  await notification.save();

  return notification;
};

/**
 * Đánh dấu tất cả thông báo của user là đã đọc
 */
export const markAllNotificationsAsRead = async (userId) => {
  await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
  return { success: true, message: "Đã đánh dấu tất cả thông báo là đã đọc" };
};
