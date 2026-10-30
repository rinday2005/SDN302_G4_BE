import ThriftListing from "./thriftListing.model.js";
import RentalProduct from "../../rent/product/product.model.js";
import RentalOrder from "../../rent/order/order.model.js";
import RentalAvailability from "../../rent/availability/availability.model.js";

// 1. Tạo listing mới (Shop Owner)
export const createListing = async (userId, data) => {
  // AC: ownerId không lấy tự do từ body, gán từ req.user.id
  // AC: status mặc định luôn là PENDING_APPROVAL
  const newListing = await ThriftListing.create({
    ...data,
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
  return await ThriftListing.find(filter).populate("categoryId", "name").lean();
};

// 4. Lấy chi tiết listing theo ID
export const getListingById = async (listingId) => {
  const listing = await ThriftListing.findById(listingId)
    .populate("categoryId", "name")
    .populate("ownerId", "fullName email phoneNumber address");
  if (!listing) {
    const error = new Error("Sản phẩm thanh lý không tồn tại");
    error.statusCode = 404;
    throw error;
  }
  return listing;
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

  const newListing = await ThriftListing.create({
    ownerId: userId,
    name: name || rentalProduct.name,
    description: conditionDescription || description || rentalProduct.description || "",
    price: Number(finalSellingPrice),
    condition: condition || rentalProduct.condition || "GOOD",
    images: thriftImages,
    categoryId: categoryId || rentalProduct.categoryId,
    location: location || rentalProduct.location || "",
    status: "APPROVED",
    sourceType: "RENTAL_PRODUCT",
    sourceRentalProductId: rentalProduct._id,
  });

  return newListing;
};

// 6. Lấy toàn bộ bài đăng thanh lý của Shop Owner từ MongoDB
export const getShopListings = async (userId) => {
  return await ThriftListing.find({ ownerId: userId })
    .populate("categoryId", "name")
    .sort({ createdAt: -1 })
    .lean();
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
