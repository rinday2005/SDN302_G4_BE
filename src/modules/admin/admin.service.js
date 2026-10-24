import mongoose from "mongoose";
import RentalProduct from "../rent/product/product.model.js";
import ThriftListing from "../thrift/listing/thriftListing.model.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../rent/order/order.model.js";
import ThriftOrder from "../thrift/order/thriftOrder.model.js";
import User from "../user/user.model.js";
import PlatformConfig from "./platformConfig.model.js";

const createError = (message, statusCode = 400, errorCode = "BAD_REQUEST") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

// ============================================================================
// 1. LISTING MANAGEMENT (RENT & THRIFT)
// ============================================================================

/**
 * Lấy danh sách listings đang chờ duyệt (Pending) cho cả RENT và THRIFT
 */
export const getPendingListingsService = async ({ type = "ALL", page = 1, limit = 20 } = {}) => {
  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const pendingStatusRent = { $in: ["PENDING", "PENDING_APPROVAL"] };
  const pendingStatusThrift = { $in: ["PENDING", "PENDING_APPROVAL"] };

  let rentPromise = Promise.resolve([]);
  let rentCountPromise = Promise.resolve(0);
  let thriftPromise = Promise.resolve([]);
  let thriftCountPromise = Promise.resolve(0);

  if (type === "ALL" || type.toUpperCase() === "RENT") {
    rentPromise = RentalProduct.find({ status: pendingStatusRent })
      .populate("ownerId", "fullName email phoneNumber role")
      .populate("categoryId", "name slug")
      .sort({ createdAt: -1 })
      .skip(type === "RENT" ? skip : 0)
      .limit(type === "RENT" ? numericLimit : numericLimit);

    rentCountPromise = RentalProduct.countDocuments({ status: pendingStatusRent });
  }

  if (type === "ALL" || type.toUpperCase() === "THRIFT") {
    thriftPromise = ThriftListing.find({ status: pendingStatusThrift })
      .populate("ownerId", "fullName email phoneNumber role")
      .populate("categoryId", "name slug")
      .sort({ createdAt: -1 })
      .skip(type === "THRIFT" ? skip : 0)
      .limit(type === "THRIFT" ? numericLimit : numericLimit);

    thriftCountPromise = ThriftListing.countDocuments({ status: pendingStatusThrift });
  }

  const [rentListings, totalRent, thriftListings, totalThrift] = await Promise.all([
    rentPromise,
    rentCountPromise,
    thriftPromise,
    thriftCountPromise,
  ]);

  return {
    type,
    rent: {
      items: rentListings,
      total: totalRent,
    },
    thrift: {
      items: thriftListings,
      total: totalThrift,
    },
    totalPending: totalRent + totalThrift,
    pagination: {
      page: numericPage,
      limit: numericLimit,
    },
  };
};

/**
 * Lấy toàn bộ listings (hỗ trợ lọc theo type và status)
 */
export const getAllListingsService = async ({ type = "ALL", status, page = 1, limit = 20 } = {}) => {
  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const rentFilter = {};
  const thriftFilter = {};

  if (status) {
    if (status === "PENDING") {
      rentFilter.status = { $in: ["PENDING", "PENDING_APPROVAL"] };
      thriftFilter.status = { $in: ["PENDING", "PENDING_APPROVAL"] };
    } else {
      rentFilter.status = status;
      thriftFilter.status = status;
    }
  }

  let rentItems = [];
  let rentTotal = 0;
  let thriftItems = [];
  let thriftTotal = 0;

  if (type === "ALL" || type.toUpperCase() === "RENT") {
    [rentItems, rentTotal] = await Promise.all([
      RentalProduct.find(rentFilter)
        .populate("ownerId", "fullName email phoneNumber role")
        .populate("categoryId", "name slug")
        .sort({ createdAt: -1 })
        .skip(type === "RENT" ? skip : 0)
        .limit(numericLimit),
      RentalProduct.countDocuments(rentFilter),
    ]);
  }

  if (type === "ALL" || type.toUpperCase() === "THRIFT") {
    [thriftItems, thriftTotal] = await Promise.all([
      ThriftListing.find(thriftFilter)
        .populate("ownerId", "fullName email phoneNumber role")
        .populate("categoryId", "name slug")
        .sort({ createdAt: -1 })
        .skip(type === "THRIFT" ? skip : 0)
        .limit(numericLimit),
      ThriftListing.countDocuments(thriftFilter),
    ]);
  }

  return {
    type,
    rent: { items: rentItems, total: rentTotal },
    thrift: { items: thriftItems, total: thriftTotal },
    total: rentTotal + thriftTotal,
    pagination: {
      page: numericPage,
      limit: numericLimit,
    },
  };
};

