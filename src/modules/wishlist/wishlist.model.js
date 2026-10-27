import mongoose from "mongoose";

/**
 * [BE-S6-01] Wishlist Item Schema
 * Schema wishlists gồm userId, itemType (RENT | THRIFT), itemId.
 * Hỗ trợ đồng bộ cả itemId/itemType và productId/productType để tương thích tối đa.
 */
const wishlistItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    itemType: {
      type: String,
      enum: ["RENT", "THRIFT"],
      required: true,
      default: "RENT",
    },
    // Backward compatibility aliases
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    productType: {
      type: String,
      enum: ["RENT", "THRIFT"],
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// Đồng bộ tự động giữa itemId <-> productId và itemType <-> productType
wishlistItemSchema.pre("validate", function () {
  if (!this.itemId && this.productId) this.itemId = this.productId;
  if (!this.productId && this.itemId) this.productId = this.itemId;

  if (this.itemType) {
    this.productType = this.itemType;
  } else if (this.productType) {
    this.itemType = this.productType;
  } else {
    this.itemType = "RENT";
    this.productType = "RENT";
  }
});

const wishlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: [wishlistItemSchema],
  },
  {
    timestamps: true,
  }
);

const Wishlist = mongoose.model("Wishlist", wishlistSchema);

export default Wishlist;
