import mongoose from "mongoose";

import Review from "./review.model.js";
import RentalOrder from "../rent/order/order.model.js";
import RentalProduct from "../rent/product/product.model.js";
import ThriftOrder from "../thrift/order/thriftOrder.model.js";
import ThriftListing from "../thrift/listing/thriftListing.model.js";
import User from "../user/user.model.js";

const createError = (message, statusCode = 400, errorCode = "BAD_REQUEST") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

const assertValidObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw createError(
      `${fieldName} không hợp lệ`,
      400,
      `INVALID_${fieldName.toUpperCase()}`
    );
  }
};

/**
 * Tự động xác định loại sản phẩm RENT hay THRIFT nếu chưa truyền
 */
const detectProductType = async (productId, explicitType) => {
  if (explicitType && ["RENT", "THRIFT"].includes(explicitType.toUpperCase())) {
    return explicitType.toUpperCase();
  }

  const [rentalProd, thriftProd] = await Promise.all([
    RentalProduct.findById(productId).select("_id").lean(),
    ThriftListing.findById(productId).select("_id").lean(),
  ]);

  if (thriftProd) return "THRIFT";
  if (rentalProd) return "RENT";

  return "RENT";
};

/**
 * =====================================================
 * CREATE REVIEW & COMMENT (CHO CẢ RENT VÀ THRIFT)
 * =====================================================
 * Hỗ trợ 2 luồng:
 * 1. Từ trang Chi tiết sản phẩm (Marketplace Detail): orderId có thể null/undefined.
 * 2. Từ trang Quản lý đơn hàng (Rent Order sau khi trả hàng; Thrift Order sau khi nhận hàng):
 *    orderId được truyền vào và kiểm tra điều kiện hoàn tất.
 */
