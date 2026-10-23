import mongoose from "mongoose";

const thriftListingSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "ownerId là bắt buộc"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Tên sản phẩm thanh lý không được để trống"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "categoryId là bắt buộc"],
      index: true,
    },
    price: {
      type: Number,
      required: [true, "Giá bán là bắt buộc"],
      min: [0, "Giá bán không được âm"],
    },
    condition: {
      type: String,
      required: [true, "Tình trạng sản phẩm là bắt buộc"],
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    location: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["PENDING_APPROVAL", "APPROVED", "REJECTED", "SOLD", "HIDDEN"],
      default: "PENDING_APPROVAL",
      index: true,
    },
    sourceType: {
      type: String,
      enum: ["MANUAL", "FROM_RENTAL", "RENTAL_PRODUCT"],
      default: "MANUAL",
    },
    sourceRentalProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalProduct",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const ThriftListing = mongoose.model("ThriftListing", thriftListingSchema);
export default ThriftListing;