/**
 * Duyệt hoặc từ chối listing (RENT hoặc THRIFT)
 */
export const reviewListingStatusService = async (type, id, { status, rejectionReason }, adminUser) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("ID listing không hợp lệ", 400, "INVALID_ID");
  }

  const normalizedType = String(type || "").toLowerCase();

  if (normalizedType === "rent") {
    const product = await RentalProduct.findById(id);
    if (!product) {
      throw createError("Sản phẩm RENT không tồn tại", 404, "RENTAL_PRODUCT_NOT_FOUND");
    }

    product.status = status;
    if (status === "REJECTED") {
      product.rejectionReason = String(rejectionReason || "").trim();
      product.reason = product.rejectionReason;
    } else {
      product.rejectionReason = "";
      product.reason = "";
    }

    await product.save();
    return { type: "RENT", item: product };
  } else if (normalizedType === "thrift") {
    const listing = await ThriftListing.findById(id);
    if (!listing) {
      throw createError("Mục đăng THRIFT không tồn tại", 404, "THRIFT_LISTING_NOT_FOUND");
    }

    listing.status = status;
    if (status === "APPROVED") {
      listing.approvedBy = adminUser._id;
      listing.approvedAt = new Date();
      listing.rejectionReason = "";
    } else if (status === "REJECTED") {
      listing.rejectionReason = String(rejectionReason || "").trim();
    }

    await listing.save();
    return { type: "THRIFT", item: listing };
  } else {
    // Tự động tìm trong RentalProduct hoặc ThriftListing
    const product = await RentalProduct.findById(id);
    if (product) {
      return reviewListingStatusService("rent", id, { status, rejectionReason }, adminUser);
    }
    const listing = await ThriftListing.findById(id);
    if (listing) {
      return reviewListingStatusService("thrift", id, { status, rejectionReason }, adminUser);
    }
    throw createError("Không tìm thấy listing tương ứng trong hệ thống", 404, "LISTING_NOT_FOUND");
  }
};

// ============================================================================
// 2. DISPUTE MANAGEMENT (RENTAL ORDER & THRIFT DISPUTES)
// ============================================================================

/**
 * Lấy danh sách tranh chấp đơn hàng (mặc định tập trung vào RentalOrder disputes)
 */
