import mongoose from "mongoose";

const createError = (message, statusCode = 400, errorCode = "BAD_REQUEST") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

/**
 * [BE-S6-01] Validation middleware for Wishlist APIs
 */
export const validateToggleWishlist = (req, res, next) => {
  const itemId = req.body?.itemId || req.body?.productId;
  const itemType = req.body?.itemType || req.body?.productType;

  if (!itemId || !String(itemId).trim()) {
    return next(
      createError(
        "itemId (hoặc productId) là bắt buộc",
        400,
        "INVALID_INPUT"
      )
    );
  }

  if (itemType) {
    const normalizedType = String(itemType).trim().toUpperCase();
    if (!["RENT", "THRIFT"].includes(normalizedType)) {
      return next(
        createError(
          "itemType phải là 'RENT' hoặc 'THRIFT'",
          400,
          "INVALID_ITEM_TYPE"
        )
      );
    }
    // Gán lại type đã chuẩn hóa vào body
    req.body.itemType = normalizedType;
    req.body.productType = normalizedType;
  }

  next();
};
