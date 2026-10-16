import ThriftListing from "./thriftListing.model.js";

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
  // AC: Listing public CHỈ CÓ THỂ LÀ APPROVED
  const filter = {
    ...query,
    status: "APPROVED",
  };
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