import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import authorize from "../../middleware/role.middleware.js";
import {
  getCartController,
  addCartItemController,
  updateCartItemController,
  removeCartItemController,
} from "./cart.controller.js";
import {
  validateAddCartItem,
  validateUpdateCartItem,
  validateRemoveCartItem,
} from "./cart.validation.js";

const router = Router();

// Cart chỉ dành cho người mua/thuê đã đăng nhập
router.use(authMiddleware, authorize(["USER"]));

router.get("/", getCartController);
router.post("/items", validateAddCartItem, addCartItemController);
router.patch("/items/:productId", validateUpdateCartItem, updateCartItemController);
router.delete("/items/:productId", validateRemoveCartItem, removeCartItemController);

export default router;
