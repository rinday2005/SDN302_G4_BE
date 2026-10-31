import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    orderType: {
      type: String,
      enum: ["RENT", "THRIFT", null],
      default: null,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "productId là bắt buộc"],
      index: true,
    },

    productType: {
      type: String,
      enum: ["RENT", "THRIFT"],
      default: "RENT",
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId là bắt buộc"],
      index: true,
    },

    rating: {
      type: Number,
      required: [true, "rating là bắt buộc"],
      min: [1, "rating phải từ 1 đến 5"],
      max: [5, "rating phải từ 1 đến 5"],
      validate: {
        validator: Number.isInteger,
        message: "rating phải là số nguyên từ 1 đến 5",
      },
    },

    comment: {
      type: String,
      trim: true,
      maxlength: [2000, "comment tối đa 2000 ký tự"],
      default: "",
    },

    images: {
      type: [String],
      default: [],
      validate: {
        validator: (images) =>
          Array.isArray(images) &&
          images.length <= 5,
        message: "Mỗi review được tối đa 5 hình ảnh",
      },
    },

    source: {
      type: String,
      enum: ["PRODUCT_DETAIL", "RENT_ORDER", "THRIFT_ORDER"],
      default: "PRODUCT_DETAIL",
    },

    isVerifiedPurchase: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "reviews",
  }
);

/**
 * AC: Mỗi User chỉ được review 1 lần cho mỗi product trong cùng một order.
 * Áp dụng partialFilterExpression để các comment/review ở trang detail (orderId: null)
 * không bị trùng lặp lỗi unique.
 */
reviewSchema.index(
  {
    orderId: 1,
    productId: 1,
    userId: 1,
  },
  {
    unique: true,
    partialFilterExpression: { orderId: { $type: "objectId" } },
    name: "unique_order_product_user_review",
  }
);

/**
 * Tối ưu truy vấn danh sách review theo sản phẩm trên Marketplace Detail.
 */
reviewSchema.index({
  productId: 1,
  createdAt: -1,
});

reviewSchema.index({
  productId: 1,
  productType: 1,
  createdAt: -1,
});

reviewSchema.index({
  userId: 1,
  createdAt: -1,
});

const Review =
  mongoose.models.Review ||
  mongoose.model("Review", reviewSchema);

export { Review };
export default Review;
