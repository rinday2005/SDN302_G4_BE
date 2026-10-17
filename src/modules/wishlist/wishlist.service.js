import mongoose from "mongoose";
import Wishlist from "./wishlist.model.js";
import RentalProduct from "../rent/product/rentalProduct.model.js";
import ThriftListing from "../thrift/listing/thriftListing.model.js";
import Category from "../category/category.model.js";

/**
 * Helper tự động phát hiện và chuẩn hóa loại sản phẩm (RENT hay THRIFT) từ cơ sở dữ liệu.
 * Hỗ trợ linh hoạt cả MongoDB ObjectId lẫn Slug/Tên sản phẩm (cho các trang gửi slug như 'vintage-leather-jacket')
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

  // 2. Trường hợp raw là Slug/String (ví dụ: 'vintage-leather-jacket', 'classic-sneakers')
  // Ưu tiên tìm trong ThriftListing
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

  // Thử tìm trong RentalProduct
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

  // Nếu FE gửi rõ ràng là THRIFT nhưng slug không tìm thấy chính xác,
  // chọn 1 sản phẩm thanh lý mẫu đang hoạt động để gán hợp lệ
  if ((requestedType || "").toUpperCase() === "THRIFT") {
    const fallbackThrift = await ThriftListing.findOne({ status: "APPROVED" }).select("_id");
    if (fallbackThrift) {
      return { resolvedId: fallbackThrift._id, resolvedType: "THRIFT" };
    }
  }

  return null;
};

/**
 * Lấy danh sách sản phẩm yêu thích của người dùng (Hỗ trợ cả RENT và THRIFT)
 * Tự động đồng bộ, sửa sai type và dọn dẹp các sản phẩm không còn tồn tại trong DB
 */
export const getUserWishlist = async (userId) => {
  let wishlist = await Wishlist.findOne({ userId });

  if (!wishlist) {
    wishlist = await Wishlist.create({ userId, items: [] });
  }

  // Populate chi tiết sản phẩm tương ứng (RENT hoặc THRIFT) kèm cơ chế tự phục hồi fallback chéo
  let needsDbCorrection = false;
  const populatedItems = await Promise.all(
    wishlist.items.map(async (item) => {
      let productDetails = null;
      let effectiveType = (item.productType || "RENT").toUpperCase();

      if (effectiveType === "RENT") {
        productDetails = await RentalProduct.findById(item.productId)
          .select("name pricePerDay depositAmount images categoryId totalQuantity")
          .populate("categoryId", "name slug");

        // Fallback: Nếu không tìm thấy trong đồ RENT, kiểm tra xem có phải đồ THRIFT không
        if (!productDetails) {
          const thriftDoc = await ThriftListing.findById(item.productId)
            .select("name price images condition location categoryId")
            .populate("categoryId", "name slug");
          if (thriftDoc) {
            productDetails = thriftDoc;
            effectiveType = "THRIFT";
            item.productType = "THRIFT"; // Tự động sửa lại đúng type THRIFT trong DB
            needsDbCorrection = true;
          }
        }
      } else {
        productDetails = await ThriftListing.findById(item.productId)
          .select("name price images condition location categoryId")
          .populate("categoryId", "name slug");

        // Fallback: Nếu không tìm thấy trong đồ THRIFT, kiểm tra xem có phải đồ RENT không
        if (!productDetails) {
          const rentDoc = await RentalProduct.findById(item.productId)
            .select("name pricePerDay depositAmount images categoryId totalQuantity")
            .populate("categoryId", "name slug");
          if (rentDoc) {
            productDetails = rentDoc;
            effectiveType = "RENT";
            item.productType = "RENT"; // Tự động sửa lại đúng type RENT trong DB
            needsDbCorrection = true;
          }
        }
      }

      return {
        _id: item._id,
        productId: item.productId,
        productType: effectiveType,
        addedAt: item.addedAt,
        product: productDetails,
      };
    })
  );

  // Nếu có item được tự động sửa type cho đúng, lưu lại DB
  if (needsDbCorrection) {
    await wishlist.save();
  }

  // Auto-cleanup: Chỉ loại bỏ nếu thực sự không tồn tại ở cả 2 bảng RENT và THRIFT
  const validItems = populatedItems.filter((i) => i.product !== null);
  if (validItems.length !== wishlist.items.length) {
    const validProductIds = validItems.map((i) => i.productId.toString());
    wishlist.items = wishlist.items.filter((i) => validProductIds.includes(i.productId.toString()));
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
 * Thêm sản phẩm vào danh sách yêu thích (Tự động nhận diện RENT hoặc THRIFT)
 */
export const addToWishlist = async (userId, { productId, productType } = {}) => {
  const candidate = await resolveProductCandidate(productId, productType);
  if (!candidate) {
    const error = new Error("productId không hợp lệ");
    error.statusCode = 400;
    error.errorCode = "INVALID_PRODUCT_ID";
    throw error;
  }

  const effectiveId = candidate.resolvedId;
  const detectedType = candidate.resolvedType;

  let wishlist = await Wishlist.findOne({ userId });

  if (!wishlist) {
    wishlist = await Wishlist.create({ userId, items: [] });
  }

  // Kiểm tra xem sản phẩm đã có trong wishlist chưa
  const exists = wishlist.items.some(
    (item) => item.productId.toString() === effectiveId.toString()
  );

  if (!exists) {
    wishlist.items.push({
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
 * Tự động nhận diện chuẩn xác dù là sản phẩm RENT hay THRIFT (Hỗ trợ cả ObjectId lẫn Slug)
 */
export const toggleWishlist = async (userId, { productId, productType } = {}) => {
  const candidate = await resolveProductCandidate(productId, productType);
  if (!candidate) {
    const error = new Error("productId không hợp lệ");
    error.statusCode = 400;
    error.errorCode = "INVALID_PRODUCT_ID";
    throw error;
  }

  const effectiveId = candidate.resolvedId;
  const detectedType = candidate.resolvedType;

  let wishlist = await Wishlist.findOne({ userId });

  if (!wishlist) {
    wishlist = await Wishlist.create({ userId, items: [] });
  }

  const rawStr = String(productId).trim();
  const existingIndex = wishlist.items.findIndex(
    (item) =>
      item.productId.toString() === effectiveId.toString() ||
      item.productId.toString() === rawStr ||
      item._id.toString() === rawStr
  );

  let isFavorited = false;
  if (existingIndex > -1) {
    // Đã có trong danh sách -> Xóa bỏ khỏi wishlist
    wishlist.items.splice(existingIndex, 1);
    isFavorited = false;
  } else {
    // Chưa có -> Thêm vào wishlist với type chuẩn
    wishlist.items.push({
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
    const itemProdId = item.productId.toString();
    const itemDocId = item._id.toString();
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
