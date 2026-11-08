import mongoose from "mongoose";
import ThriftListing from "./thriftListing.model.js";
import RentalProduct from "../../rent/product/product.model.js";
import RentalOrder from "../../rent/order/order.model.js";
import RentalAvailability from "../../rent/availability/availability.model.js";
import cloudinary from "../../../config/cloudinary.js";
import { normalizeShopBranch } from "../../../utils/shipping.js";

const FALLBACK_THRIFT_IMAGE =
  "https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800&auto=format&fit=crop&q=80";

const uploadBase64ThriftImages = async (images = []) => {
  if (!Array.isArray(images)) return [];
  const result = [];
  for (const img of images) {
    if (typeof img === "string" && img.startsWith("data:image/")) {
      try {
        const uploaded = await cloudinary.uploader.upload(img, {
          folder: "reuse_hub/thrift_listings",
          resource_type: "image",
        });
        result.push(uploaded.secure_url || uploaded.url || FALLBACK_THRIFT_IMAGE);
      } catch {
        result.push(FALLBACK_THRIFT_IMAGE);
      }
    } else if (typeof img === "string" && img.trim()) {
      result.push(img.trim());
    }
  }
  return result.length > 0 ? result : [FALLBACK_THRIFT_IMAGE];
};

const sanitizeThriftForClient = (item) => {
  if (!item) return item;
  const rawImages = Array.isArray(item.images) ? item.images : [];
  let hasBase64 = false;
  const cleanImages = rawImages.map((img) => {
    if (typeof img === "string" && img.startsWith("data:")) {
      hasBase64 = true;
      return FALLBACK_THRIFT_IMAGE;
    }
    return img;
  });

  if (hasBase64 && item._id) {
    uploadBase64ThriftImages(rawImages)
      .then((uploadedUrls) =>
        ThriftListing.updateOne({ _id: item._id }, { $set: { images: uploadedUrls } })
      )
      .catch(() => {});
  }

  const rawSizes = Array.isArray(item.sizes) ? item.sizes.filter(Boolean) : [];
  const activeSize = item.size || (rawSizes.length > 0 ? rawSizes[0] : '');

  const ownerObj = typeof item.ownerId === "object" && item.ownerId !== null ? item.ownerId : null;
  const resolvedShopName =
    item.shopName ||
    ownerObj?.shopProfile?.shopName ||
    ownerObj?.fullName ||
    "ReUse Shop";
  const resolvedShopId = item.shopId || ownerObj?._id || item.ownerId;

  return {
    ...item,
    shopId: resolvedShopId,
    shopName: resolvedShopName,
    location: normalizeShopBranch(item.location),
    images: cleanImages.length > 0 ? cleanImages : [FALLBACK_THRIFT_IMAGE],
    sizes: rawSizes.length > 0 ? rawSizes : (activeSize ? [activeSize] : []),
    size: activeSize,
  };
};

// 1. Tạo listing mới (Shop Owner)
export const createListing = async (userId, data) => {
  const User = (await import("../../user/user.model.js")).default;
  const owner = await User.findById(userId).select("address shopProfile");
  const ownerLoc = owner?.address?.province || owner?.shopProfile?.cityRegion || owner?.shopProfile?.businessAddress;
  const shopLoc = ownerLoc || data?.location || "Thành phố Đà Nẵng";
  const safeData = { ...data, location: shopLoc };
  if (Array.isArray(safeData.images)) {
    safeData.images = await uploadBase64ThriftImages(safeData.images);
  }

  // Chuẩn hóa sizes và size
  if (Array.isArray(safeData.sizes)) {
    safeData.sizes = safeData.sizes.filter(Boolean);
    if (!safeData.size && safeData.sizes.length > 0) {
      safeData.size = safeData.sizes[0];
    }
  } else if (safeData.size) {
    safeData.sizes = [safeData.size];
  }

  // AC: ownerId không lấy tự do từ body, gán từ req.user.id
  // AC: status mặc định luôn là PENDING_APPROVAL
  const sName = owner?.shopProfile?.shopName || owner?.fullName || "ReUse Shop";
  const newListing = await ThriftListing.create({
    ...safeData,
    ownerId: userId,
    shopId: userId,
    shopName: sName,
    status: "PENDING_APPROVAL",
  });
  return newListing;
};