export const getDisputesService = async ({ status, page = 1, limit = 20 } = {}) => {
  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const skip = (numericPage - 1) * numericLimit;

  // Lọc các đơn thuê có tranh chấp
  const rentDisputeFilter = {
    $or: [
      { status: "DISPUTED" },
      { "dispute.status": "OPEN" },
      { "dispute.status": "RESOLVED" },
    ],
  };

  if (status) {
    if (status === "OPEN") {
      rentDisputeFilter.$or = [{ status: "DISPUTED" }, { "dispute.status": "OPEN" }];
    } else if (status === "RESOLVED") {
      rentDisputeFilter.$or = [{ "dispute.status": "RESOLVED" }];
    }
  }

  const [rentalDisputes, rentTotal, thriftDisputes, thriftTotal] = await Promise.all([
    RentalOrder.find(rentDisputeFilter)
      .populate("renterId", "fullName email phoneNumber avatarUrl")
      .populate("shopOwnerId", "fullName email phoneNumber")
      .populate("items.productId", "name images pricePerDay depositAmount")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(numericLimit),
    RentalOrder.countDocuments(rentDisputeFilter),
    ThriftOrder.find({ status: "DISPUTED" })
      .populate("buyerId", "fullName email phoneNumber")
      .populate("items.sellerId", "fullName email phoneNumber")
      .sort({ updatedAt: -1 }),
    ThriftOrder.countDocuments({ status: "DISPUTED" }),
  ]);

  // Chuẩn hóa dữ liệu tranh chấp trả về cho Admin
  const formattedRentDisputes = rentalDisputes.map((order) => {
    const isResolved = order.dispute?.status === "RESOLVED";
    return {
      id: order._id,
      orderCode: order.orderCode,
      orderType: "RENT",
      renter: order.renterId,
      shopOwner: order.shopOwnerId,
      items: order.items,
      totalAmount: order.totalAmount,
      depositAmount: order.depositAmount,
      rentalFee: order.rentalFee,
      escrowLocked: order.depositAmount,
      orderStatus: order.status,
      disputeStatus: isResolved ? "RESOLVED" : "OPEN",
      statusText: isResolved ? "Đã giải quyết" : "Đang chờ đối soát Admin",
      reason:
        order.dispute?.reason ||
        order.inspectionResult?.reason ||
        "Tranh chấp hoàn cọc và đối kiểm hư hại thiết bị",
      damageImages: order.dispute?.damageImages || order.inspectionResult?.damageImages || [],
      reportedAt: order.dispute?.reportedAt || order.updatedAt,
      inspectionResult: order.inspectionResult || null,
      resolution: order.dispute?.resolution || null,
      refundToRenter: order.dispute?.refundToRenter || 0,
      payoutToShop: order.dispute?.payoutToShop || 0,
      adminNotes: order.dispute?.adminNotes || "",
      resolvedAt: order.dispute?.resolvedAt || null,
    };
  });

  const formattedThriftDisputes = thriftDisputes.map((order) => ({
    id: order._id,
    orderCode: order.orderCode || `#THRIFT-${String(order._id).slice(-6).toUpperCase()}`,
    orderType: "THRIFT",
    renter: order.buyerId,
    shopOwner: order.items?.[0]?.sellerId || null,
    items: order.items,
    totalAmount: order.totalAmount,
    depositAmount: 0,
    rentalFee: order.totalAmount,
    escrowLocked: order.totalAmount,
    orderStatus: order.status,
    disputeStatus: "OPEN",
    statusText: "Yêu cầu đối soát 72h",
    reason: order.disputeReason || "Khách hàng yêu cầu đối soát độc lập trong 72h",
    damageImages: [],
    reportedAt: order.updatedAt,
    inspectionResult: null,
    resolution: null,
  }));

  const allDisputes = [...formattedRentDisputes, ...formattedThriftDisputes];
  const openCount = allDisputes.filter((d) => d.disputeStatus === "OPEN").length;
  const resolvedCount = allDisputes.filter((d) => d.disputeStatus === "RESOLVED").length;
  const lockedEscrowAmount = allDisputes
    .filter((d) => d.disputeStatus === "OPEN")
    .reduce((sum, d) => sum + (Number(d.escrowLocked) || 0), 0);

  return {
    disputes: allDisputes,
    total: rentTotal + thriftTotal,
    metrics: {
      openCount,
      resolvedCount,
      lockedEscrowAmount,
    },
    pagination: {
      page: numericPage,
      limit: numericLimit,
    },
  };
};

/**
 * Xem chi tiết tranh chấp của 1 đơn thuê
 */
