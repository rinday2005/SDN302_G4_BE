import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      unique: true,
    },

    slug: {
      type: String,
      required: [true, "Category slug is required"],
      trim: true,
      lowercase: true,
      unique: true,
    },

    code: {
      type: String,
      trim: true,
      default: "",
    },

    type: {
      type: String,
      enum: ["RENT", "THRIFT", "BOTH"],
      default: "BOTH",
      required: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    subtitle: {
      type: String,
      trim: true,
      default: "",
    },

    image: {
      type: String,
      trim: true,
      default: "",
    },

    icon: {
      type: String,
      trim: true,
      default: "category",
    },

    inspectionBadge: {
      type: String,
      trim: true,
      default: "100% Kiểm định chất lượng & Khử trùng UV-C",
    },

    escrowBadge: {
      type: String,
      trim: true,
      default: "Smart Escrow Bảo chứng cọc an toàn 100%",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "categories",
  }
);

const Category = mongoose.model("Category", categorySchema);

export default Category;
