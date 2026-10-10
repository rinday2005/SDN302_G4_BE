import { getCart, addItem, updateItemQuantity, removeItem } from "./cart.service.js";
import { successResponse } from "../../utils/response.js";

const getCartController = async (req, res, next) => {
  try {
    const cart = await getCart(req.user._id);
    return successResponse(res, "Cart retrieved successfully", cart);
  } catch (error) {
    next(error);
  }
};

const addCartItemController = async (req, res, next) => {
  try {
    const cart = await addItem(req.user._id, {
      type: req.body.type,
      productId: req.body.productId,
      quantity: req.body.quantity,
    });
    return successResponse(res, "Item added to cart successfully", cart);
  } catch (error) {
    next(error);
  }
};

const updateCartItemController = async (req, res, next) => {
  try {
    const cart = await updateItemQuantity(req.user._id, {
      type: req.body.type,
      productId: req.params.productId,
      quantity: req.body.quantity,
    });
    return successResponse(res, "Cart item updated successfully", cart);
  } catch (error) {
    next(error);
  }
};

const removeCartItemController = async (req, res, next) => {
  try {
    const cart = await removeItem(req.user._id, {
      type: req.query.type,
      productId: req.params.productId,
    });
    return successResponse(res, "Item removed from cart successfully", cart);
  } catch (error) {
    next(error);
  }
};

export {
  getCartController,
  addCartItemController,
  updateCartItemController,
  removeCartItemController,
};
