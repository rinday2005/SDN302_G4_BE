export const validateCheckAvailability = (req, res, next) => {
  const data = req.body && Object.keys(req.body).length > 0 ? req.body : req.query || {};
  const { productId, startDate, endDate, quantity } = data;

  if (!productId) {
    const error = new Error("productId là bắt buộc");
    error.statusCode = 400;
    error.errorCode = "MISSING_PRODUCT_ID";
    return next(error);
  }

  if (!startDate || !endDate) {
    const error = new Error("startDate và endDate là bắt buộc");
    error.statusCode = 400;
    error.errorCode = "MISSING_DATE_RANGE";
    return next(error);
  }

  if (quantity !== undefined && Number(quantity) <= 0) {
    const error = new Error("quantity phải lớn hơn 0");
    error.statusCode = 400;
    error.errorCode = "INVALID_QUANTITY";
    return next(error);
  }

  next();
};

export const validateBlockDates = (req, res, next) => {
  const data = req.body || {};
  const { productId, startDate, endDate } = data;

  if (!productId || !startDate || !endDate) {
    const error = new Error("productId, startDate và endDate là bắt buộc");
    error.statusCode = 400;
    error.errorCode = "MISSING_REQUIRED_FIELDS";
    return next(error);
  }

  next();
};
