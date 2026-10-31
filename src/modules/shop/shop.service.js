import mongoose from "mongoose";
import User from "../user/user.model.js";
import RentalOrder from "../rent/order/order.model.js";
import ThriftOrder from "../thrift/order/thriftOrder.model.js";

/**
 * Lấy thông tin Shop Profile của Shop Owner từ MongoDB
 */
export const getShopProfileService = async (userId) => {
  let user = null;

  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    user = await User.findById(userId);
  }

  // Nếu user không có role SHOP_OWNER, tìm tài khoản SHOP_OWNER duy nhất trong hệ thống
  if (!user || user.role !== "SHOP_OWNER") {
    user = await User.findOne({ role: "SHOP_OWNER" });
  }

  if (!user) {
    const error = new Error("Không tìm thấy thông tin Shop Owner");
    error.statusCode = 404;
    throw error;
  }

  const shopProfile = user.shopProfile || {};

  return {
    shopId: user._id,
    shopName: shopProfile.shopName || user.fullName || "Atelier Chronos & Optics Ltd.",
    ownerName: user.fullName || "Phạm Thùy Dương",
    email: user.email,
    secondaryEmail: shopProfile.secondaryEmail || "",
    phoneNumber: user.phoneNumber || "",
    address:
      shopProfile.businessAddress ||
      (user.address
        ? [user.address.detail, user.address.ward, user.address.district, user.address.province]
            .filter(Boolean)
            .join(", ")
        : "48 Bạch Đằng, Phường Hải Châu 1, Quận Hải Châu, Thành phố Đà Nẵng"),
    cityRegion: shopProfile.cityRegion || user.address?.province || "Đà Nẵng, Việt Nam",
    avatarUrl: user.avatarUrl || "",
    coverUrl: shopProfile.coverUrl || "",
    description: shopProfile.description || "",
    specialization: shopProfile.specialization || "",
    roleTitle: shopProfile.roleTitle || "Master Curator & Archival Custodian",
    rating: shopProfile.rating ?? 5.0,
    establishedYear: shopProfile.establishedYear || 2024,
    walletBalance: user.walletBalance || 0,
    kycStatus: user.kycStatus || "APPROVED",
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

/**
 * Cập nhật thông tin Shop Profile vào Collection User trong MongoDB
 */
export const updateShopProfileService = async (userId, updateData) => {
  let user = null;

  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    user = await User.findById(userId);
  }

  if (!user || user.role !== "SHOP_OWNER") {
    user = await User.findOne({ role: "SHOP_OWNER" });
  }

  if (!user) {
    const error = new Error("Không tìm thấy tài khoản Shop Owner để cập nhật");
    error.statusCode = 404;
    throw error;
  }

  // 1. Validation dữ liệu cập nhật
  if (updateData.shopName !== undefined && typeof updateData.shopName === "string" && !updateData.shopName.trim()) {
    const error = new Error("Tên Shop không được để trống");
    error.statusCode = 400;
    throw error;
  }

  if (updateData.phoneNumber !== undefined && updateData.phoneNumber.trim()) {
    const phoneRegex = /^[0-9+() -]{8,18}$/;
    if (!phoneRegex.test(updateData.phoneNumber.trim())) {
      const error = new Error("Số điện thoại không đúng định dạng");
      error.statusCode = 400;
      throw error;
    }
  }

  if (updateData.secondaryEmail !== undefined && updateData.secondaryEmail.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(updateData.secondaryEmail.trim())) {
      const error = new Error("Email phụ không đúng định dạng");
      error.statusCode = 400;
      throw error;
    }
  }

  // 2. Cập nhật các trường cơ bản của User
  if (updateData.ownerName && typeof updateData.ownerName === "string") {
    user.fullName = updateData.ownerName.trim();
  } else if (updateData.fullName && typeof updateData.fullName === "string") {
    user.fullName = updateData.fullName.trim();
  }

  if (updateData.phoneNumber !== undefined) {
    user.phoneNumber = updateData.phoneNumber.trim();
  }

  if (updateData.avatarUrl !== undefined) {
    user.avatarUrl = updateData.avatarUrl.trim();
  }

  // 3. Cập nhật subdocument shopProfile
  if (!user.shopProfile) {
    user.shopProfile = {};
  }

  if (updateData.shopName !== undefined) {
    user.shopProfile.shopName = updateData.shopName.trim();
  }
  if (updateData.description !== undefined) {
    user.shopProfile.description = updateData.description.trim();
  }
  if (updateData.specialization !== undefined) {
    user.shopProfile.specialization = updateData.specialization.trim();
  }
  if (updateData.roleTitle !== undefined) {
    user.shopProfile.roleTitle = updateData.roleTitle.trim();
  }
  if (updateData.secondaryEmail !== undefined) {
    user.shopProfile.secondaryEmail = updateData.secondaryEmail.trim();
  }
  if (updateData.businessAddress !== undefined) {
    user.shopProfile.businessAddress = updateData.businessAddress.trim();
  } else if (updateData.address !== undefined) {
    user.shopProfile.businessAddress = updateData.address.trim();
  } else if (updateData.addressLine !== undefined) {
    user.shopProfile.businessAddress = updateData.addressLine.trim();
  }
  if (updateData.cityRegion !== undefined) {
    user.shopProfile.cityRegion = updateData.cityRegion.trim();
    user.address = {
      ...(user.address?.toObject ? user.address.toObject() : user.address || {}),
      province: updateData.cityRegion.split(",")[0].trim() || "Đà Nẵng",
      detail: user.shopProfile.businessAddress || user.address?.detail || "",
    };
  }
  if (updateData.coverUrl !== undefined) {
    user.shopProfile.coverUrl = updateData.coverUrl.trim();
  }

  await user.save();

  return getShopProfileService(user._id);
};

