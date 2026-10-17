import mongoose from "mongoose";
import Cart from "./cart.model.js";
import RentalProduct from "../rent/product/product.model.js";
import ThriftListing from "../thrift/listing/thriftListing.model.js";

const ITEM_FIELD_BY_TYPE = Object.freeze({
  RENT: "rentItems",
  THRIFT: "thriftItems",
});

const createError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

const getItemField = (type = "RENT") => {
  const field = ITEM_FIELD_BY_TYPE[type];
  if (!field) {
    throw createError("type phải là RENT hoặc THRIFT", 400, "INVALID_CART_ITEM_TYPE");
  }
  return field;
};

/**
 * Lấy Cart của user, tự tạo nếu chưa có (mỗi user chỉ có 1 Cart)
 */
const getOrCreateCart = async (userId) =>
  Cart.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, rentItems: [], thriftItems: [] } },
    { new: true, upsert: true }
  );

/**
 * Kiểm tra sản phẩm RENT tồn tại, đã duyệt và quantity không vượt quá tổng tồn kho
 * (availability theo ngày thuê sẽ được kiểm tra lúc checkout)
 */
const assertRentProductAddable = async (productId, quantity) => {
  const product = await RentalProduct.findOne({ _id: productId, status: "APPROVED" });
  if (!product) {
    throw createError("Sản phẩm thuê không tồn tại hoặc chưa được duyệt", 404, "PRODUCT_NOT_FOUND");
  }
  if (quantity > product.totalQuantity) {
    throw createError(
      `Số lượng vượt quá tổng tồn kho của sản phẩm (tối đa ${product.totalQuantity})`,
      400,
      "QUANTITY_EXCEEDS_STOCK"
    );
  }
};

const getCart = async (userId) => {
  await getOrCreateCart(userId);

  return Cart.findOne({ userId })
    .populate(
      "rentItems.productId",
      "name pricePerDay depositAmount images status totalQuantity ownerId location categoryId"
    )
    .populate(
      "thriftItems.productId",
      "name price images condition status location ownerId categoryId"
    );
};

const addItem = async (userId, { type = "RENT", productId, quantity = 1 }) => {
  const field = getItemField(type);
  const cart = await getOrCreateCart(userId);

  const existing = cart[field].find((item) => item.productId.toString() === productId.toString());
  const newQuantity = (existing?.quantity || 0) + quantity;

  if (type === "RENT") {
    await assertRentProductAddable(productId, newQuantity);
  }

  if (existing) {
    existing.quantity = newQuantity;
  } else {
    cart[field].push({ productId: new mongoose.Types.ObjectId(productId), quantity });
  }

  await cart.save();
  return getCart(userId);
};

const updateItemQuantity = async (userId, { type = "RENT", productId, quantity }) => {
  const field = getItemField(type);
  const cart = await getOrCreateCart(userId);

  const existing = cart[field].find((item) => item.productId.toString() === productId.toString());
  if (!existing) {
    throw createError("Sản phẩm không có trong giỏ hàng", 404, "CART_ITEM_NOT_FOUND");
  }

  if (type === "RENT") {
    await assertRentProductAddable(productId, quantity);
  }

  existing.quantity = quantity;
  await cart.save();
  return getCart(userId);
};

const removeItem = async (userId, { type = "RENT", productId }) => {
  const field = getItemField(type);

  const result = await Cart.updateOne(
    { userId, [`${field}.productId`]: productId },
    { $pull: { [field]: { productId } } }
  );

  if (result.modifiedCount === 0) {
    throw createError("Sản phẩm không có trong giỏ hàng", 404, "CART_ITEM_NOT_FOUND");
  }

  return getCart(userId);
};

/**
 * Loại các RENT items đã checkout khỏi Cart
 */
const removeRentItems = async (userId, productIds) =>
  Cart.updateOne({ userId }, { $pull: { rentItems: { productId: { $in: productIds } } } });

export { getCart, addItem, updateItemQuantity, removeItem, removeRentItems };
