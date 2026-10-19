import mongoose from "mongoose";

import Review from "./review.model.js";
import RentalOrder from "../rent/order/order.model.js";
import RentalProduct from "../rent/product/product.model.js";

const createError = (
  message,
  statusCode,
  errorCode
) => {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.errorCode = errorCode;

  return error;
};

const assertValidObjectId = (
  value,
  fieldName
) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw createError(
      `${fieldName} không hợp lệ`,
      400,
      `INVALID_${fieldName.toUpperCase()}`
    );
  }
};

/**
 * =====================================================
 * CREATE REVIEW
 * =====================================================
 *
 * AC:
 * - User chỉ review order của chính mình
 * - Order phải COMPLETED
 * - product phải thuộc order
 * - Mỗi product trong cùng order chỉ review 1 lần
 * - rating 1 -> 5
 */
const createReview = async ({
  orderId,
  productId,
  userId,
  rating,
  comment = "",
  images = [],
}) => {
  assertValidObjectId(
    orderId,
    "orderId"
  );

  assertValidObjectId(
    productId,
    "productId"
  );

  assertValidObjectId(
    userId,
    "userId"
  );

  const parsedRating = Number(rating);

  if (
    !Number.isInteger(parsedRating) ||
    parsedRating < 1 ||
    parsedRating > 5
  ) {
    throw createError(
      "Rating chỉ được từ 1 đến 5",
      400,
      "INVALID_RATING"
    );
  }

  if (
    images !== undefined &&
    !Array.isArray(images)
  ) {
    throw createError(
      "images phải là một mảng",
      400,
      "INVALID_IMAGES"
    );
  }

  if (
    Array.isArray(images) &&
    images.length > 5
  ) {
    throw createError(
      "Mỗi review được tối đa 5 hình ảnh",
      400,
      "TOO_MANY_IMAGES"
    );
  }

  /**
   * 1. Tìm order
   */
  const order =
    await RentalOrder.findById(orderId);

  if (!order) {
    throw createError(
      "Đơn thuê không tồn tại",
      404,
      "ORDER_NOT_FOUND"
    );
  }

  /**
   * 2. Order phải thuộc USER đang đăng nhập
   */
  if (
    order.renterId.toString() !==
    userId.toString()
  ) {
    throw createError(
      "Bạn không có quyền đánh giá đơn hàng này",
      403,
      "REVIEW_FORBIDDEN"
    );
  }

  /**
   * 3. Chỉ order COMPLETED mới được review
   */
  if (order.status !== "COMPLETED") {
    throw createError(
      "Chỉ có thể đánh giá khi đơn hàng đã hoàn tất",
      400,
      "ORDER_NOT_COMPLETED"
    );
  }

  /**
   * 4. product phải thực sự nằm trong order.items[]
   */
  const itemInOrder = order.items.find(
    (item) =>
      item.productId.toString() ===
      productId.toString()
  );

  if (!itemInOrder) {
    throw createError(
      "Sản phẩm không thuộc đơn hàng này",
      400,
      "PRODUCT_NOT_IN_ORDER"
    );
  }

  /**
   * 5. Kiểm tra product vẫn tồn tại.
   *
   * Dù order đã có snapshot, giữ check này để
   * dữ liệu review tham chiếu đến RentalProduct hợp lệ.
   */
  const product =
    await RentalProduct.findById(
      productId
    ).select("_id name");

  if (!product) {
    throw createError(
      "Sản phẩm không tồn tại",
      404,
      "PRODUCT_NOT_FOUND"
    );
  }

  /**
   * 6. Không cho duplicate.
   */
  const existingReview =
    await Review.findOne({
      orderId,
      productId,
      userId,
    });

  if (existingReview) {
    throw createError(
      "Bạn đã đánh giá sản phẩm này trong đơn hàng",
      409,
      "REVIEW_ALREADY_EXISTS"
    );
  }

  try {
    const review =
      await Review.create({
        orderId,
        productId,
        userId,
        rating: parsedRating,

        comment:
          typeof comment === "string"
            ? comment.trim()
            : "",

        images:
          Array.isArray(images)
            ? images
                .filter(
                  (image) =>
                    typeof image ===
                      "string" &&
                    image.trim()
                )
                .map((image) =>
                  image.trim()
                )
            : [],
      });

    return await Review.findById(
      review._id
    )
      .populate(
        "userId",
        "fullName avatarUrl"
      )
      .populate(
        "productId",
        "name images"
      )
      .lean();
  } catch (error) {
    /**
     * Phòng race condition:
     * 2 request duplicate gửi cùng lúc.
     */
    if (error?.code === 11000) {
      throw createError(
        "Bạn đã đánh giá sản phẩm này trong đơn hàng",
        409,
        "REVIEW_ALREADY_EXISTS"
      );
    }

    throw error;
  }
};