const createReview = async ({
  orderId = null,
  productId,
  userId,
  rating,
  comment = "",
  images = [],
  productType,
  orderType,
}) => {
  assertValidObjectId(productId, "productId");
  assertValidObjectId(userId, "userId");

  const parsedRating = Number(rating);
  if (
    !Number.isInteger(parsedRating) ||
    parsedRating < 1 ||
    parsedRating > 5
  ) {
    throw createError("Rating chỉ được từ 1 đến 5", 400, "INVALID_RATING");
  }

  if (images !== undefined && !Array.isArray(images)) {
    throw createError("images phải là một mảng", 400, "INVALID_IMAGES");
  }

  const cleanedImages = Array.isArray(images)
    ? images
        .filter((img) => typeof img === "string" && img.trim())
        .map((img) => img.trim())
    : [];

  if (cleanedImages.length > 5) {
    throw createError("Mỗi review được tối đa 5 hình ảnh", 400, "TOO_MANY_IMAGES");
  }

  const user = await User.findById(userId).select("_id fullName avatarUrl role").lean();
  if (!user) {
    throw createError("Người dùng không tồn tại", 404, "USER_NOT_FOUND");
  }

  const resolvedProductType = await detectProductType(productId, productType);

  let verifiedPurchase = false;
  let source = "PRODUCT_DETAIL";
  let resolvedOrderType = null;
  let resolvedOrderId = null;

  // -------------------------------------------------------------
  // TRƯỜNG HỢP 1: CÓ TRUYỀN ORDER ID (ĐÁNH GIÁ TỪ TRANG ĐƠN HÀNG)
  // -------------------------------------------------------------
  if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
    resolvedOrderId = orderId;

    // Kiểm tra trùng lặp trước
    const existingOrderReview = await Review.findOne({
      orderId: resolvedOrderId,
      productId,
      userId,
    });

    if (existingOrderReview) {
      throw createError(
        "Bạn đã đánh giá sản phẩm này trong đơn hàng rồi",
        409,
        "REVIEW_ALREADY_EXISTS"
      );
    }

    if (resolvedProductType === "THRIFT") {
      resolvedOrderType = "THRIFT";
      source = "THRIFT_ORDER";

      const thriftOrder = await ThriftOrder.findById(resolvedOrderId);
      if (!thriftOrder) {
        throw createError("Đơn hàng thanh lý không tồn tại", 404, "ORDER_NOT_FOUND");
      }

      const orderBuyerId = thriftOrder.buyerId?.toString() || thriftOrder.userId?.toString();
      if (orderBuyerId !== userId.toString()) {
        throw createError(
          "Bạn không có quyền đánh giá đơn hàng thanh lý này",
          403,
          "REVIEW_FORBIDDEN"
        );
      }

      // AC: thrift sau khi nhận hàng thành công (DELIVERED hoặc COMPLETED)
      const allowedStatuses = ["DELIVERED", "COMPLETED"];
      if (!allowedStatuses.includes(thriftOrder.status)) {
        throw createError(
          "Chỉ có thể đánh giá sau khi đã nhận hàng thành công",
          400,
          "ORDER_NOT_DELIVERED"
        );
      }

      // Kiểm tra sản phẩm có trong đơn hàng không
      const itemInOrder = thriftOrder.items.find((item) => {
        const idMatch =
          (item.listingId && item.listingId.toString() === productId.toString()) ||
          (item.productId && item.productId.toString() === productId.toString());
        return idMatch;
      });

      if (!itemInOrder) {
        throw createError("Sản phẩm không thuộc đơn hàng thanh lý này", 400, "PRODUCT_NOT_IN_ORDER");
      }

      verifiedPurchase = true;
    } else {
      // Mặc định là RENT ORDER
      resolvedOrderType = "RENT";
      source = "RENT_ORDER";

      const rentalOrder = await RentalOrder.findById(resolvedOrderId);
      if (!rentalOrder) {
        throw createError("Đơn thuê không tồn tại", 404, "ORDER_NOT_FOUND");
      }

      if (rentalOrder.renterId.toString() !== userId.toString()) {
        throw createError("Bạn không có quyền đánh giá đơn thuê này", 403, "REVIEW_FORBIDDEN");
      }

      // AC: sau khi user trả hàng ở phần rent thành công (RETURNED hoặc COMPLETED)
      const allowedStatuses = ["RETURNED", "COMPLETED"];
      if (!allowedStatuses.includes(rentalOrder.status)) {
        throw createError(
          "Chỉ có thể đánh giá khi đơn thuê đã trả hàng thành công hoặc đã hoàn tất",
          400,
          "ORDER_NOT_COMPLETED"
        );
      }

      const itemInOrder = rentalOrder.items.find(
        (item) => item.productId.toString() === productId.toString()
      );

      if (!itemInOrder) {
        throw createError("Sản phẩm không thuộc đơn thuê này", 400, "PRODUCT_NOT_IN_ORDER");
      }

      verifiedPurchase = true;
    }
  } else {
    // -------------------------------------------------------------
    // TRƯỜNG HỢP 2: TỰ REVIEW / COMMENT TẠI TRANG DETAIL SẢN PHẨM
    // -------------------------------------------------------------
    source = "PRODUCT_DETAIL";

    if (resolvedProductType === "THRIFT") {
      const thrift = await ThriftListing.findById(productId).select("_id name").lean();
      if (!thrift) {
        throw createError("Sản phẩm thanh lý không tồn tại", 404, "PRODUCT_NOT_FOUND");
      }

      // Kiểm tra xem user này đã từng mua thành công sản phẩm này chưa để gán verified badge
      const previousOrder = await ThriftOrder.findOne({
        $or: [{ buyerId: userId }, { userId }],
        status: { $in: ["DELIVERED", "COMPLETED"] },
        $or: [
          { "items.listingId": productId },
          { "items.productId": productId },
        ],
      }).select("_id").lean();

      if (previousOrder) {
        verifiedPurchase = true;
      }
    } else {
      const rentProduct = await RentalProduct.findById(productId).select("_id name").lean();
      if (!rentProduct) {
        throw createError("Sản phẩm cho thuê không tồn tại", 404, "PRODUCT_NOT_FOUND");
      }

      const previousOrder = await RentalOrder.findOne({
        renterId: userId,
        status: { $in: ["RETURNED", "COMPLETED"] },
        "items.productId": productId,
      }).select("_id").lean();

      if (previousOrder) {
        verifiedPurchase = true;
      }
    }
  }

  try {
    const review = await Review.create({
      orderId: resolvedOrderId,
      orderType: resolvedOrderType,
      productId,
      productType: resolvedProductType,
      userId,
      rating: parsedRating,
      comment: typeof comment === "string" ? comment.trim() : "",
      images: cleanedImages,
      source,
      isVerifiedPurchase: verifiedPurchase,
    });

    const populatedReview = await Review.findById(review._id)
      .populate("userId", "fullName avatarUrl email role")
      .lean();

    return populatedReview;
  } catch (error) {
    if (error?.code === 11000) {
      throw createError(
        "Bạn đã đánh giá sản phẩm này trong đơn hàng rồi",
        409,
        "REVIEW_ALREADY_EXISTS"
      );
    }
    throw error;
  }
};

