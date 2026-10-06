import mongoose from "mongoose";
import Category from "./category.model.js";

const getPublicCategories = async () => {
  return Category.find({
    isActive: true,
  }).sort({
    name: 1,
  });
};

const getAllCategories = async () => {
  return Category.find().sort({
    createdAt: -1,
  });
};

const getCategoryById = async (categoryId) => {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    const error = new Error("Invalid category id");
    error.statusCode = 400;
    error.errorCode = "INVALID_CATEGORY_ID";
    throw error;
  }

  const category = await Category.findById(categoryId);

  if (!category) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    error.errorCode = "CATEGORY_NOT_FOUND";
    throw error;
  }

  return category;
};

const createCategory = async (categoryData) => {
  const name = categoryData.name.trim();
  const slug = categoryData.slug.trim().toLowerCase();

  const existingCategory = await Category.findOne({
    $or: [
      { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } },
      { slug },
    ],
  });

  if (existingCategory) {
    const error = new Error("Category name or slug already exists");
    error.statusCode = 409;
    error.errorCode = "CATEGORY_ALREADY_EXISTS";
    throw error;
  }

  return Category.create({
    name,
    slug,
    type: categoryData.type || "BOTH",
    isActive:
      categoryData.isActive !== undefined
        ? categoryData.isActive
        : true,
  });
};

const updateCategory = async (categoryId, categoryData) => {
  const category = await getCategoryById(categoryId);

  if (categoryData.name !== undefined) {
    const name = categoryData.name.trim();

    const duplicatedName = await Category.findOne({
      _id: { $ne: category._id },
      name: {
        $regex: `^${escapeRegex(name)}$`,
        $options: "i",
      },
    });

    if (duplicatedName) {
      const error = new Error("Category name already exists");
      error.statusCode = 409;
      error.errorCode = "CATEGORY_NAME_ALREADY_EXISTS";
      throw error;
    }

    category.name = name;
  }

  if (categoryData.slug !== undefined) {
    const slug = categoryData.slug.trim().toLowerCase();

    const duplicatedSlug = await Category.findOne({
      _id: { $ne: category._id },
      slug,
    });

    if (duplicatedSlug) {
      const error = new Error("Category slug already exists");
      error.statusCode = 409;
      error.errorCode = "CATEGORY_SLUG_ALREADY_EXISTS";
      throw error;
    }

    category.slug = slug;
  }

  if (categoryData.type !== undefined) {
    category.type = categoryData.type;
  }

  if (categoryData.isActive !== undefined) {
    category.isActive = categoryData.isActive;
  }

  await category.save();

  return category;
};

const updateCategoryStatus = async (categoryId, isActive) => {
  if (typeof isActive !== "boolean") {
    const error = new Error("isActive must be boolean");
    error.statusCode = 400;
    error.errorCode = "INVALID_IS_ACTIVE";
    throw error;
  }

  const category = await getCategoryById(categoryId);

  category.isActive = isActive;

  await category.save();

  return category;
};

const deleteCategory = async (categoryId) => {
  const category = await getCategoryById(categoryId);

  await category.deleteOne();

  return category;
};

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export {
  getPublicCategories,
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  deleteCategory,
};