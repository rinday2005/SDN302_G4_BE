import {
  createReview,
  getProductReviews,
  getOrderReviews,
  getProductReviewsForAI,
} from "./review.service.js";

/**
 * POST /api/reviews
 * Hỗ trợ tạo review từ Order hoặc từ Product Detail
 */
const createReviewController = async (req, res, next) => {
  try {
    const review = await createReview({
      orderId: req.body.orderId,
      orderType: req.body.orderType,
      productId: req.body.productId,
      productType: req.body.productType,
      userId: req.user._id,
      rating: req.body.rating,
      comment: req.body.comment,
      images: req.body.images,
    });

    return res.status(201).json({
      success: true,
      message: "Đánh giá sản phẩm thành công",
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reviews/product/:productId
 * Lấy danh sách đánh giá & thống kê sao của sản phẩm (Rent hoặc Thrift)
 */
const getProductReviewsController = async (req, res, next) => {
  try {
    const result = await getProductReviews(
      req.params.productId,
      req.query
    );

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách đánh giá thành công",
      data: result.reviews,
      ratingSummary: result.ratingSummary,
      pagination: result.pagination,
      productType: result.productType,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reviews/order/:orderId
 * Xem trạng thái đánh giá các sản phẩm trong đơn hàng (RentOrder hoặc ThriftOrder)
 */
const getOrderReviewsController = async (req, res, next) => {
  try {
    const result = await getOrderReviews(
      req.params.orderId,
      req.user._id
    );

    return res.status(200).json({
      success: true,
      message: "Lấy đánh giá của đơn hàng thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reviews/product/:productId/ai-summary
 * Tổng hợp đánh giá và cảm xúc khách hàng phục vụ tính năng AI
 */
const getAIProductReviewSummaryController = async (req, res, next) => {
  try {
    const result = await getProductReviewsForAI(
      req.params.productId,
      req.query.productType
    );

    return res.status(200).json({
      success: true,
      message: "Phân tích dữ liệu đánh giá sản phẩm cho AI thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export {
  createReviewController,
  getProductReviewsController,
  getOrderReviewsController,
  getAIProductReviewSummaryController,
};
