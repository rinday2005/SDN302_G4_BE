import mongoose from "mongoose";
import Wishlist from "./wishlist.model.js";
import RentalProduct from "../rent/product/rentalProduct.model.js";
import ThriftListing from "../thrift/listing/thriftListing.model.js";

/**
 * Helper tự động phát hiện và chuẩn hóa loại sản phẩm (RENT hay THRIFT) từ cơ sở dữ liệu.
 * Hỗ trợ linh hoạt cả MongoDB ObjectId lẫn Slug/Tên sản phẩm
 */
export const resolveProductCandidate = async (productId, requestedType = null) => {
  if (!productId) return null;
  const raw = String(productId).trim();

  // 1. Trường hợp raw là ObjectId hợp lệ (24 ký tự hex)
  if (mongoose.Types.ObjectId.isValid(raw)) {
    const objId = new mongoose.Types.ObjectId(raw);
    const [thriftDoc, rentDoc] = await Promise.all([
      ThriftListing.findById(objId).select("_id"),
      RentalProduct.findById(objId).select("_id"),
    ]);

    if (thriftDoc && !rentDoc) return { resolvedId: thriftDoc._id, resolvedType: "THRIFT" };
    if (rentDoc && !thriftDoc) return { resolvedId: rentDoc._id, resolvedType: "RENT" };
    if (thriftDoc && rentDoc) {
      const type = (requestedType || "").toUpperCase() === "THRIFT" ? "THRIFT" : "RENT";
      return { resolvedId: objId, resolvedType: type };
    }
    const type = (requestedType || "").toUpperCase() === "THRIFT" ? "THRIFT" : "RENT";
    return { resolvedId: objId, resolvedType: type };
  }

  // 2. Trường hợp raw là Slug/String
  let thriftDoc = await ThriftListing.findOne({ slug: raw }).select("_id");
  if (!thriftDoc) {
    thriftDoc = await ThriftListing.findOne({
      $or: [
        { slug: new RegExp(raw, "i") },
        { name: new RegExp(raw.replace(/-/g, " "), "i") },
      ],
    }).select("_id");
  }
  if (thriftDoc) {
    return { resolvedId: thriftDoc._id, resolvedType: "THRIFT" };
  }

  let rentDoc = await RentalProduct.findOne({ slug: raw }).select("_id");
  if (!rentDoc) {
    rentDoc = await RentalProduct.findOne({
      $or: [
        { slug: new RegExp(raw, "i") },
        { name: new RegExp(raw.replace(/-/g, " "), "i") },
      ],
    }).select("_id");
  }
  if (rentDoc) {
    return { resolvedId: rentDoc._id, resolvedType: "RENT" };
  }

  if ((requestedType || "").toUpperCase() === "THRIFT") {
    const fallbackThrift = await ThriftListing.findOne({ status: "APPROVED" }).select("_id");
    if (fallbackThrift) {
      return { resolvedId: fallbackThrift._id, resolvedType: "THRIFT" };
    }
  }

  return null;
};

/**
 * Lấy Wishlist của user, tự tạo nếu chưa có (mỗi user chỉ có 1 Wishlist duy nhất)
 */
export const getOrCreateWishlist = async (userId) =>
  Wishlist.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, items: [] } },
    { new: true, upsert: true }
  );

/**
 * Lấy danh sách sản phẩm yêu thích của người dùng (Hỗ trợ cả RENT và THRIFT)
 * AC: Chỉ User hiện tại được xem/sửa wishlist của mình; populate đúng dữ liệu item.
 */
export const getUserWishlist = async (userId) => {
  const wishlist = await getOrCreateWishlist(userId);

  let needsDbCorrection = false;
  const populatedItems = await Promise.all(
    wishlist.items.map(async (item) => {
      let itemDetails = null;
      let effectiveType = (item.itemType || item.productType || "RENT").toUpperCase();
      const effectiveId = item.itemId || item.productId;

      if (effectiveType === "RENT") {
        itemDetails = await RentalProduct.findById(effectiveId)
          .select("name pricePerDay depositAmount images categoryId condition location totalQuantity")
          .populate("categoryId", "name slug");

        if (!itemDetails) {
          const thriftDoc = await ThriftListing.findById(effectiveId)
            .select("name price images condition location categoryId quantity status")
            .populate("categoryId", "name slug");
          if (thriftDoc) {
            itemDetails = thriftDoc;
            effectiveType = "THRIFT";
            item.itemType = "THRIFT";
            item.productType = "THRIFT";
            needsDbCorrection = true;
          }
        }
      } else {
        itemDetails = await ThriftListing.findById(effectiveId)
          .select("name price images condition location categoryId quantity status")
          .populate("categoryId", "name slug");

        if (!itemDetails) {
          const rentDoc = await RentalProduct.findById(effectiveId)
            .select("name pricePerDay depositAmount images categoryId condition location totalQuantity")
            .populate("categoryId", "name slug");
          if (rentDoc) {
            itemDetails = rentDoc;
            effectiveType = "RENT";
            item.itemType = "RENT";
            item.productType = "RENT";
            needsDbCorrection = true;
          }
        }
      }

      return {
        _id: item._id,
        itemId: effectiveId,
        itemType: effectiveType,
        productId: effectiveId,
        productType: effectiveType,
        addedAt: item.addedAt,
        item: itemDetails,
        product: itemDetails,
      };
    })
  );

  if (needsDbCorrection) {
    await wishlist.save();
  }

  const validItems = populatedItems.filter((i) => i.item !== null);
  if (validItems.length !== wishlist.items.length) {
    const validProductIds = validItems.map((i) => i.itemId.toString());
    wishlist.items = wishlist.items.filter((i) => {
      const idStr = (i.itemId || i.productId || "").toString();
      return validProductIds.includes(idStr);
    });
    await wishlist.save();
  }

  return {
    _id: wishlist._id,
    userId: wishlist.userId,
    items: validItems,
    totalItems: validItems.length,
  };
};