/**
 * =====================================================
 * GET REVIEWS BY PRODUCT (DÙNG CHO RENT HOẶC THRIFT DETAIL)
 * =====================================================
 */
const getProductReviews = async (
  productId,
  { page = 1, limit = 10, productType, rating } = {}
) => {
  assertValidObjectId(productId, "productId");

  const resolvedProductType = await detectProductType(productId, productType);

  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const skip = (parsedPage - 1) * parsedLimit;

  const matchFilter = {
    productId: new mongoose.Types.ObjectId(productId),
  };

  if (rating !== undefined && rating !== null && rating !== "") {
    const r = Number(rating);
    if (!Number.isNaN(r) && r >= 1 && r <= 5) {
      matchFilter.rating = r;
    }
  }

  const [reviews, total, ratingStats, verifiedCount] = await Promise.all([
    Review.find(matchFilter)
      .populate("userId", "fullName avatarUrl email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),

    Review.countDocuments(matchFilter),

    Review.aggregate([
      {
        $match: {
          productId: new mongoose.Types.ObjectId(productId),
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          rating5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
          rating4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
          rating3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
          rating2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
          rating1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
        },
      },
    ]),

    Review.countDocuments({
      productId: new mongoose.Types.ObjectId(productId),
      isVerifiedPurchase: true,
    }),
  ]);

  const stats = ratingStats[0] || {};
  const averageRating = stats.averageRating
    ? Number(stats.averageRating.toFixed(1))
    : 0;

  return {
    productType: resolvedProductType,
    reviews,
    ratingSummary: {
      averageRating,
      totalReviews: stats.totalReviews || 0,
      verifiedReviewsCount: verifiedCount,
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
      totalPages: Math.ceil(total / parsedLimit) || 1,
    },
  };
};

/**
 * =====================================================
 * GET REVIEWS OF ONE ORDER (RENT HOẶC THRIFT)
 * =====================================================
 */
const getOrderReviews = async (orderId, userId) => {
  assertValidObjectId(orderId, "orderId");

  // Thử tìm trong RentalOrder trước
  const rentalOrder = await RentalOrder.findById(orderId).lean();
  if (rentalOrder) {
    if (rentalOrder.renterId.toString() !== userId.toString()) {
      throw createError("Bạn không có quyền xem đánh giá của đơn hàng này", 403, "FORBIDDEN");
    }

    const reviews = await Review.find({ orderId, userId })
      .populate("userId", "fullName avatarUrl")
      .sort({ createdAt: -1 })
      .lean();

    return {
      orderId: rentalOrder._id,
      orderType: "RENT",
      orderStatus: rentalOrder.status,
      canReview: ["RETURNED", "COMPLETED"].includes(rentalOrder.status),
      items: rentalOrder.items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        imageUrl: it.imageUrl,
        isReviewed: reviews.some(
          (r) => r.productId.toString() === it.productId.toString()
        ),
      })),
      reviews,
    };
  }

  // Nếu không có, thử tìm trong ThriftOrder
  const thriftOrder = await ThriftOrder.findById(orderId).lean();
  if (thriftOrder) {
    const orderBuyerId = thriftOrder.buyerId?.toString() || thriftOrder.userId?.toString();
    if (orderBuyerId !== userId.toString()) {
      throw createError("Bạn không có quyền xem đánh giá của đơn hàng này", 403, "FORBIDDEN");
    }

    const reviews = await Review.find({ orderId, userId })
      .populate("userId", "fullName avatarUrl")
      .sort({ createdAt: -1 })
      .lean();

    return {
      orderId: thriftOrder._id,
      orderType: "THRIFT",
      orderStatus: thriftOrder.status,
      canReview: ["DELIVERED", "COMPLETED"].includes(thriftOrder.status),
      items: thriftOrder.items.map((it) => {
        const prodId = it.listingId || it.productId;
        return {
          productId: prodId,
          productName: it.name,
          imageUrl: it.images?.[0] || "",
          isReviewed: reviews.some(
            (r) => r.productId.toString() === prodId.toString()
          ),
        };
      }),
      reviews,
    };
  }

  throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
};