/**
 * Tính toán doanh thu thực tế bằng MongoDB Aggregation Pipeline
 * Điều kiện: Chỉ tính tổng tiền của các giao dịch/đơn hàng có status === 'COMPLETED'
 * Phân tách rõ: Doanh thu từ Rent và Doanh thu từ Thrift
 */
export const getShopRevenueService = async (userId, queryFilters = {}) => {
  let shopUser = null;
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    shopUser = await User.findById(userId);
  }
  if (!shopUser || shopUser.role !== "SHOP_OWNER") {
    shopUser = await User.findOne({ role: "SHOP_OWNER" });
  }

  const ownerId = shopUser?._id;

  // Lọc theo khoảng thời gian nếu người dùng chỉ định
  const dateMatch = {};
  if (queryFilters.startDate || queryFilters.endDate) {
    dateMatch.createdAt = {};
    if (queryFilters.startDate) {
      dateMatch.createdAt.$gte = new Date(queryFilters.startDate);
    }
    if (queryFilters.endDate) {
      const end = new Date(queryFilters.endDate);
      end.setHours(23, 59, 59, 999);
      dateMatch.createdAt.$lte = end;
    }
  }

  // ========================================================
  // 1. PIPELINE AGGREGATION CHO DOANH THU THUÊ (RENT REVENUE)
  // ========================================================
  const rentMatch = {
    status: "COMPLETED",
    ...dateMatch,
  };
  if (ownerId) {
    rentMatch.shopOwnerId = ownerId;
  }

  const rentOverviewPromise = RentalOrder.aggregate([
    { $match: rentMatch },
    {
      $group: {
        _id: null,
        totalRentRevenue: { $sum: "$rentalFee" },
        totalRentGross: { $sum: "$totalAmount" },
        completedRentOrdersCount: { $sum: 1 },
        avgRentOrderValue: { $avg: "$rentalFee" },
      },
    },
  ]);

  // Phân tích biểu đồ doanh thu Rent theo tháng
  const rentMonthlyPromise = RentalOrder.aggregate([
    { $match: rentMatch },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        rentRevenue: { $sum: "$rentalFee" },
        ordersCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Top sản phẩm cho thuê mang lại doanh thu cao nhất
  const topRentProductsPromise = RentalOrder.aggregate([
    { $match: rentMatch },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.productId",
        name: { $first: "$items.name" },
        imageUrl: { $first: "$items.imageUrl" },
        pricePerDay: { $first: "$items.pricePerDay" },
        totalRevenue: {
          $sum: {
            $multiply: ["$items.pricePerDay", "$items.quantity", { $ifNull: ["$items.rentalDays", 1] }],
          },
        },
        rentalTimes: { $sum: "$items.quantity" },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 6 },
  ]);

  // ========================================================
  // 2. PIPELINE AGGREGATION CHO DOANH THU BÁN THANH LÝ (THRIFT REVENUE)
  // ========================================================
  const thriftMatch = {
    status: "COMPLETED",
    ...dateMatch,
  };

  const thriftOverviewPromise = ThriftOrder.aggregate([
    { $match: thriftMatch },
    {
      $group: {
        _id: null,
        totalThriftRevenue: { $sum: "$itemsTotal" },
        totalThriftGross: { $sum: "$totalAmount" },
        completedThriftOrdersCount: { $sum: 1 },
        avgThriftOrderValue: { $avg: "$itemsTotal" },
      },
    },
  ]);

  // Phân tích biểu đồ doanh thu Thrift theo tháng
  const thriftMonthlyPromise = ThriftOrder.aggregate([
    { $match: thriftMatch },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        thriftRevenue: { $sum: "$itemsTotal" },
        ordersCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Top sản phẩm thanh lý bán chạy nhất
  const topThriftProductsPromise = ThriftOrder.aggregate([
    { $match: thriftMatch },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.listingId",
        name: { $first: "$items.name" },
        imageUrl: { $first: { $arrayElemAt: ["$items.images", 0] } },
        price: { $first: "$items.price" },
        totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        soldCount: { $sum: "$items.quantity" },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 6 },
  ]);

  // ========================================================
  // 3. DANH SÁCH GIAO DỊCH HOÀN TẤT GẦN ĐÂY (RECENT COMPLETED TRANSACTIONS)
  // ========================================================
  const recentRentOrdersPromise = RentalOrder.find(rentMatch)
    .populate("renterId", "fullName email phoneNumber")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const recentThriftOrdersPromise = ThriftOrder.find(thriftMatch)
    .populate("buyerId", "fullName email phoneNumber")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  // Thực thi song song tất cả các aggregation pipelines
  const [
    rentOverview,
    rentMonthly,
    topRentProducts,
    thriftOverview,
    thriftMonthly,
    topThriftProducts,
    recentRentOrders,
    recentThriftOrders,
  ] = await Promise.all([
    rentOverviewPromise,
    rentMonthlyPromise,
    topRentProductsPromise,
    thriftOverviewPromise,
    thriftMonthlyPromise,
    topThriftProductsPromise,
    recentRentOrdersPromise,
    recentThriftOrdersPromise,
  ]);

  // Tính toán số liệu tổng hợp
  const rentRevenue = rentOverview[0]?.totalRentRevenue || 0;
  const completedRentOrdersCount = rentOverview[0]?.completedRentOrdersCount || 0;
  const avgRentOrderValue = Math.round(rentOverview[0]?.avgRentOrderValue || 0);

  const thriftRevenue = thriftOverview[0]?.totalThriftRevenue || 0;
  const completedThriftOrdersCount = thriftOverview[0]?.completedThriftOrdersCount || 0;
  const avgThriftOrderValue = Math.round(thriftOverview[0]?.avgThriftOrderValue || 0);

  const totalRevenue = rentRevenue + thriftRevenue;
  const totalCompletedOrders = completedRentOrdersCount + completedThriftOrdersCount;

  // Gom nhóm timeline theo từng tháng (kết hợp cả Rent và Thrift)
  const monthlyMap = new Map();

  rentMonthly.forEach((item) => {
    monthlyMap.set(item._id, {
      month: item._id,
      rentRevenue: item.rentRevenue || 0,
      thriftRevenue: 0,
      totalRevenue: item.rentRevenue || 0,
      ordersCount: item.ordersCount || 0,
    });
  });

  thriftMonthly.forEach((item) => {
    const existing = monthlyMap.get(item._id);
    if (existing) {
      existing.thriftRevenue = item.thriftRevenue || 0;
      existing.totalRevenue += item.thriftRevenue || 0;
      existing.ordersCount += item.ordersCount || 0;
    } else {
      monthlyMap.set(item._id, {
        month: item._id,
        rentRevenue: 0,
        thriftRevenue: item.thriftRevenue || 0,
        totalRevenue: item.thriftRevenue || 0,
        ordersCount: item.ordersCount || 0,
      });
    }
  });

  const timelineBreakdown = Array.from(monthlyMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // Chuẩn hóa danh sách giao dịch hoàn tất gần đây
  const transactions = [
    ...recentRentOrders.map((o) => ({
      id: o._id,
      orderCode: o.orderCode,
      type: "RENT",
      serviceType: "Cho thuê hiện vật",
      customerName: o.renterId?.fullName || o.shippingAddress?.recipientName || "Khách thuê",
      amount: o.rentalFee,
      depositAmount: o.depositAmount,
      totalPaid: o.totalAmount,
      status: o.status,
      completedAt: o.updatedAt || o.createdAt,
      items: o.items?.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        pricePerDay: it.pricePerDay,
      })),
    })),
    ...recentThriftOrders.map((o) => ({
      id: o._id,
      orderCode: o.orderCode,
      type: "THRIFT",
      serviceType: "Bán đứt thanh lý",
      customerName: o.buyerId?.fullName || o.shippingAddress?.recipientName || "Người mua",
      amount: o.itemsTotal,
      depositAmount: 0,
      totalPaid: o.totalAmount,
      status: o.status,
      completedAt: o.updatedAt || o.createdAt,
      items: o.items?.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        price: it.price,
      })),
    })),
  ].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  return {
    summary: {
      totalRevenue,
      rentRevenue,
      thriftRevenue,
      rentRevenuePercent: totalRevenue > 0 ? Number(((rentRevenue / totalRevenue) * 100).toFixed(1)) : 0,
      thriftRevenuePercent: totalRevenue > 0 ? Number(((thriftRevenue / totalRevenue) * 100).toFixed(1)) : 0,
      totalCompletedOrders,
      completedRentOrdersCount,
      completedThriftOrdersCount,
      avgRentOrderValue,
      avgThriftOrderValue,
      walletBalance: shopUser?.walletBalance || 0,
    },
    timelineBreakdown,
    topProducts: {
      rent: topRentProducts.map((p) => ({
        id: p._id,
        name: p.name,
        imageUrl: p.imageUrl,
        totalRevenue: p.totalRevenue,
        rentalTimes: p.rentalTimes,
      })),
      thrift: topThriftProducts.map((p) => ({
        id: p._id,
        name: p.name,
        imageUrl: p.imageUrl,
        totalRevenue: p.totalRevenue,
        soldCount: p.soldCount,
      })),
    },
    recentTransactions: transactions.slice(0, 15),
  };
};
