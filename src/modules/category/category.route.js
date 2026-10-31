import { Router } from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import authorize from "../../middleware/role.middleware.js";
import upload from "../../middleware/upload.middleware.js";

import {
  getPublicCategoriesController,
  getPublicCategoryBySlugController,
  getAllCategoriesController,
  getCategoryByIdController,
  createCategoryController,
  updateCategoryController,
  updateCategoryStatusController,
  deleteCategoryController,
} from "./category.controller.js";

import {
  validateCreateCategory,
  validateUpdateCategory,
} from "./category.validation.js";

const publicCategoryRouter = Router();
const adminCategoryRouter = Router();

/*
 * PUBLIC
 * GET /api/categories
 * GET /api/categories/:slug
 */
publicCategoryRouter.get(
  "/",
  getPublicCategoriesController
);

publicCategoryRouter.get(
  "/:slug",
  getPublicCategoryBySlugController
);

/*
 * ADMIN
 * Tất cả route dưới đây đều yêu cầu ADMIN
 */

adminCategoryRouter.use(
  authMiddleware,
  authorize(["ADMIN"])
);

adminCategoryRouter.get(
  "/",
  getAllCategoriesController
);

adminCategoryRouter.get(
  "/:id",
  getCategoryByIdController
);

adminCategoryRouter.post(
  "/",
  upload.any(),
  validateCreateCategory,
  createCategoryController
);

adminCategoryRouter.put(
  "/:id",
  upload.any(),
  validateUpdateCategory,
  updateCategoryController
);

adminCategoryRouter.patch(
  "/:id/status",
  updateCategoryStatusController
);

adminCategoryRouter.delete(
  "/:id",
  deleteCategoryController
);

export {
  publicCategoryRouter,
  adminCategoryRouter,
};