/**
 * =====================================================
 * GET PRODUCT REVIEWS FOR AI ANALYSIS
 * =====================================================
 * Phục vụ tính năng AI: phân tích đánh giá, sentiment & điểm mạnh/yếu của sản phẩm.
 */
const getProductReviewsForAI = async (productId, productType) => {
  assertValidObjectId(productId, "productId");

  const resolvedProductType = await detectProductType(productId, productType);

  const [reviews, statsAgg] = await Promise.all([
    Review.find({ productId })
      .select("rating comment images isVerifiedPurchase createdAt")
      .populate("userId", "fullName")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),

    Review.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(productId) } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          total: { $sum: 1 },
          positive: {
            $sum: { $cond: [{ $gte: ["$rating", 4] }, 1, 0] },
          },
          neutral: {
            $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] },
          },
          negative: {
            $sum: { $cond: [{ $lte: ["$rating", 2] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const stats = statsAgg[0] || {
    avgRating: 0,
    total: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
  };

  const sampleComments = reviews
    .filter((r) => r.comment && r.comment.trim().length > 0)
    .map((r) => ({
      rating: r.rating,
      comment: r.comment,
      author: r.userId?.fullName || "Khách hàng",
      isVerified: r.isVerifiedPurchase,
      hasImages: Array.isArray(r.images) && r.images.length > 0,
      createdAt: r.createdAt,
    }));

  return {
    productId,
    productType: resolvedProductType,
    summary: {
      averageRating: stats.avgRating ? Number(stats.avgRating.toFixed(2)) : 0,
      totalReviews: stats.total,
      sentimentDistribution: {
        positivePercent: stats.total ? Math.round((stats.positive / stats.total) * 100) : 0,
        neutralPercent: stats.total ? Math.round((stats.neutral / stats.total) * 100) : 0,
        negativePercent: stats.total ? Math.round((stats.negative / stats.total) * 100) : 0,
      },
    },
    sampleComments,
    aiPromptContext: `Sản phẩm ${resolvedProductType} có ${stats.total} lượt đánh giá thực tế từ người dùng DB với điểm số trung bình ${stats.avgRating ? stats.avgRating.toFixed(1) : 0}/5. Tỷ lệ phản hồi tích cực: ${stats.total ? Math.round((stats.positive / stats.total) * 100) : 0}%.`,
  };
};

export {
  createReview,
  getProductReviews,
  getOrderReviews,
  getProductReviewsForAI,
};
