import mongoose from "mongoose";

const validateCreateReview = (req, res, next) => {
  const {
    orderId,
    productId,
    rating,
    comment,
    images,
    productType,
    orderType,
  } = req.body;

  if (!productId) {
    return res.status(400).json({
      success: false,
      message: "productId là bắt buộc",
      errorCode: "PRODUCT_ID_REQUIRED",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({
      success: false,
      message: "productId không hợp lệ",
      errorCode: "INVALID_PRODUCT_ID",
    });
  }

  // orderId là tùy chọn (cho phép review/comment trực tiếp từ trang product detail)
  if (orderId && !mongoose.Types.ObjectId.isValid(orderId)) {
    return res.status(400).json({
      success: false,
      message: "orderId không hợp lệ",
      errorCode: "INVALID_ORDER_ID",
    });
  }

  if (rating === undefined || rating === null || rating === "") {
    return res.status(400).json({
      success: false,
      message: "rating là bắt buộc",
      errorCode: "RATING_REQUIRED",
    });
  }

  const parsedRating = Number(rating);

  if (
    !Number.isInteger(parsedRating) ||
    parsedRating < 1 ||
    parsedRating > 5
  ) {
    return res.status(400).json({
      success: false,
      message: "Rating chỉ được từ 1 đến 5",
      errorCode: "INVALID_RATING",
    });
  }

  if (comment !== undefined && typeof comment !== "string") {
    return res.status(400).json({
      success: false,
      message: "comment phải là chuỗi",
      errorCode: "INVALID_COMMENT",
    });
  }

  if (typeof comment === "string" && comment.length > 2000) {
    return res.status(400).json({
      success: false,
      message: "comment tối đa 2000 ký tự",
      errorCode: "COMMENT_TOO_LONG",
    });
  }

  if (images !== undefined && !Array.isArray(images)) {
    return res.status(400).json({
      success: false,
      message: "images phải là một mảng",
      errorCode: "INVALID_IMAGES",
    });
  }

  if (Array.isArray(images) && images.length > 5) {
    return res.status(400).json({
      success: false,
      message: "Tối đa 5 hình ảnh cho mỗi review",
      errorCode: "TOO_MANY_IMAGES",
    });
  }

  if (
    productType &&
    !["RENT", "THRIFT"].includes(String(productType).toUpperCase())
  ) {
    return res.status(400).json({
      success: false,
      message: "productType chỉ có thể là RENT hoặc THRIFT",
      errorCode: "INVALID_PRODUCT_TYPE",
    });
  }

  if (
    orderType &&
    !["RENT", "THRIFT"].includes(String(orderType).toUpperCase())
  ) {
    return res.status(400).json({
      success: false,
      message: "orderType chỉ có thể là RENT hoặc THRIFT",
      errorCode: "INVALID_ORDER_TYPE",
    });
  }

  next();
};

export { validateCreateReview };