/**
 * =====================================================
 * GET REVIEWS BY PRODUCT
 * =====================================================
 *
 * Dùng cho FE Product Detail.
 */
const getProductReviews = async (
  productId,
  {
    page = 1,
    limit = 10,
  } = {}
) => {
  assertValidObjectId(
    productId,
    "productId"
  );

  const product =
    await RentalProduct.findById(
      productId
    ).select("_id");

  if (!product) {
    throw createError(
      "Sản phẩm không tồn tại",
      404,
      "PRODUCT_NOT_FOUND"
    );
  }

  const parsedPage = Math.max(
    1,
    Number(page) || 1
  );

  const parsedLimit = Math.min(
    50,
    Math.max(
      1,
      Number(limit) || 10
    )
  );

  const skip =
    (parsedPage - 1) *
    parsedLimit;

  const [
    reviews,
    total,
    ratingStats,
  ] = await Promise.all([
    Review.find({
      productId,
    })
      .populate(
        "userId",
        "fullName avatarUrl"
      )
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),

    Review.countDocuments({
      productId,
    }),

    Review.aggregate([
      {
        $match: {
          productId:
            new mongoose.Types.ObjectId(
              productId
            ),
        },
      },

      {
        $group: {
          _id: null,

          averageRating: {
            $avg: "$rating",
          },

          totalReviews: {
            $sum: 1,
          },

          rating5: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$rating",
                    5,
                  ],
                },
                1,
                0,
              ],
            },
          },

          rating4: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$rating",
                    4,
                  ],
                },
                1,
                0,
              ],
            },
          },

          rating3: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$rating",
                    3,
                  ],
                },
                1,
                0,
              ],
            },
          },

          rating2: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$rating",
                    2,
                  ],
                },
                1,
                0,
              ],
            },
          },

          rating1: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$rating",
                    1,
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const stats =
    ratingStats[0] || {};

  const averageRating =
    stats.averageRating
      ? Number(
          stats.averageRating.toFixed(
            1
          )
        )
      : 0;

  return {
    reviews,

    ratingSummary: {
      averageRating,
      totalReviews:
        stats.totalReviews || 0,

      distribution: {
        5: stats.rating5 || 0,
        4: stats.rating4 || 0,
        3: stats.rating3 || 0,
        2: stats.rating2 || 0,
        1: stats.rating1 || 0,
      },
    },

    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,

      totalPages:
        Math.ceil(
          total /
            parsedLimit
        ),
    },
  };
};

/**
 * =====================================================
 * GET REVIEWS OF ONE ORDER
 * =====================================================
 *
 * FE dùng để biết product nào trong order đã review rồi.
 */
const getOrderReviews = async (
  orderId,
  userId
) => {
  assertValidObjectId(
    orderId,
    "orderId"
  );

  const order =
    await RentalOrder.findById(
      orderId
    );

  if (!order) {
    throw createError(
      "Đơn thuê không tồn tại",
      404,
      "ORDER_NOT_FOUND"
    );
  }

  if (
    order.renterId.toString() !==
    userId.toString()
  ) {
    throw createError(
      "Bạn không có quyền xem đánh giá của đơn hàng này",
      403,
      "FORBIDDEN"
    );
  }

  const reviews =
    await Review.find({
      orderId,
      userId,
    })
      .populate(
        "productId",
        "name images"
      )
      .sort({
        createdAt: -1,
      })
      .lean();

  return {
    orderId:
      order._id,

    orderStatus:
      order.status,

    reviews,
  };
};

export {
  createReview,
  getProductReviews,
  getOrderReviews,
};