import {
  createReview,
  getProductReviews,
  getOrderReviews,
} from "./review.service.js";

/**
 * POST /api/reviews
 */
const createReviewController =
  async (
    req,
    res,
    next
  ) => {
    try {
      const review =
        await createReview({
          orderId:
            req.body.orderId,

          productId:
            req.body.productId,

          userId:
            req.user._id,

          rating:
            req.body.rating,

          comment:
            req.body.comment,

          images:
            req.body.images,
        });

      return res.status(201).json({
        success: true,

        message:
          "Đánh giá sản phẩm thành công",

        data: review,
      });
    } catch (error) {
      next(error);
    }
  };

/**
 * GET /api/reviews/product/:productId
 */
const getProductReviewsController =
  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await getProductReviews(
          req.params.productId,
          req.query
        );

      return res.status(200).json({
        success: true,

        message:
          "Lấy danh sách đánh giá thành công",

        data: result.reviews,

        ratingSummary:
          result.ratingSummary,

        pagination:
          result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

/**
 * GET /api/reviews/order/:orderId
 */
const getOrderReviewsController =
  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await getOrderReviews(
          req.params.orderId,
          req.user._id
        );

      return res.status(200).json({
        success: true,

        message:
          "Lấy đánh giá của đơn hàng thành công",

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
};