/**
 * Thêm sản phẩm vào danh sách yêu thích
 */
export const addToWishlist = async (userId, { itemId, itemType, productId, productType } = {}) => {
  const targetId = itemId || productId;
  const targetType = itemType || productType;

  const candidate = await resolveProductCandidate(targetId, targetType);
  if (!candidate) {
    const error = new Error("itemId hoặc productId không hợp lệ");
    error.statusCode = 400;
    error.errorCode = "INVALID_PRODUCT_ID";
    throw error;
  }

  const effectiveId = candidate.resolvedId;
  const detectedType = candidate.resolvedType;

  const wishlist = await getOrCreateWishlist(userId);

  const exists = wishlist.items.some((item) => {
    const id = (item.itemId || item.productId || "").toString();
    return id === effectiveId.toString();
  });

  if (!exists) {
    wishlist.items.push({
      itemId: effectiveId,
      itemType: detectedType,
      productId: effectiveId,
      productType: detectedType,
      addedAt: new Date(),
    });
    await wishlist.save();
  }

  return await getUserWishlist(userId);
};

/**
 * Toggle trạng thái yêu thích (Thêm nếu chưa có, Xóa nếu đã có)
 * AC: Toggle lần 1 thêm, lần 2 xóa; không tạo duplicate; chỉ User hiện tại được xem/sửa wishlist của mình; populate đúng dữ liệu item.
 */
export const toggleWishlist = async (userId, { itemId, itemType, productId, productType } = {}) => {
  const targetId = itemId || productId;
  const targetType = itemType || productType;

  const candidate = await resolveProductCandidate(targetId, targetType);
  if (!candidate) {
    const error = new Error("itemId hoặc productId không hợp lệ");
    error.statusCode = 400;
    error.errorCode = "INVALID_PRODUCT_ID";
    throw error;
  }

  const effectiveId = candidate.resolvedId;
  const detectedType = candidate.resolvedType;

  const wishlist = await getOrCreateWishlist(userId);

  const rawStr = String(targetId).trim();
  const effectiveIdStr = effectiveId.toString();

  const existingIndex = wishlist.items.findIndex((item) => {
    const itemProdStr = (item.itemId || item.productId || "").toString();
    const itemDocStr = (item._id || "").toString();
    return (
      itemProdStr === effectiveIdStr ||
      itemProdStr === rawStr ||
      itemDocStr === rawStr
    );
  });

  let isFavorited = false;
  if (existingIndex > -1) {
    // Đã có trong danh sách -> Xóa bỏ khỏi wishlist (Toggle lần 2: Xóa)
    wishlist.items.splice(existingIndex, 1);
    isFavorited = false;
  } else {
    // Chưa có -> Thêm vào wishlist (Toggle lần 1: Thêm)
    wishlist.items.push({
      itemId: effectiveId,
      itemType: detectedType,
      productId: effectiveId,
      productType: detectedType,
      addedAt: new Date(),
    });
    isFavorited = true;
  }

  await wishlist.save();
  const fullWishlist = await getUserWishlist(userId);

  return {
    ...fullWishlist,
    isFavorited,
  };
};

/**
 * Xóa một sản phẩm khỏi danh sách yêu thích
 */
export const removeFromWishlist = async (userId, productId) => {
  if (!productId) {
    return await getUserWishlist(userId);
  }

  const wishlist = await Wishlist.findOne({ userId });
  if (!wishlist) {
    return { items: [], totalItems: 0 };
  }

  const candidate = await resolveProductCandidate(productId);
  const effectiveIdStr = candidate ? candidate.resolvedId.toString() : null;
  const targetId = String(productId).trim();

  wishlist.items = wishlist.items.filter((item) => {
    const itemProdId = (item.itemId || item.productId || "").toString();
    const itemDocId = (item._id || "").toString();
    if (itemProdId === targetId || itemDocId === targetId) return false;
    if (effectiveIdStr && itemProdId === effectiveIdStr) return false;
    return true;
  });
  await wishlist.save();

  return await getUserWishlist(userId);
};

/**
 * Làm rỗng toàn bộ danh sách yêu thích
 */
export const clearWishlist = async (userId) => {
  let wishlist = await Wishlist.findOne({ userId });
  if (wishlist) {
    wishlist.items = [];
    await wishlist.save();
  }

  return { items: [], totalItems: 0 };
};