// 2. Chỉnh sửa listing (Chỉ chính chủ Shop Owner sở hữu mới được sửa)
export const updateListing = async (listingId, userId, updateData) => {
  const listing = await ThriftListing.findById(listingId);
  if (!listing) {
    const error = new Error("Sản phẩm thanh lý không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // AC: Chặn người khác sửa listing
  if (listing.ownerId.toString() !== userId.toString()) {
    const error = new Error("Bạn không có quyền chỉnh sửa listing này");
    error.statusCode = 403;
    throw error;
  }

  // Chặn ghi đè ownerId từ client
  delete updateData.ownerId;
  if (updateData.location !== undefined) {
    updateData.location = normalizeShopBranch(updateData.location);
  }
  if (Array.isArray(updateData.sizes)) {
    updateData.sizes = updateData.sizes.filter(Boolean);
    if (!updateData.size && updateData.sizes.length > 0) {
      updateData.size = updateData.sizes[0];
    }
  } else if (updateData.size) {
    updateData.sizes = [updateData.size];
  }

  Object.assign(listing, updateData);
  await listing.save();
  return listing;
};

// 3. Lấy danh sách listing public cho khách xem
export const getPublicListings = async (query = {}) => {
  const filter = { ...query };
  delete filter.includeSold;

  if (query.ownerId) {
    const oId = mongoose.Types.ObjectId.isValid(query.ownerId) ? new mongoose.Types.ObjectId(query.ownerId) : null;
    delete filter.ownerId;
    const ownerConds = [];
    if (oId) {
      ownerConds.push({ ownerId: oId }, { shopId: oId }, { sellerId: oId });
    }
    ownerConds.push({ ownerId: String(query.ownerId) }, { shopId: String(query.ownerId) });
    filter.$or = ownerConds;
  }

  if (query.status) {
    if (query.status === "ALL" || query.status === "all") {
      delete filter.status;
    } else if (typeof query.status === "string" && query.status.includes(",")) {
      filter.status = { $in: query.status.split(",") };
    }
  } else {
    // Luôn giữ các sản phẩm đã bán/đã mua (SOLD) hiển thị trên Thrift Marketplace
    filter.status = { $in: ["APPROVED", "SOLD"] };
  }
  const items = await ThriftListing.find(filter).populate("categoryId", "name").populate("ownerId", "fullName email phoneNumber address avatarUrl role shopProfile kycStatus").lean();
  return items.map(sanitizeThriftForClient);
};

// 4. Lấy chi tiết listing theo ID
export const getListingById = async (listingId) => {
  const listing = await ThriftListing.findById(listingId)
    .populate("categoryId", "name")
    .populate("ownerId", "fullName email phoneNumber address avatarUrl role shopProfile kycStatus")
    .lean();
  if (!listing) {
    const error = new Error("Sản phẩm thanh lý không tồn tại");
    error.statusCode = 404;
    throw error;
  }
  return sanitizeThriftForClient(listing);
};

// 5. Chuyển đổi sản phẩm RENT sang THRIFT (Circular Economy API) - [BE-S4-04]
export const convertFromRental = async (userId, data) => {
  const {
    rentalProductId,
    sellingPrice,
    price,
    conditionDescription,
    description,
    images,
    condition,
    categoryId,
    location,
    name,
    sizes,
    size,
    status,
  } = data;

  if (!rentalProductId) {
    const error = new Error("rentalProductId là bắt buộc");
    error.statusCode = 400;
    throw error;
  }

  const finalSellingPrice = sellingPrice !== undefined ? sellingPrice : price;
  if (finalSellingPrice === undefined || finalSellingPrice === null || Number(finalSellingPrice) <= 0) {
    const error = new Error("sellingPrice là bắt buộc và phải lớn hơn 0");
    error.statusCode = 400;
    throw error;
  }

  // 1. Tìm sản phẩm thuê linh hoạt (hỗ trợ cả ObjectId, SKU, hoặc ID hiện vật)
  let rentalProduct = null;
  if (mongoose.Types.ObjectId.isValid(rentalProductId)) {
    rentalProduct = await RentalProduct.findById(rentalProductId);
  }
  if (!rentalProduct) {
    rentalProduct = await RentalProduct.findOne({ sku: rentalProductId });
  }
  if (!rentalProduct && typeof rentalProductId === "string") {
    const parts = rentalProductId.split("-");
    if (parts.length >= 2) {
      const fragment = parts[1];
      rentalProduct = await RentalProduct.findOne({
        $or: [
          { sku: { $regex: fragment, $options: "i" } },
          { name: { $regex: fragment, $options: "i" } },
        ],
      });
    }
  }

  let resolvedOwnerId = userId;
  let resolvedShopId = userId;
  let resolvedShopName = "ReUse Shop";
  let resolvedSourceProductId = null;

  if (rentalProduct) {
    // 2. Xác minh sản phẩm thuộc quyền sở hữu của Shop Owner đang đăng nhập (hoặc Admin)
    const User = (await import("../../user/user.model.js")).default;
    const currentUser = await User.findById(userId).select("role");
    const isAdmin = currentUser?.role === "ADMIN";

    if (!isAdmin && rentalProduct.ownerId && rentalProduct.ownerId.toString() !== userId.toString()) {
      const error = new Error("Bạn không có quyền chuyển đổi sản phẩm này");
      error.statusCode = 403;
      throw error;
    }

    resolvedOwnerId = rentalProduct.ownerId || userId;
    resolvedShopId = rentalProduct.shopId || resolvedOwnerId;
    resolvedShopName = rentalProduct.shopName || "ReUse Shop";
    resolvedSourceProductId = rentalProduct._id;

    // 3. Quản lý số lượng kho cho thuê: nếu còn nhiều chiếc thì trừ 1, nếu chiếc cuối cùng thì ẩn khỏi RENT
    if (rentalProduct.totalQuantity && rentalProduct.totalQuantity > 1) {
      rentalProduct.totalQuantity -= 1;
    } else {
      rentalProduct.status = "HIDDEN";
    }
    await rentalProduct.save();
  }

  // 4. Tạo THRIFT listing mới với sourceType = RENTAL_PRODUCT và status = PENDING_APPROVAL
  const thriftImages = Array.isArray(images) && images.length > 0
    ? images
    : (rentalProduct?.images || [FALLBACK_THRIFT_IMAGE]);

  const resolvedSizes = Array.isArray(sizes) && sizes.length > 0
    ? sizes
    : (rentalProduct?.sizes || []);
  const resolvedSize = size || (resolvedSizes.length > 0 ? resolvedSizes[0] : (rentalProduct?.size || ''));

  const initialStatus = status || "PENDING_APPROVAL";

  const newListing = await ThriftListing.create({
    ownerId: resolvedOwnerId,
    shopId: resolvedShopId,
    shopName: resolvedShopName,
    name: name || rentalProduct?.name || "Sản phẩm chuyển đổi từ kho RENT",
    description: conditionDescription || description || rentalProduct?.description || "",
    price: Number(finalSellingPrice),
    condition: condition || rentalProduct?.condition || "GOOD",
    images: thriftImages,
    sizes: resolvedSizes,
    size: resolvedSize,
    categoryId: categoryId || rentalProduct?.categoryId,
    location: normalizeShopBranch(location || rentalProduct?.location),
    status: initialStatus,
    sourceType: "RENTAL_PRODUCT",
    sourceRentalProductId: resolvedSourceProductId,
  });

  return newListing;
};

// 6. Lấy toàn bộ bài đăng thanh lý của Shop Owner từ MongoDB
export const getShopListings = async (userId) => {
  let items = [];
  if (userId) {
    items = await ThriftListing.find({ ownerId: userId })
      .populate("categoryId", "name")
      .sort({ createdAt: -1 })
      .lean();
  }
  // Isolation: strictly return listings belonging to this owner
  // Do not fallback to other shop owners' listings
  return items.map(sanitizeThriftForClient);
};

// 7. Xóa bài đăng thanh lý của Shop Owner
export const deleteListing = async (listingId, userId) => {
  const listing = await ThriftListing.findById(listingId);
  if (!listing) {
    const error = new Error("Sản phẩm thanh lý không tồn tại");
    error.statusCode = 404;
    throw error;
  }
  if (listing.ownerId.toString() !== userId.toString()) {
    const error = new Error("Bạn không có quyền xóa listing này");
    error.statusCode = 403;
    throw error;
  }
  await listing.deleteOne();
  return listing;
};
