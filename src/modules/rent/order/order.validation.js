import { RENTAL_ORDER_STATUS } from "./order.model.js";

const fail = (next, message, errorCode) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.errorCode = errorCode;
  return next(error);
};

// POST /api/rent/orders  body: { startDate, endDate, shippingAddress }
// RENT items được lấy từ Cart của user, không nhận từ client
const validateCreateOrder = (req, res, next) => {
  const { startDate, endDate, shippingAddress } = req.body;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (!startDate || isNaN(start.getTime())) {
    return fail(next, "Valid startDate is required", "INVALID_START_DATE");
  }

  if (!endDate || isNaN(end.getTime())) {
    return fail(next, "Valid endDate is required", "INVALID_END_DATE");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today) {
    return fail(next, "startDate cannot be in the past", "START_DATE_IN_PAST");
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

const validateHandoverOrder = (req, res, next) => {
  const { carrierName, trackingCode, status } = req.body;

  if (!carrierName || typeof carrierName !== "string" || !carrierName.trim()) {
    return fail(next, "carrierName là bắt buộc", "CARRIER_NAME_REQUIRED");
  }

  if (!trackingCode || typeof trackingCode !== "string" || !trackingCode.trim()) {
    return fail(next, "trackingCode là bắt buộc", "TRACKING_CODE_REQUIRED");
  }

  if (
    status !== undefined &&
    !["READY_FOR_HANDOVER", "HANDED_OVER"].includes(status)
  ) {
    return fail(
      next,
      "status bàn giao chỉ nhận: READY_FOR_HANDOVER hoặc HANDED_OVER",
      "INVALID_HANDOVER_STATUS"
    );
  }

  next();
};

const validateRequestReturnOrder = (req, res, next) => {
  const { images } = req.body;
  const hasFiles = (req.files && req.files.length > 0) || req.file;

  const hasBodyImages =
    (Array.isArray(images) && images.some((img) => typeof img === "string" && img.trim())) ||
    (typeof images === "string" && images.trim());

  if (!hasFiles && !hasBodyImages) {
    return fail(
      next,
      "Bắt buộc phải cung cấp ít nhất một hình ảnh hiện trạng sản phẩm",
      "IMAGES_REQUIRED"
    );
  }

  next();
};

export {
  validateCreateOrder,
  validateUpdateOrderStatus,
  validateHandoverOrder,
  validateRequestReturnOrder,
};
