export const validateCreateReturn = (req, res, next) => {
  const { orderId } = req.body;

  if (!orderId) {
    const error = new Error("orderId là bắt buộc");
    error.statusCode = 400;
    error.errorCode = "MISSING_ORDER_ID";
    return next(error);
  }

  next();
};

export const validateInspectReturn = (req, res, next) => {
  const { isApproved, deductionAmount } = req.body;

  if (isApproved === undefined) {
    const error = new Error("isApproved (kết quả kiểm định) là bắt buộc");
    error.statusCode = 400;
    error.errorCode = "MISSING_INSPECTION_DECISION";
    return next(error);
  }

  if (deductionAmount !== undefined && Number(deductionAmount) < 0) {
    const error = new Error("deductionAmount (tiền khấu trừ) không được âm");
    error.statusCode = 400;
    error.errorCode = "INVALID_DEDUCTION_AMOUNT";
    return next(error);
  }

  next();
};
