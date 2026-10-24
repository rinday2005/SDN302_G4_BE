export const validateReviewListing = (req, res, next) => {
  const { status, rejectionReason } = req.body || {};

  if (!status || !["APPROVED", "REJECTED"].includes(status)) {
    const error = new Error("Trạng thái kiểm duyệt listing phải là APPROVED hoặc REJECTED");
    error.statusCode = 400;
    error.errorCode = "INVALID_LISTING_STATUS";
    return next(error);
  }

  if (status === "REJECTED" && (!rejectionReason || !String(rejectionReason).trim())) {
    const error = new Error("Lý do từ chối (rejectionReason) là bắt buộc khi từ chối listing");
    error.statusCode = 400;
    error.errorCode = "REJECTION_REASON_REQUIRED";
    return next(error);
  }

  next();
};

export const validateResolveDispute = (req, res, next) => {
  const { resolution, refundToRenter, payoutToShop } = req.body || {};

  const allowedResolutions = ["REFUND_RENTER", "PAY_SHOP_OWNER", "SPLIT", "DISMISSED"];
  if (!resolution || !allowedResolutions.includes(resolution)) {
    const error = new Error(
      `Phương án xử lý tranh chấp (resolution) không hợp lệ. Phải là một trong: ${allowedResolutions.join(", ")}`
    );
    error.statusCode = 400;
    error.errorCode = "INVALID_DISPUTE_RESOLUTION";
    return next(error);
  }

  if (refundToRenter !== undefined && (isNaN(Number(refundToRenter)) || Number(refundToRenter) < 0)) {
    const error = new Error("Số tiền hoàn trả cho Renter (refundToRenter) phải là số không âm");
    error.statusCode = 400;
    error.errorCode = "INVALID_REFUND_AMOUNT";
    return next(error);
  }

  if (payoutToShop !== undefined && (isNaN(Number(payoutToShop)) || Number(payoutToShop) < 0)) {
    const error = new Error("Số tiền bồi thường cho Shop Owner (payoutToShop) phải là số không âm");
    error.statusCode = 400;
    error.errorCode = "INVALID_PAYOUT_AMOUNT";
    return next(error);
  }

  next();
};
