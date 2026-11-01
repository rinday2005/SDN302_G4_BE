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

  return {
    ...item,
    location: normalizeShopBranch(item.location),
    images: cleanImages.length > 0 ? cleanImages : [FALLBACK_THRIFT_IMAGE],
    sizes: rawSizes.length > 0 ? rawSizes : (activeSize ? [activeSize] : []),
    size: activeSize,
  };
};

// 1. Tạo listing mới (Shop Owner)
export const createListing = async (userId, data) => {
  const safeData = { ...data, location: normalizeShopBranch(data?.location) };
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
  const newListing = await ThriftListing.create({
    ...safeData,
    ownerId: userId,
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
  const items = await ThriftListing.find(filter).populate("categoryId", "name").lean();
  return items.map(sanitizeThriftForClient);
};

// 4. Lấy chi tiết listing theo ID
export const getListingById = async (listingId) => {
  const listing = await ThriftListing.findById(listingId)
    .populate("categoryId", "name")
    .populate("ownerId", "fullName email phoneNumber address")
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

  // 1. Tìm sản phẩm thuê
  const rentalProduct = await RentalProduct.findById(rentalProductId);
  if (!rentalProduct) {
    const error = new Error("Sản phẩm thuê không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // 2. Xác minh sản phẩm thuộc quyền sở hữu của Shop Owner đang đăng nhập
  if (rentalProduct.ownerId.toString() !== userId.toString()) {
    const error = new Error("Bạn không có quyền chuyển đổi sản phẩm này");
    error.statusCode = 403;
    throw error;
  }

  // 3. Kiểm tra sản phẩm có đang bị ẩn hay đã được chuyển đổi
  if (rentalProduct.status === "HIDDEN") {
    const error = new Error("Sản phẩm này đã ở trạng thái HIDDEN hoặc đã được chuyển đổi trước đó");
    error.statusCode = 400;
    throw error;
  }

  // 4. Kiểm tra có RentalOrder active hoặc booking tương lai không
  const activeOrder = await RentalOrder.findOne({
    "items.productId": rentalProductId,
    status: { $nin: ["COMPLETED", "CANCELLED", "REJECTED"] },
  });
  if (activeOrder) {
    const error = new Error("Không thể chuyển đổi: Sản phẩm đang có đơn thuê đang xử lý/hoạt động hoặc có lịch đặt trước trong tương lai");
    error.statusCode = 400;
    throw error;
  }

  // 5. Kiểm tra có đang trong lịch bảo trì (RentalAvailability) không
  const maintenance = await RentalAvailability.findOne({
    productId: rentalProductId,
    endDate: { $gte: new Date() },
  });
  if (maintenance) {
    const error = new Error("Không thể chuyển đổi: Sản phẩm đang trong lịch bảo trì hoặc bị tạm khóa");
    error.statusCode = 400;
    throw error;
  }

  // 6. Đặt RENT product thành HIDDEN để không còn xuất hiện trên marketplace RENT
  rentalProduct.status = "HIDDEN";
  await rentalProduct.save();

  // 7. Tạo THRIFT listing mới với sourceType = RENTAL_PRODUCT
  const thriftImages = Array.isArray(images) && images.length > 0
    ? images
    : rentalProduct.images;

  const resolvedSizes = Array.isArray(sizes) && sizes.length > 0
    ? sizes
    : (rentalProduct.sizes || []);
  const resolvedSize = size || (resolvedSizes.length > 0 ? resolvedSizes[0] : (rentalProduct.size || ''));

  const newListing = await ThriftListing.create({
    ownerId: userId,
    name: name || rentalProduct.name,
    description: conditionDescription || description || rentalProduct.description || "",
    price: Number(finalSellingPrice),
    condition: condition || rentalProduct.condition || "GOOD",
    images: thriftImages,
    sizes: resolvedSizes,
    size: resolvedSize,
    categoryId: categoryId || rentalProduct.categoryId,
    location: normalizeShopBranch(location || rentalProduct.location),
    status: "APPROVED",
    sourceType: "RENTAL_PRODUCT",
    sourceRentalProductId: rentalProduct._id,
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
  if (items.length === 0) {
    items = await ThriftListing.find({})
      .populate("categoryId", "name")
      .sort({ createdAt: -1 })
      .lean();
  }
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
