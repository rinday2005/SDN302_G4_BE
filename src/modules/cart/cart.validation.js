import mongoose from "mongoose";

const CART_ITEM_TYPES = ["RENT", "THRIFT"];

const fail = (next, message, errorCode) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.errorCode = errorCode;
  return next(error);
};

const checkType = (type, next) => {
  if (type !== undefined && !CART_ITEM_TYPES.includes(type)) {
    fail(next, "type phải là RENT hoặc THRIFT", "INVALID_CART_ITEM_TYPE");
    return false;
  }
  return true;
};

const checkQuantity = (quantity, next) => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    fail(next, "quantity phải là số nguyên dương", "INVALID_QUANTITY");
    return false;
  }
  return true;
};

const checkProductId = (productId, next) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    fail(next, "productId không hợp lệ", "INVALID_PRODUCT_ID");
    return false;
  }
  return true;
};

// POST /api/cart/items  body: { type?, productId, quantity? }
const validateAddCartItem = (req, res, next) => {
  const { type, productId, quantity } = req.body;

  if (!checkType(type, next)) return;
  if (!checkProductId(productId, next)) return;
  if (quantity !== undefined && !checkQuantity(quantity, next)) return;

  next();
};

// PATCH /api/cart/items/:productId  body: { type?, quantity }
const validateUpdateCartItem = (req, res, next) => {
  if (!checkType(req.body.type, next)) return;
  if (!checkProductId(req.params.productId, next)) return;
  if (!checkQuantity(req.body.quantity, next)) return;

  next();
};

// DELETE /api/cart/items/:productId?type=RENT
const validateRemoveCartItem = (req, res, next) => {
  if (!checkType(req.query.type, next)) return;
  if (!checkProductId(req.params.productId, next)) return;

  next();
};

export { validateAddCartItem, validateUpdateCartItem, validateRemoveCartItem };
