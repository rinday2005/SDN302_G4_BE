import mongoose from "mongoose";
import ThriftListing from "./thriftListing.model.js";
import Category from "../../category/category.model.js";

/**
 * Lấy danh sách sản phẩm thanh lý (Thrift Marketplace)
 */
export const getThriftListings = async (query = {}) => {
  const {
    page = 1,
    limit = 20,
    category,
    search,
    q,
    minPrice,
    maxPrice,
    condition,
    status = "APPROVED",
    sort = "newest",
    ownerId,
  } = query;

  const filter = {};

  // 1. Trạng thái hiển thị (Mặc định chỉ lấy hàng APPROVED)
  if (status && status !== "ALL") {
    filter.status = status;
  }

  // 2. Lọc theo chủ shop
  if (ownerId && mongoose.Types.ObjectId.isValid(ownerId)) {
    filter.ownerId = new mongoose.Types.ObjectId(ownerId);
  }

  // 3. Lọc theo Danh mục (Hỗ trợ cả categoryId hoặc category slug như camera, shoes, dam-du-tiec, clothing, phu-kien)
  if (category) {
    if (mongoose.Types.ObjectId.isValid(category)) {
      filter.categoryId = new mongoose.Types.ObjectId(category);
    } else {
      const cat = await Category.findOne({
        $or: [{ slug: category.toLowerCase() }, { name: new RegExp(category, "i") }],
      });
      if (cat) {
        filter.categoryId = cat._id;
      }
    }
  }

  // 4. Tìm kiếm theo tên sản phẩm
  const searchTerm = search || q;
  if (searchTerm && typeof searchTerm === "string") {
    filter.$or = [
      { name: new RegExp(searchTerm.trim(), "i") },
      { description: new RegExp(searchTerm.trim(), "i") },
    ];
  }

  // 5. Khoảng giá
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  // 6. Tình trạng
  if (condition) {
    filter.condition = new RegExp(condition, "i");
  }

  // Sắp xếp
  let sortOption = { createdAt: -1 };
  if (sort === "price_asc") sortOption = { price: 1 };
  else if (sort === "price_desc") sortOption = { price: -1 };
  else if (sort === "oldest") sortOption = { createdAt: 1 };

  const skip = (Number(page) - 1) * Number(limit);

  const [listings, total] = await Promise.all([
    ThriftListing.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .populate("categoryId", "name slug icon")
      .populate("ownerId", "fullName email phoneNumber avatar shopName"),
    ThriftListing.countDocuments(filter),
  ]);

  return {
    listings,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

/**
 * Lấy chi tiết sản phẩm thanh lý theo ID hoặc Slug
 */
export const getThriftListingById = async (idOrSlug) => {
  let listing = null;

  if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
    listing = await ThriftListing.findById(idOrSlug)
      .populate("categoryId", "name slug icon")
      .populate("ownerId", "fullName email phoneNumber avatar shopName");
  }

  if (!listing) {
    listing = await ThriftListing.findOne({ slug: idOrSlug })
      .populate("categoryId", "name slug icon")
      .populate("ownerId", "fullName email phoneNumber avatar shopName");
  }

  if (!listing) {
    const error = new Error("Sản phẩm thanh lý không tồn tại");
    error.statusCode = 404;
    error.errorCode = "THRIFT_LISTING_NOT_FOUND";
    throw error;
  }

  return listing;
};

/**
 * Tạo sản phẩm thanh lý mới
 */
export const createThriftListing = async (user, data) => {
  const {
    name,
    description,
    categoryId,
    category,
    price,
    condition,
    images,
    location,
    sourceType,
    sourceRentalProductId,
  } = data;

  if (!name || !price) {
    const error = new Error("Tên sản phẩm và giá bán là bắt buộc");
    error.statusCode = 400;
    error.errorCode = "MISSING_REQUIRED_FIELDS";
    throw error;
  }

  let resolvedCatId = categoryId;
  if (!resolvedCatId && category) {
    const cat = await Category.findOne({
      $or: [{ slug: category.toLowerCase() }, { name: new RegExp(category, "i") }],
    });
    if (cat) resolvedCatId = cat._id;
  }

  if (!resolvedCatId) {
    const defaultCat = await Category.findOne({});
    resolvedCatId = defaultCat?._id;
  }

  const slug =
    data.slug ||
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") +
      "-" +
      Date.now().toString().slice(-4);

  const listing = await ThriftListing.create({
    ownerId: user._id,
    sourceType: sourceType || "NEW",
    sourceRentalProductId: sourceRentalProductId || null,
    name: name.trim(),
    slug,
    description: description || "",
    categoryId: resolvedCatId,
    price: Number(price),
    condition: condition || "Rất tốt (95%)",
    images: Array.isArray(images) && images.length > 0 ? images : ["https://images.unsplash.com/photo-1543163521-1bf539c55dd2"],
    location: location || "Đà Nẵng",
    quantity: data.quantity !== undefined ? Number(data.quantity) : (sourceType === "RENTAL_PRODUCT" ? 1 : 10),
    size: data.size || "L",
    sizes: Array.isArray(data.sizes) && data.sizes.length > 0 ? data.sizes : ["S", "M", "L", "XL"],
    status: "APPROVED", // Auto-approved trong môi trường test/sandbox
  });

  return listing;
};

/**
 * Cập nhật thông tin sản phẩm thanh lý
 */
export const updateThriftListing = async (listingId, user, updateData) => {
  const listing = await ThriftListing.findById(listingId);
  if (!listing) {
    const error = new Error("Sản phẩm thanh lý không tồn tại");
    error.statusCode = 404;
    error.errorCode = "THRIFT_LISTING_NOT_FOUND";
    throw error;
  }

  const isOwner = listing.ownerId.toString() === user._id.toString();
  const isAdmin = user.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    const error = new Error("Bạn không có quyền sửa sản phẩm này");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  Object.assign(listing, updateData);
  await listing.save();

  return listing;
};

/**
 * Xóa hoặc ẩn sản phẩm thanh lý
 */
export const deleteThriftListing = async (listingId, user) => {
  const listing = await ThriftListing.findById(listingId);
  if (!listing) {
    const error = new Error("Sản phẩm thanh lý không tồn tại");
    error.statusCode = 404;
    error.errorCode = "THRIFT_LISTING_NOT_FOUND";
    throw error;
  }

  const isOwner = listing.ownerId.toString() === user._id.toString();
  const isAdmin = user.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    const error = new Error("Bạn không có quyền xóa sản phẩm này");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  listing.status = "HIDDEN";
  await listing.save();

  return { message: "Đã ẩn sản phẩm thanh lý thành công", listingId };
};