export const getDisputeByIdService = async (orderId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw createError("ID đơn hàng không hợp lệ", 400, "INVALID_ID");
  }

  const order = await RentalOrder.findById(orderId)
    .populate("renterId", "fullName email phoneNumber avatarUrl address")
    .populate("shopOwnerId", "fullName email phoneNumber address")
    .populate("items.productId", "name images pricePerDay depositAmount condition location");

  if (!order) {
    // Check if it is a ThriftOrder
    const thriftOrder = await ThriftOrder.findById(orderId)
      .populate("buyerId", "fullName email phoneNumber")
      .populate("items.sellerId", "fullName email phoneNumber");

    if (thriftOrder) {
      return { orderType: "THRIFT", order: thriftOrder };
    }

    throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  return { orderType: "RENT", order };
};

/**
 * Admin giải quyết tranh chấp (Phân xử tiền cọc / giải phóng Escrow)
 */
export const resolveDisputeService = async (
  orderId,
  {
    resolution,
    refundToRenter = 0,
    payoutToShop = 0,
    refundPercent = null,
    payoutPercent = null,
    adminNotes = "",
  },
  adminUser
) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw createError("ID đơn hàng không hợp lệ", 400, "INVALID_ID");
  }

  const order = await RentalOrder.findById(orderId);
  if (!order) {
    throw createError("Đơn hàng thuê không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  const deposit = Number(order.depositAmount) || 0;

  // Hỗ trợ phân bổ theo tỷ lệ % nếu được truyền vào
  let refundAmt = Math.max(0, Number(refundToRenter) || 0);
  let payoutAmt = Math.max(0, Number(payoutToShop) || 0);

  if (refundPercent !== undefined && refundPercent !== null) {
    refundAmt = Math.round((Math.max(0, Math.min(100, Number(refundPercent))) / 100) * deposit);
  }
  if (payoutPercent !== undefined && payoutPercent !== null) {
    payoutAmt = Math.round((Math.max(0, Math.min(100, Number(payoutPercent))) / 100) * deposit);
  }

  // AC: Tổng tiền giải quyết không được vượt quá số tiền cọc đang bị giữ
  if (refundAmt + payoutAmt > deposit && deposit > 0) {
    throw createError(
      `Tổng tiền hoàn trả (${refundAmt}) và bồi thường (${payoutAmt}) không được vượt quá tiền cọc của đơn (${deposit})`,
      400,
      "DISPUTE_AMOUNT_EXCEEDS_DEPOSIT"
    );
  }

  // Cập nhật thông tin phân xử của Admin
  if (!order.dispute) {
    order.dispute = {};
  }

  order.dispute.status = "RESOLVED";
  order.dispute.resolution = resolution || "Admin phán quyết phân bổ tiền cọc";
  order.dispute.refundToRenter = refundAmt;
  order.dispute.payoutToShop = payoutAmt;
  order.dispute.adminNotes = String(adminNotes || "").trim();
  order.dispute.resolvedAt = new Date();
  order.dispute.resolvedBy = adminUser._id;

  // AC: Cập nhật trạng thái đơn sang COMPLETED
  order.status = RENTAL_ORDER_STATUS.COMPLETED;

  await order.save();

  // AC: Phán quyết tranh chấp tự động kích hoạt cập nhật trạng thái đơn hàng và ví nội bộ
  let renterWalletBalance = null;
  let shopWalletBalance = null;

  if (order.renterId && refundAmt > 0) {
    const renter = await User.findById(order.renterId);
    if (renter) {
      renter.walletBalance = (Number(renter.walletBalance) || 0) + refundAmt;
      await renter.save();
      renterWalletBalance = renter.walletBalance;
    }
  }

  if (order.shopOwnerId && payoutAmt > 0) {
    const shopOwner = await User.findById(order.shopOwnerId);
    if (shopOwner) {
      shopOwner.walletBalance = (Number(shopOwner.walletBalance) || 0) + payoutAmt;
      await shopOwner.save();
      shopWalletBalance = shopOwner.walletBalance;
    }
  }

  return {
    orderId: order._id,
    orderCode: order.orderCode,
    status: order.status,
    dispute: order.dispute,
    walletUpdates: {
      renterRefund: refundAmt,
      renterWalletBalance,
      shopPayout: payoutAmt,
      shopWalletBalance,
    },
  };
};

/**
 * Renter hoặc Shop Owner khởi tạo tranh chấp trên RentalOrder
 */
export const createRentalOrderDisputeService = async (orderId, user, { reason = "", damageImages = [] }) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw createError("ID đơn hàng không hợp lệ", 400, "INVALID_ID");
  }

  const order = await RentalOrder.findById(orderId);
  if (!order) {
    throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  // Chỉ chính chủ Renter, Shop Owner của đơn hoặc Admin mới được tạo dispute
  const isRenter = order.renterId.toString() === user._id.toString();
  const isShopOwner = order.shopOwnerId.toString() === user._id.toString();
  const isAdmin = user.role === "ADMIN";

  if (!isRenter && !isShopOwner && !isAdmin) {
    throw createError("Bạn không có quyền khiếu nại đơn hàng này", 403, "FORBIDDEN");
  }

  order.status = RENTAL_ORDER_STATUS.DISPUTED;
  order.dispute = {
    status: "OPEN",
    reason: String(reason || "Yêu cầu Giám định viên ReUse Hub can thiệp đối soát tranh chấp").trim(),
    damageImages: Array.isArray(damageImages) ? damageImages : [],
    reportedBy: user._id,
    reportedAt: new Date(),
  };

  await order.save();
  return order;
};

