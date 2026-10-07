import { Router } from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import authorize from "../../middleware/role.middleware.js";

import {
  getPublicCategoriesController,
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
 */
publicCategoryRouter.get(
  "/",
  getPublicCategoriesController
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
  validateCreateCategory,
  createCategoryController
);

adminCategoryRouter.put(
  "/:id",
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