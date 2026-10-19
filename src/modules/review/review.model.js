import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalOrder",
      required: [true, "orderId là bắt buộc"],
      index: true,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalProduct",
      required: [true, "productId là bắt buộc"],
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
  },
  {
    timestamps: true,
    collection: "reviews",
  }
);

/**
 * AC:
 * Mỗi User chỉ được review 1 lần cho mỗi product
 * trong cùng một order.
 */
reviewSchema.index(
  {
    orderId: 1,
    productId: 1,
    userId: 1,
  },
  {
    unique: true,
    name: "unique_order_product_user_review",
  }
);

/**
 * Tối ưu lấy review theo sản phẩm.
 */
reviewSchema.index({
  productId: 1,
  createdAt: -1,
});

const Review =
  mongoose.models.Review ||
  mongoose.model("Review", reviewSchema);

export { Review };
export default Review;