// ============================================================================
// 3. FINANCIAL REPORTING (HỆ THỐNG & SHOP OWNER DUY NHẤT)
// ============================================================================

/**
 * Báo cáo tài chính toàn diện hệ thống và Shop Owner duy nhất
 * Dữ liệu phản ánh 100% chính xác từ MongoDB database
 */
export const getFinancialReportService = async () => {
  // 1. Lấy thông tin Shop Owner duy nhất
  const shopOwner = await User.findOne({ role: "SHOP_OWNER" }).select(
    "fullName email phoneNumber address kycStatus createdAt"
  );

  // 2. Lấy toàn bộ đơn thuê và đơn bán thanh lý
  const [allRentalOrders, allThriftOrders, totalProducts, usersCount] = await Promise.all([
    RentalOrder.find({}).lean(),
    ThriftOrder.find({}).lean(),
    RentalProduct.countDocuments({}),
    User.countDocuments({}),
  ]);

  // Các trạng thái đơn thuê đã thanh toán tiền vào hệ thống
  const paidRentalStatuses = [
    "PAID",
    "READY_FOR_HANDOVER",
    "HANDED_OVER",
    "CONFIRMED",
    "PREPARING",
    "SHIPPING",
    "DELIVERED",
    "RENTING",
    "RETURN_REQUESTED",
    "RETURNING",
    "RETURNED",
    "COMPLETED",
    "DISPUTED",
  ];

  // Trạng thái đơn đang giữ tiền cọc tại Smart Escrow
  const escrowHeldStatuses = [
    "PAID",
    "READY_FOR_HANDOVER",
    "HANDED_OVER",
    "CONFIRMED",
    "PREPARING",
    "SHIPPING",
    "DELIVERED",
    "RENTING",
    "RETURN_REQUESTED",
    "RETURNING",
    "RETURNED",
    "DISPUTED",
  ];

  // Tính toán số liệu đơn thuê RENT
  let totalRentalGmv = 0;
  let totalRentalRevenue = 0;
  let totalShippingRevenue = 0;
  let lockedEscrowAmount = 0;
  let totalDepositsRefunded = 0;
  let totalDamagePenalties = 0;

  const rentalStatusCounts = {
    PENDING: 0,
    WAITING_PAYMENT: 0,
    PAID: 0,
    HANDED_OVER: 0,
    RENTING: 0,
    RETURN_REQUESTED: 0,
    RETURNED: 0,
    DISPUTED: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    REJECTED: 0,
  };

  allRentalOrders.forEach((o) => {
    totalRentalGmv += Number(o.totalAmount) || 0;

    if (rentalStatusCounts[o.status] !== undefined) {
      rentalStatusCounts[o.status] += 1;
    }

    if (paidRentalStatuses.includes(o.status)) {
      totalRentalRevenue += Number(o.rentalFee) || 0;
      totalShippingRevenue += Number(o.shippingFee) || 0;
    }

    if (escrowHeldStatuses.includes(o.status)) {
      lockedEscrowAmount += Number(o.depositAmount) || 0;
    }

    if (o.status === "COMPLETED") {
      let penalty = 0;
      if (o.inspectionResult?.damagePenaltyAmount !== undefined && o.inspectionResult?.damagePenaltyAmount !== null) {
        penalty = Number(o.inspectionResult.damagePenaltyAmount) || 0;
      } else if (o.dispute?.payoutToShop !== undefined && o.dispute?.payoutToShop !== null) {
        penalty = Number(o.dispute.payoutToShop) || 0;
      }

      let refund = 0;
      if (o.inspectionResult?.refundAmount !== undefined && o.inspectionResult?.refundAmount !== null) {
        refund = Number(o.inspectionResult.refundAmount) || 0;
      } else if (o.dispute?.refundToRenter !== undefined && o.dispute?.refundToRenter !== null) {
        refund = Number(o.dispute.refundToRenter) || 0;
      } else {
        refund = Math.max(0, (Number(o.depositAmount) || 0) - penalty);
      }

      totalDamagePenalties += isNaN(penalty) ? 0 : penalty;
      totalDepositsRefunded += isNaN(refund) ? 0 : refund;
    }
  });

  // Tính toán số liệu đơn bán thanh lý THRIFT
  let totalThriftSales = 0;
  allThriftOrders.forEach((to) => {
    totalThriftSales += Number(to.totalAmount) || 0;
  });

  const totalPlatformGmv = totalRentalGmv + totalThriftSales;
  const totalPlatformRevenue = totalRentalRevenue + totalShippingRevenue + totalThriftSales;

  // 3. Báo cáo tập trung vào Shop Owner duy nhất
  const shopOwnerId = shopOwner?._id?.toString();
  const shopOrders = allRentalOrders.filter((o) => o.shopOwnerId?.toString() === shopOwnerId);

  let shopRentalEarnings = 0;
  let shopDamageCompensation = 0;
  let shopEscrowHeld = 0;

  shopOrders.forEach((so) => {
    if (paidRentalStatuses.includes(so.status)) {
      shopRentalEarnings += Number(so.rentalFee) || 0;
    }
    if (escrowHeldStatuses.includes(so.status)) {
      shopEscrowHeld += Number(so.depositAmount) || 0;
    }
    if (so.status === "COMPLETED") {
      let penalty = 0;
      if (so.inspectionResult?.damagePenaltyAmount !== undefined && so.inspectionResult?.damagePenaltyAmount !== null) {
        penalty = Number(so.inspectionResult.damagePenaltyAmount) || 0;
      } else if (so.dispute?.payoutToShop !== undefined && so.dispute?.payoutToShop !== null) {
        penalty = Number(so.dispute.payoutToShop) || 0;
      }
      shopDamageCompensation += isNaN(penalty) ? 0 : penalty;
    }
  });

  const shopNetEarnings = shopRentalEarnings + shopDamageCompensation;

  return {
    overview: {
      totalPlatformGmv,
      totalPlatformRevenue,
      totalRentalRevenue,
      totalShippingRevenue,
      totalThriftSales,
      lockedEscrowAmount,
      totalDepositsRefunded,
      totalDamagePenalties,
      totalUsers: usersCount,
      totalRentalProducts: totalProducts,
      totalRentalOrders: allRentalOrders.length,
      totalThriftOrders: allThriftOrders.length,
    },
    singleShopOwner: {
      profile: shopOwner
        ? {
            id: shopOwner._id,
            fullName: shopOwner.fullName,
            email: shopOwner.email,
            phoneNumber: shopOwner.phoneNumber,
            storeName: "ReUse Official Shop",
            address: shopOwner.address,
            kycStatus: shopOwner.kycStatus,
            joinedAt: shopOwner.createdAt,
          }
        : null,
      performance: {
        totalProductsInCatalog: totalProducts,
        totalOrdersReceived: shopOrders.length,
        completedOrders: shopOrders.filter((o) => o.status === "COMPLETED").length,
        activeRentals: shopOrders.filter((o) => o.status === "RENTING").length,
        disputedOrders: shopOrders.filter((o) => o.status === "DISPUTED").length,
        cancelledOrders: shopOrders.filter((o) => o.status === "CANCELLED" || o.status === "REJECTED").length,
        rentalEarnings: shopRentalEarnings,
        damageCompensation: shopDamageCompensation,
        currentEscrowHeld: shopEscrowHeld,
        netRevenue: shopNetEarnings,
      },
    },
    ordersBreakdown: rentalStatusCounts,
  };
};

