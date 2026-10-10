import mongoose from "mongoose";
import { RENTAL_ORDER_STATUS } from "./order.model.js";

const fail = (next, message, errorCode) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.errorCode = errorCode;
  return next(error);
};

const validateCreateOrder = (req, res, next) => {
  const { items, startDate, endDate, shippingAddress } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return fail(next, "Order must contain at least one item", "EMPTY_ORDER_ITEMS");
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemIndex = i + 1;

    if (!item || !mongoose.Types.ObjectId.isValid(item.productId)) {
      return fail(next, `Item #${itemIndex}: productId không hợp lệ`, "INVALID_PRODUCT_ID");
    }

    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return fail(next, `Item #${itemIndex}: Quantity must be a positive integer`, "INVALID_QUANTITY");
    }
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (!startDate || isNaN(start.getTime())) {
    return fail(next, "Valid startDate is required", "INVALID_START_DATE");
  }

  if (!endDate || isNaN(end.getTime())) {
    return fail(next, "Valid endDate is required", "INVALID_END_DATE");
  }

  if (end < start) {
    return fail(next, "endDate must be on or after startDate", "INVALID_DATE_RANGE");
  }

  if (!shippingAddress || typeof shippingAddress !== "object") {
    return fail(next, "Shipping address is required", "SHIPPING_ADDRESS_REQUIRED");
  }

  const requiredAddressFields = [
    ["recipientName", "Recipient name is required", "RECIPIENT_NAME_REQUIRED"],
    ["recipientPhone", "Recipient phone is required", "RECIPIENT_PHONE_REQUIRED"],
    ["province", "Province is required", "PROVINCE_REQUIRED"],
    ["district", "District is required", "DISTRICT_REQUIRED"],
    ["ward", "Ward is required", "WARD_REQUIRED"],
    ["detail", "Address detail is required", "ADDRESS_DETAIL_REQUIRED"],
  ];

  for (const [field, message, errorCode] of requiredAddressFields) {
    const value = shippingAddress[field];
    if (typeof value !== "string" || !value.trim()) {
      return fail(next, message, errorCode);
    }
  }

  next();
};

const validateUpdateOrderStatus = (req, res, next) => {
  const { status } = req.body;
  const validStatuses = Object.values(RENTAL_ORDER_STATUS);

  if (!status || !validStatuses.includes(status)) {
    return fail(next, `Order status must be one of: ${validStatuses.join(", ")}`, "INVALID_ORDER_STATUS");
  }

  next();
};

export {
  validateCreateOrder,
  validateUpdateOrderStatus,
};
