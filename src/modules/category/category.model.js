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

    type: {
      type: String,
      enum: ["RENT", "THRIFT", "BOTH"],
      default: "BOTH",
      required: true,
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