// ============================================================================
// 4. PLATFORM FEE CONFIGURATION (CẤU HÌNH TỶ LỆ % PHÍ SÀN RENT & THRIFT)
// ============================================================================

/**
 * Lấy cấu hình tỷ lệ % phí sàn hiện tại
 */
export const getPlatformFeeService = async () => {
  let config = await PlatformConfig.findOne().sort({ updatedAt: -1 }).populate("updatedBy", "fullName email");
  if (!config) {
    config = await PlatformConfig.create({
      rentFeePercent: 10,
      thriftFeePercent: 8,
      description: "Cấu hình tỷ lệ % phí sàn mặc định ReUse Hub",
    });
  }

  return {
    rentFeePercent: config.rentFeePercent,
    thriftFeePercent: config.thriftFeePercent,
    description: config.description,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
};

/**
 * Cập nhật tỷ lệ % phí sàn RENT và THRIFT
 */
export const updatePlatformFeeService = async ({ rentFeePercent, thriftFeePercent, description }, adminUser) => {
  if (rentFeePercent !== undefined && rentFeePercent !== null) {
    const num = Number(rentFeePercent);
    if (isNaN(num) || num < 0 || num > 100) {
      throw createError("Tỷ lệ % phí sàn RENT phải là số từ 0 đến 100", 400, "INVALID_RENT_FEE_PERCENT");
    }
  }

  if (thriftFeePercent !== undefined && thriftFeePercent !== null) {
    const num = Number(thriftFeePercent);
    if (isNaN(num) || num < 0 || num > 100) {
      throw createError("Tỷ lệ % phí sàn THRIFT phải là số từ 0 đến 100", 400, "INVALID_THRIFT_FEE_PERCENT");
    }
  }

  let config = await PlatformConfig.findOne().sort({ updatedAt: -1 });
  if (!config) {
    config = new PlatformConfig({
      rentFeePercent: rentFeePercent !== undefined ? Number(rentFeePercent) : 10,
      thriftFeePercent: thriftFeePercent !== undefined ? Number(thriftFeePercent) : 8,
      description: description || "Cấu hình tỷ lệ % phí sàn ReUse Hub",
      updatedBy: adminUser?._id,
    });
  } else {
    if (rentFeePercent !== undefined && rentFeePercent !== null) {
      config.rentFeePercent = Number(rentFeePercent);
    }
    if (thriftFeePercent !== undefined && thriftFeePercent !== null) {
      config.thriftFeePercent = Number(thriftFeePercent);
    }
    if (description) {
      config.description = String(description).trim();
    }
    config.updatedBy = adminUser?._id;
  }

  await config.save();

  return {
    rentFeePercent: config.rentFeePercent,
    thriftFeePercent: config.thriftFeePercent,
    description: config.description,
    updatedAt: config.updatedAt,
    updatedBy: adminUser ? { _id: adminUser._id, fullName: adminUser.fullName, email: adminUser.email } : null,
  };
};
