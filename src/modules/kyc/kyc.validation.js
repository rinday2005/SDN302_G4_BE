export const validateSubmitKyc = (req, res, next) => {
  const idCardNumber = req.body?.idCardNumber || req.body?.citizenId;
  const frontImageUrl = req.body?.frontImageUrl || req.body?.cardFrontUrl;
  const backImageUrl = req.body?.backImageUrl || req.body?.cardBackUrl;

  if (!idCardNumber || !String(idCardNumber).trim()) {
    const error = new Error("Số CCCD/CMND (idCardNumber) là bắt buộc");
    error.statusCode = 400;
    error.errorCode = "ID_CARD_NUMBER_REQUIRED";
    return next(error);
  }

  if (!frontImageUrl || !String(frontImageUrl).trim()) {
    const error = new Error("Ảnh mặt trước CCCD (frontImageUrl) là bắt buộc");
    error.statusCode = 400;
    error.errorCode = "FRONT_IMAGE_URL_REQUIRED";
    return next(error);
  }

  if (!backImageUrl || !String(backImageUrl).trim()) {
    const error = new Error("Ảnh mặt sau CCCD (backImageUrl) là bắt buộc");
    error.statusCode = 400;
    error.errorCode = "BACK_IMAGE_URL_REQUIRED";
    return next(error);
  }

  next();
};

export const validateAdminReviewKyc = (req, res, next) => {
  const { status, rejectionReason } = req.body || {};

  if (!status || !["APPROVED", "REJECTED"].includes(status)) {
    const error = new Error("Trạng thái duyệt KYC phải là APPROVED hoặc REJECTED");
    error.statusCode = 400;
    error.errorCode = "INVALID_KYC_STATUS";
    return next(error);
  }

  if (status === "REJECTED") {
    if (!rejectionReason || !String(rejectionReason).trim()) {
      const error = new Error("Lý do từ chối (rejectionReason) là bắt buộc khi từ chối hồ sơ KYC");
      error.statusCode = 400;
      error.errorCode = "REJECTION_REASON_REQUIRED";
      return next(error);
    }
  }

  next();
};
