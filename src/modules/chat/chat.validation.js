import mongoose from "mongoose";

export const validateSendMessage = (req, res, next) => {
  const { text, imageUrl } = req.body || {};

  const trimmedText = typeof text === "string" ? text.trim() : "";
  const trimmedImageUrl = typeof imageUrl === "string" ? imageUrl.trim() : "";

  if (!trimmedText && !trimmedImageUrl) {
    const error = new Error("Message text or image URL is required");
    error.statusCode = 400;
    error.errorCode = "MESSAGE_CONTENT_REQUIRED";
    return next(error);
  }

  next();
};

export const validateConversationIdParam = (req, res, next) => {
  const { id } = req.params;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error("Invalid conversation ID");
    error.statusCode = 400;
    error.errorCode = "INVALID_ID";
    return next(error);
  }

  next();
};
