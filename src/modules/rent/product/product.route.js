import { Router } from "express";
import authMiddleware from "../../../middleware/auth.middleware.js";
import authorize from "../../../middleware/role.middleware.js";

import {
  getProductsController,
  getProductByIdController,
  createProductController,
  updateProductController,
  deleteProductController,
} from "./product.controller.js";

import {
  validateCreateProduct,
  validateUpdateProduct,
} from "./product.validation.js";

const router = Router();

// Public routes
router.get("/", getProductsController);
router.get("/:id", getProductByIdController);

// Shop Owner & Admin routes
router.post(
  "/",
  authMiddleware,
  authorize(["SHOP_OWNER", "ADMIN"]),
  validateCreateProduct,
  createProductController
);

router.put(
  "/:id",
  authMiddleware,
  authorize(["SHOP_OWNER", "ADMIN"]),
  validateUpdateProduct,
  updateProductController
);

router.delete(
  "/:id",
  authMiddleware,
  authorize(["SHOP_OWNER", "ADMIN"]),
  deleteProductController
);

export default router;
