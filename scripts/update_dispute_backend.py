import sys
import re

replacement = """// ============================================================================
// 2. DISPUTE MANAGEMENT (RENTAL ORDER & THRIFT DISPUTES)
// ============================================================================

/**
 * Lấy danh sách tranh chấp đơn hàng (mặc định tập trung vào RentalOrder disputes & Thrift disputes)
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

  const thriftDisputeFilter = {
    $or: [
      { status: "DISPUTED" },
      { disputeStatus: "RESOLVED" },
    ],
  };

  if (status) {
    if (status === "OPEN") {
      rentDisputeFilter.$or = [{ status: "DISPUTED" }, { "dispute.status": "OPEN" }];
      thriftDisputeFilter.$or = [{ status: "DISPUTED" }];
    } else if (status === "RESOLVED") {
      rentDisputeFilter.$or = [{ "dispute.status": "RESOLVED" }];
      thriftDisputeFilter.$or = [{ disputeStatus: "RESOLVED" }];
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
    ThriftOrder.find(thriftDisputeFilter)
      .populate("buyerId", "fullName email phoneNumber")
      .populate("items.sellerId", "fullName email phoneNumber")
      .sort({ updatedAt: -1 }),
    ThriftOrder.countDocuments(thriftDisputeFilter),
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
      escrowLocked: isResolved ? 0 : (order.depositAmount || 0),
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

  const formattedThriftDisputes = thriftDisputes.map((order) => {
    const isResolved = order.disputeStatus === "RESOLVED" || (order.status === "COMPLETED" && Boolean(order.resolution));
    return {
      id: order._id,
      orderCode: order.orderCode || `#THRIFT-${String(order._id).slice(-6).toUpperCase()}`,
      orderType: "THRIFT",
      renter: order.buyerId,
      shopOwner: order.items?.[0]?.sellerId || null,
      items: order.items,
      totalAmount: order.totalAmount,
      depositAmount: 0,
      rentalFee: order.totalAmount,
      escrowLocked: isResolved ? 0 : (order.totalAmount || 0),
      orderStatus: order.status,
      disputeStatus: isResolved ? "RESOLVED" : "OPEN",
      statusText: isResolved ? "Đã giải quyết" : "Yêu cầu đối soát 72h",
      reason:
        order.disputeReason ||
        order.disputeDetail?.reason ||
        order.disputeDetail?.description ||
        "Khách hàng yêu cầu đối soát độc lập trong 72h",
      damageImages: [],
      reportedAt: order.disputeDetail?.disputedAt || order.updatedAt,
      inspectionResult: null,
      resolution: order.resolution || null,
    };
  });

  const allDisputes = [...formattedRentDisputes, ...formattedThriftDisputes];
  const openCount = allDisputes.filter((d) => d.disputeStatus === "OPEN").length;
  const resolvedCount = allDisputes.filter((d) => d.disputeStatus === "RESOLVED").length;
  const lockedEscrowAmount = allDisputes
    .filter((d) => d.disputeStatus === "OPEN")
    .reduce((sum, d) => sum + (Number(d.escrowLocked) || 0), 0);

  return {
    disputes: allDisputes,
    total: allDisputes.length,
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
 * Xem chi tiết tranh chấp của 1 đơn thuê hoặc đơn mua thanh lý
 */
export const getDisputeByIdService = async (orderId) => {
  let order = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await RentalOrder.findById(orderId)
      .populate("renterId", "fullName email phoneNumber avatarUrl address")
      .populate("shopOwnerId", "fullName email phoneNumber address")
      .populate("items.productId", "name images pricePerDay depositAmount condition location");
  }
  if (!order) {
    const clean = String(orderId).trim().replace("#", "").replace("RH-", "").replace("RO-", "");
    order = await RentalOrder.findOne({
      $or: [
        { orderCode: orderId },
        { orderCode: `#${orderId}` },
        { orderCode: `RO-${clean}` },
        { orderCode: `#RO-${clean}` },
        { orderCode: clean },
      ],
    })
      .populate("renterId", "fullName email phoneNumber avatarUrl address")
      .populate("shopOwnerId", "fullName email phoneNumber address")
      .populate("items.productId", "name images pricePerDay depositAmount condition location");
  }

  if (order) {
    return { orderType: "RENT", order };
  }

  // Check if it is a ThriftOrder
  let thriftOrder = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    thriftOrder = await ThriftOrder.findById(orderId)
      .populate("buyerId", "fullName email phoneNumber")
      .populate("items.sellerId", "fullName email phoneNumber");
  }
  if (!thriftOrder) {
    const clean = String(orderId).trim().replace("#", "").replace("THRIFT-", "").replace("TO-", "");
    thriftOrder = await ThriftOrder.findOne({
      $or: [
        { orderCode: orderId },
        { orderCode: `#${orderId}` },
        { orderCode: `TO-${clean}` },
        { orderCode: `#TO-${clean}` },
        { orderCode: clean },
      ],
    })
      .populate("buyerId", "fullName email phoneNumber")
      .populate("items.sellerId", "fullName email phoneNumber");
  }

  if (thriftOrder) {
    return { orderType: "THRIFT", order: thriftOrder };
  }

  throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
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
  let order = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await RentalOrder.findById(orderId);
  }
  if (!order) {
    const clean = String(orderId).trim().replace("#", "").replace("RH-", "").replace("RO-", "");
    order = await RentalOrder.findOne({
      $or: [
        { orderCode: orderId },
        { orderCode: `#${orderId}` },
        { orderCode: `RO-${clean}` },
        { orderCode: `#RO-${clean}` },
        { orderCode: clean },
      ],
    });
  }

  if (order) {
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

    // AC: Tổng tiền giải quyết không được vượt quá số tiền cọc đang bị giữ (nếu có cọc)
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
    order.dispute.resolvedBy = adminUser?._id;

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
      orderType: "RENT",
      status: order.status,
      dispute: order.dispute,
      walletUpdates: {
        renterRefund: refundAmt,
        renterWalletBalance,
        shopPayout: payoutAmt,
        shopWalletBalance,
      },
    };
  }

  // Nếu không phải RentalOrder, kiểm tra ThriftOrder
  let thriftOrder = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    thriftOrder = await ThriftOrder.findById(orderId);
  }
  if (!thriftOrder) {
    const clean = String(orderId).trim().replace("#", "").replace("THRIFT-", "").replace("TO-", "");
    thriftOrder = await ThriftOrder.findOne({
      $or: [
        { orderCode: orderId },
        { orderCode: `#${orderId}` },
        { orderCode: `TO-${clean}` },
        { orderCode: `#TO-${clean}` },
        { orderCode: clean },
      ],
    });
  }

  if (thriftOrder) {
    const totalOrderAmount = Number(thriftOrder.totalAmount) || 0;
    let refundAmt = Math.max(0, Number(refundToRenter) || 0);
    let payoutAmt = Math.max(0, Number(payoutToShop) || 0);

    if (refundPercent !== undefined && refundPercent !== null) {
      refundAmt = Math.round((Math.max(0, Math.min(100, Number(refundPercent))) / 100) * totalOrderAmount);
    }
    if (payoutPercent !== undefined && payoutPercent !== null) {
      payoutAmt = Math.round((Math.max(0, Math.min(100, Number(payoutPercent))) / 100) * totalOrderAmount);
    }

    thriftOrder.status = "COMPLETED";
    thriftOrder.disputeStatus = "RESOLVED";
    thriftOrder.resolution = resolution || "Admin giải quyết đối soát tranh chấp Thrift";
    await thriftOrder.save();

    let buyerWallet = null;
    let sellerWallet = null;

    if (thriftOrder.buyerId && refundAmt > 0) {
      const buyer = await User.findById(thriftOrder.buyerId);
      if (buyer) {
        buyer.walletBalance = (Number(buyer.walletBalance) || 0) + refundAmt;
        await buyer.save();
        buyerWallet = buyer.walletBalance;
      }
    }

    const sellerId = thriftOrder.items?.[0]?.sellerId;
    if (sellerId && payoutAmt > 0) {
      const seller = await User.findById(sellerId);
      if (seller) {
        seller.walletBalance = (Number(seller.walletBalance) || 0) + payoutAmt;
        await seller.save();
        sellerWallet = seller.walletBalance;
      }
    }

    return {
      orderId: thriftOrder._id,
      orderCode: thriftOrder.orderCode,
      orderType: "THRIFT",
      status: thriftOrder.status,
      walletUpdates: {
        renterRefund: refundAmt,
        renterWalletBalance: buyerWallet,
        shopPayout: payoutAmt,
        shopWalletBalance: sellerWallet,
      },
    };
  }

  throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
};

/**
 * Renter hoặc Shop Owner khởi tạo tranh chấp trên RentalOrder
 */
export const createRentalOrderDisputeService = async (orderId, user, { reason = "", damageImages = [] }) => {
  let order = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await RentalOrder.findById(orderId);
  }
  if (!order) {
    const clean = String(orderId).trim().replace("#", "").replace("RH-", "").replace("RO-", "");
    order = await RentalOrder.findOne({
      $or: [
        { orderCode: orderId },
        { orderCode: `#${orderId}` },
        { orderCode: `RO-${clean}` },
        { orderCode: `#RO-${clean}` },
        { orderCode: clean },
      ],
    });
  }

  if (!order) {
    throw createError("Đơn hàng không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  // Chỉ chính chủ Renter, Shop Owner của đơn hoặc Admin mới được tạo dispute
  const isRenter = order.renterId?.toString() === user._id.toString();
  const isShopOwner = order.shopOwnerId?.toString() === user._id.toString();
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

"""

path = r"c:\SDN302_G4_BE\src\modules\admin\admin.service.js"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

start_idx = None
end_idx = None
for idx, line in enumerate(lines):
    if "// 2. DISPUTE MANAGEMENT" in line:
        start_idx = idx
    if "// 3. FINANCIAL REPORTING" in line:
        end_idx = idx

if start_idx is not None and end_idx is not None:
    new_lines = lines[:start_idx] + [replacement] + lines[end_idx:]
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    print("Successfully updated admin.service.js")
else:
    print(f"Could not find indices: start={start_idx}, end={end_idx}")

