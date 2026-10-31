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

/**
 * Kiểm tra sản phẩm THRIFT tồn tại, đã duyệt và chưa bị bán (SOLD).
 * Mỗi listing THRIFT là sản phẩm độc bản (quantity tối đa = 1).
 */
const assertThriftListingAddable = async (productId, quantity) => {
  const listing = await ThriftListing.findById(productId);
  if (!listing) {
    throw createError("Sản phẩm thanh lý không tồn tại", 404, "PRODUCT_NOT_FOUND");
  }
  if (listing.status === "SOLD") {
    throw createError("Sản phẩm thanh lý đã được bán", 400, "LISTING_ALREADY_SOLD");
  }
  if (listing.status !== "APPROVED") {
    throw createError("Sản phẩm thanh lý chưa sẵn sàng để bán", 400, "LISTING_NOT_AVAILABLE");
  }
  if (quantity > 1) {
    throw createError(
      "Sản phẩm thanh lý là độc bản, số lượng tối đa là 1",
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
      "name pricePerDay depositAmount images status totalQuantity ownerId location condition categoryId"
    )
    .populate(
      "thriftItems.productId",
      "name price condition images status ownerId categoryId location description sourceType"
    );
};

const addItem = async (userId, { type = "RENT", productId, quantity = 1 }) => {
  const field = getItemField(type);
  const cart = await getOrCreateCart(userId);

  const existing = cart[field].find((item) => item.productId.toString() === productId.toString());
  const newQuantity = (existing?.quantity || 0) + quantity;

  if (type === "RENT") {
    await assertRentProductAddable(productId, newQuantity);
  } else if (type === "THRIFT") {
    await assertThriftListingAddable(productId, newQuantity);
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
  } else if (type === "THRIFT") {
    await assertThriftListingAddable(productId, quantity);
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

/**
 * Loại các THRIFT items đã checkout khỏi Cart
 */
const removeThriftItems = async (userId, productIds) =>
  Cart.updateOne({ userId }, { $pull: { thriftItems: { productId: { $in: productIds } } } });

export {
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
  removeRentItems,
  removeThriftItems,
  assertThriftListingAddable,
};

