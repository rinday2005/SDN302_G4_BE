import mongoose from "mongoose";

const createError = (message, statusCode = 400, errorCode = "BAD_REQUEST") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

/**
 * [BE-S6-02] Notification Validation Middleware
 */

export const validateNotificationId = (req, res, next) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return next(createError("ID thông báo không hợp lệ", 400, "INVALID_NOTIFICATION_ID"));
  }
  next();
};

export const validateCreateNotificationInput = (req, res, next) => {
  const { userId, title, message } = req.body || {};

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(createError("userId là bắt buộc và phải là ObjectId hợp lệ", 400, "INVALID_USER_ID"));
  }
  if (!title || !String(title).trim()) {
    return next(createError("title là bắt buộc", 400, "MISSING_TITLE"));
  }
  if (!message || !String(message).trim()) {
    return next(createError("message là bắt buộc", 400, "MISSING_MESSAGE"));
  }

  next();
};
