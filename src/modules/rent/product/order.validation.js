const validateCreateOrder = (req, res, next) => {
  const { items, shippingAddress, paymentMethod } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    const error = new Error("Order must contain at least one item");
    error.statusCode = 400;
    error.errorCode = "EMPTY_ORDER_ITEMS";
    return next(error);
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemIndex = i + 1;

    if (!item.productName || !item.productName.trim()) {
      const error = new Error(`Item #${itemIndex}: Product name is required`);
      error.statusCode = 400;
      error.errorCode = "INVALID_ITEM_NAME";
      return next(error);
    }

    if (item.orderType && !["RENT", "THRIFT"].includes(item.orderType)) {
      const error = new Error(`Item #${itemIndex}: orderType must be RENT or THRIFT`);
      error.statusCode = 400;
      error.errorCode = "INVALID_ORDER_TYPE";
      return next(error);
    }

    if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1) {
      const error = new Error(`Item #${itemIndex}: Quantity must be a positive number`);
      error.statusCode = 400;
      error.errorCode = "INVALID_QUANTITY";
      return next(error);
    }

    if (item.price === undefined || typeof item.price !== "number" || item.price < 0) {
      const error = new Error(`Item #${itemIndex}: Price must be a non-negative number`);
      error.statusCode = 400;
      error.errorCode = "INVALID_PRICE";
      return next(error);
    }

    if (item.orderType === "RENT" || !item.orderType) {
      if (!item.rentalStartDate || isNaN(new Date(item.rentalStartDate).getTime())) {
        const error = new Error(`Item #${itemIndex}: Valid rental start date is required`);
        error.statusCode = 400;
        error.errorCode = "INVALID_RENTAL_START_DATE";
        return next(error);
      }

      if (!item.rentalEndDate || isNaN(new Date(item.rentalEndDate).getTime())) {
        const error = new Error(`Item #${itemIndex}: Valid rental end date is required`);
        error.statusCode = 400;
        error.errorCode = "INVALID_RENTAL_END_DATE";
        return next(error);
      }

      const start = new Date(item.rentalStartDate);
      const end = new Date(item.rentalEndDate);
      if (end < start) {
        const error = new Error(`Item #${itemIndex}: Rental end date must be on or after start date`);
        error.statusCode = 400;
        error.errorCode = "INVALID_RENTAL_DATE_RANGE";
        return next(error);
      }
    }
  }

  if (!shippingAddress || typeof shippingAddress !== "object") {
    const error = new Error("Shipping address is required");
    error.statusCode = 400;
    error.errorCode = "SHIPPING_ADDRESS_REQUIRED";
    return next(error);
  }

  const { recipientName, recipientPhone, province, district, ward, detail } = shippingAddress;

  if (!recipientName || !recipientName.trim()) {
    const error = new Error("Recipient name is required");
    error.statusCode = 400;
    error.errorCode = "RECIPIENT_NAME_REQUIRED";
    return next(error);
  }

  if (!recipientPhone || !recipientPhone.trim()) {
    const error = new Error("Recipient phone is required");
    error.statusCode = 400;
    error.errorCode = "RECIPIENT_PHONE_REQUIRED";
    return next(error);
  }

  if (!province || !province.trim()) {
    const error = new Error("Province is required");
    error.statusCode = 400;
    error.errorCode = "PROVINCE_REQUIRED";
    return next(error);
  }

  if (!district || !district.trim()) {
    const error = new Error("District is required");
    error.statusCode = 400;
    error.errorCode = "DISTRICT_REQUIRED";
    return next(error);
  }

  if (!ward || !ward.trim()) {
    const error = new Error("Ward is required");
    error.statusCode = 400;
    error.errorCode = "WARD_REQUIRED";
    return next(error);
  }

  if (!detail || !detail.trim()) {
    const error = new Error("Address detail is required");
    error.statusCode = 400;
    error.errorCode = "ADDRESS_DETAIL_REQUIRED";
    return next(error);
  }

  if (paymentMethod && !["COD", "VNPAY", "MOMO", "BANK_TRANSFER"].includes(paymentMethod)) {
    const error = new Error("Payment method must be COD, VNPAY, MOMO, or BANK_TRANSFER");
    error.statusCode = 400;
    error.errorCode = "INVALID_PAYMENT_METHOD";
    return next(error);
  }

  next();
};

const validateUpdateOrderStatus = (req, res, next) => {
  const { orderStatus } = req.body;
  const validStatuses = [
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "SHIPPING",
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
  ];

  if (!orderStatus || !validStatuses.includes(orderStatus)) {
    const error = new Error(`Order status must be one of: ${validStatuses.join(", ")}`);
    error.statusCode = 400;
    error.errorCode = "INVALID_ORDER_STATUS";
    return next(error);
  }

  next();
};

export {
  validateCreateOrder,
  validateUpdateOrderStatus,
};
