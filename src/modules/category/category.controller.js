import { successResponse } from "../../utils/response.js";
import { uploadImageToCloudinary } from "../../utils/cloudinaryUpload.js";

import {
  getPublicCategories,
  getPublicCategoryBySlugOrId,
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  deleteCategory,
} from "./category.service.js";

const extractUploadedFile = (req) => {
  return (
    req.file ||
    req.files?.image?.[0] ||
    req.files?.file?.[0] ||
    (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : null)
  );
};

const getPublicCategoriesController = async (req, res, next) => {
  try {
    const categories = await getPublicCategories();

    return successResponse(
      res,
      "Categories retrieved successfully",
      categories
    );
  } catch (error) {
    next(error);
  }
};

const getPublicCategoryBySlugController = async (req, res, next) => {
  try {
    const category = await getPublicCategoryBySlugOrId(
      req.params.slug || req.params.id
    );

    return successResponse(
      res,
      "Category retrieved successfully",
      category
    );
  } catch (error) {
    next(error);
  }
};

const getAllCategoriesController = async (req, res, next) => {
  try {
    const categories = await getAllCategories();

    return successResponse(
      res,
      "Categories retrieved successfully",
      categories
    );
  } catch (error) {
    next(error);
  }
};

const getCategoryByIdController = async (req, res, next) => {
  try {
    const category = await getCategoryById(req.params.id);

    return successResponse(
      res,
      "Category retrieved successfully",
      category
    );
  } catch (error) {
    next(error);
  }
};

const createCategoryController = async (req, res, next) => {
  try {
    const file = extractUploadedFile(req);
    if (file && file.buffer) {
      const uploadResult = await uploadImageToCloudinary(
        file.buffer,
        "reuse_hub/categories"
      );
      if (uploadResult?.secure_url) {
        req.body.image = uploadResult.secure_url;
      }
    }

    const category = await createCategory(req.body);

    return successResponse(
      res,
      "Category created successfully",
      category,
      201
    );
  } catch (error) {
    next(error);
  }
};

const updateCategoryController = async (req, res, next) => {
  try {
    const file = extractUploadedFile(req);
    if (file && file.buffer) {
      const uploadResult = await uploadImageToCloudinary(
        file.buffer,
        "reuse_hub/categories"
      );
      if (uploadResult?.secure_url) {
        req.body.image = uploadResult.secure_url;
      }
    }

    const category = await updateCategory(
      req.params.id,
      req.body
    );

    return successResponse(
      res,
      "Category updated successfully",
      category
    );
  } catch (error) {
    next(error);
  }
};

const updateCategoryStatusController = async (
  req,
  res,
  next
) => {
  try {
    const category = await updateCategoryStatus(
      req.params.id,
      req.body.isActive
    );

    return successResponse(
      res,
      "Category status updated successfully",
      category
    );
  } catch (error) {
    next(error);
  }
};

const deleteCategoryController = async (req, res, next) => {
  try {
    const category = await deleteCategory(req.params.id);

    return successResponse(
      res,
      "Category deleted successfully",
      category
    );
  } catch (error) {
    next(error);
  }
};

export {
  getPublicCategoriesController,
  getPublicCategoryBySlugController,
  getAllCategoriesController,
  getCategoryByIdController,
  createCategoryController,
  updateCategoryController,
  updateCategoryStatusController,
  deleteCategoryController,
};
