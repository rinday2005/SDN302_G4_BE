import mongoose from "mongoose";
import RentalProduct from "../product/rentalProduct.model.js";
import RentalOrder, { RENTAL_ORDER_STATUS, HOLD_SLOT_DURATION_MS } from "../order/order.model.js";
import RentalAvailability from "./availability.model.js";
import { isDateOverlap } from "./availability.utils.js";

// Các trạng thái đơn hàng KHÔNG chiếm giữ tồn kho (đã hủy, từ chối, quá hạn thanh toán, đã trả xong)
export const NON_BLOCKING_ORDER_STATUSES = Object.freeze([
  RENTAL_ORDER_STATUS.REJECTED,
  RENTAL_ORDER_STATUS.CANCELLED,
  RENTAL_ORDER_STATUS.EXPIRED,
  RENTAL_ORDER_STATUS.COMPLETED,
]);

// Các trạng thái đơn hàng ĐANG khóa lịch thực sự (Shop đã duyệt giữ chỗ tạm thời hoặc Khách đã thanh toán / đang thuê)
export const LOCKING_ORDER_STATUSES = Object.freeze([
  RENTAL_ORDER_STATUS.WAITING_PAYMENT,
  RENTAL_ORDER_STATUS.APPROVED,
  RENTAL_ORDER_STATUS.PAID,
  RENTAL_ORDER_STATUS.CONFIRMED,
  RENTAL_ORDER_STATUS.PREPARING,
  RENTAL_ORDER_STATUS.READY_FOR_HANDOVER,
  RENTAL_ORDER_STATUS.HANDED_OVER,
  RENTAL_ORDER_STATUS.SHIPPING,
  RENTAL_ORDER_STATUS.DELIVERED,
  RENTAL_ORDER_STATUS.RENTING,
  RENTAL_ORDER_STATUS.RETURN_REQUESTED,
  RENTAL_ORDER_STATUS.RETURNING,
  RENTAL_ORDER_STATUS.RETURNED,
]);

let holdSweepIntervalId = null;

/**
 * Tự động giải phóng (chuyển sang EXPIRED) các đơn hàng ở trạng thái WAITING_PAYMENT / APPROVED
 * nhưng đã quá hạn giữ chỗ (holdExpiresAt < now) mà người thuê chưa thanh toán,
 * đồng thời dọn dẹp các Temporary Hold Slot quá hạn trong RentalAvailability.
 */
export const releaseExpiredOrderHolds = async (productId = null) => {
  const now = new Date();
  const filter = {
    status: { $in: [RENTAL_ORDER_STATUS.WAITING_PAYMENT, RENTAL_ORDER_STATUS.APPROVED] },
    paymentStatus: { $ne: "PAID" },
    holdExpiresAt: { $ne: null, $lt: now },
  };

  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    filter["items.productId"] = productId;
  }

  const expiredOrders = await RentalOrder.find(filter).select("_id").lean();
  if (expiredOrders.length > 0) {
    const expiredOrderIds = expiredOrders.map((o) => o._id);
    await Promise.all([
      RentalOrder.updateMany(
        { _id: { $in: expiredOrderIds } },
        {
          $set: {
            status: RENTAL_ORDER_STATUS.EXPIRED,
            paymentStatus: "EXPIRED",
          },
        }
      ),
      RentalAvailability.deleteMany({
        orderId: { $in: expiredOrderIds },
        status: "HOLD",
      }),
    ]);
  }

  // Dọn dẹp dự phòng các bản ghi HOLD đã quá hạn (bên cạnh MongoDB TTL Index)
  await RentalAvailability.deleteMany({
    status: "HOLD",
    expiresAt: { $ne: null, $lt: now },
  });
};

/**
 * Khởi chạy Background Job định kỳ (mỗi 60 giây) để tự động giải phóng các đơn giữ chỗ quá hạn
 */
export const startHoldSlotCleanupJob = (intervalMs = 60 * 1000) => {
  if (holdSweepIntervalId) return holdSweepIntervalId;
  holdSweepIntervalId = setInterval(() => {
    if (mongoose.connection.readyState === 1) {
      releaseExpiredOrderHolds().catch((err) => {
        console.warn("[HoldSlotCleanupJob] Lỗi khi quét giải phóng slot hết hạn:", err.message);
      });
    }
  }, intervalMs);

  if (typeof holdSweepIntervalId.unref === "function") {
    holdSweepIntervalId.unref();
  }
  return holdSweepIntervalId;
};

/**
 * Tạo hoặc làm mới "Slot Giữ Chỗ Tạm Thời" (Temporary Hold Slot) trong 15 phút cho một đơn hàng
 * khi chuyển sang WAITING_PAYMENT.
 */
export const createTemporaryHoldSlotsForOrder = async (order, holdExpiresAt) => {
  if (!order || !order._id) return;
  const expires = holdExpiresAt || new Date(Date.now() + HOLD_SLOT_DURATION_MS);

  // Xóa các hold slot cũ của chính đơn này trước khi tạo mới
  await RentalAvailability.deleteMany({ orderId: order._id });

  const docs = (order.items || [])
    .map((item) => {
      const pid = item.productId?._id || item.productId;
      if (!pid || !mongoose.Types.ObjectId.isValid(pid)) return null;
      return {
        productId: pid,
        orderId: order._id,
        shopOwnerId: order.shopOwnerId,
        startDate: order.startDate,
        endDate: order.endDate,
        blockedQuantity: item.quantity || 1,
        status: "HOLD",
        reason: "HOLD_SLOT",
        expiresAt: expires,
        notes: `Temporary Hold Slot cho đơn thuê ${order.orderCode}`,
      };
    })
    .filter(Boolean);

  if (docs.length > 0) {
    await RentalAvailability.insertMany(docs);
  }
};

/**
 * Khi đơn hàng đã thanh toán thành công (PAID), chuyển các Temporary Hold Slot thành
 * khóa lịch cố định (BLOCKED, expiresAt = null) suốt kỳ thuê.
 */
export const confirmHoldSlotsForPaidOrder = async (order) => {
  if (!order || !order._id) return;
  const updated = await RentalAvailability.updateMany(
    { orderId: order._id },
    {
      $set: {
        status: "BLOCKED",
        reason: "RESERVED",
        expiresAt: null,
        notes: `Đã thanh toán đơn thuê ${order.orderCode}`,
      },
    }
  );

  // Nếu đơn chưa từng có bản ghi trong RentalAvailability thì tạo mới ở trạng thái BLOCKED
  if (!updated || updated.matchedCount === 0) {
    const docs = (order.items || [])
      .map((item) => {
        const pid = item.productId?._id || item.productId;
        if (!pid || !mongoose.Types.ObjectId.isValid(pid)) return null;
        return {
          productId: pid,
          orderId: order._id,
          shopOwnerId: order.shopOwnerId,
          startDate: order.startDate,
          endDate: order.endDate,
          blockedQuantity: item.quantity || 1,
          status: "BLOCKED",
          reason: "RESERVED",
          expiresAt: null,
          notes: `Đã thanh toán đơn thuê ${order.orderCode}`,
        };
      })
      .filter(Boolean);

    if (docs.length > 0) {
      await RentalAvailability.insertMany(docs);
    }
  }
};

/**
 * Giải phóng ngay lập tức các Hold/Blocked Slot của một đơn khi bị CANCELLED / REJECTED / EXPIRED / COMPLETED
 */
export const releaseOrderAvailabilitySlots = async (orderId) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) return;
  await RentalAvailability.deleteMany({ orderId });
};

/**
 * Kiểm tra khả dụng lịch thuê tại bước ĐẶT ĐƠN / SHOP DUYỆT (Pre-booking Check & Slot Lock)
 * Công thức chuẩn: (startDate1 <= endDate2) AND (endDate1 >= startDate2)
 *
 * @param {string|ObjectId} productId - ID sản phẩm cần thuê
 * @param {Date|string} startDate - Ngày bắt đầu thuê
 * @param {Date|string} endDate - Ngày kết thúc thuê
 * @param {number} requestedQty - Số lượng cần thuê
 * @param {Object} options - Tùy chọn nâng cao: { excludeOrderId, includePending }
 */
export const checkRentalAvailability = async (
  productId,
  startDate,
  endDate,
  requestedQty = 1,
  options = {}
) => {
  const normalizedOptions =
    typeof options === "string" || options instanceof mongoose.Types.ObjectId
      ? { excludeOrderId: options }
      : options || {};

  const { excludeOrderId = null, includePending = false } = normalizedOptions;

  const reqStart = new Date(startDate);
  const reqEnd = new Date(endDate);

  // Validate ngày cơ bản
  if (isNaN(reqStart.getTime()) || isNaN(reqEnd.getTime())) {
    const error = new Error("Ngày thuê không hợp lệ");
    error.statusCode = 400;
    error.errorCode = "INVALID_DATE_FORMAT";
    throw error;
  }

  if (reqStart > reqEnd) {
    const error = new Error("Ngày bắt đầu không được sau ngày kết thúc");
    error.statusCode = 400;
    error.errorCode = "INVALID_DATE_RANGE";
    throw error;
  }

  if (requestedQty <= 0) {
    const error = new Error("Số lượng yêu cầu phải lớn hơn 0");
    error.statusCode = 400;
    error.errorCode = "INVALID_QUANTITY";
    throw error;
  }

  // 0. Giải phóng các đơn giữ chỗ tạm thời đã hết hạn trước khi kiểm tra tồn kho
  await releaseExpiredOrderHolds(productId);

  // 1. Lấy thông tin sản phẩm để biết tổng tồn kho (totalQuantity)
  const product = await RentalProduct.findById(productId);
  if (!product) {
    const error = new Error("Sản phẩm không tồn tại");
    error.statusCode = 404;
    error.errorCode = "PRODUCT_NOT_FOUND";
    throw error;
  }

  // 2. Xây dựng Query MongoDB chuẩn kiểm tra trùng ngày:
  //    (order.startDate <= reqEnd) AND (order.endDate >= reqStart)
  //    Bắt buộc loại trừ chính đơn hàng hiện tại (_id: { $ne: currentOrderId })
  //    và bỏ qua các đơn CANCELLED, REJECTED, EXPIRED, COMPLETED
  const now = new Date();
  const blockingStatuses = includePending
    ? [...LOCKING_ORDER_STATUSES, RENTAL_ORDER_STATUS.PENDING]
    : LOCKING_ORDER_STATUSES;

  const overlapQuery = {
    "items.productId": productId,
    status: {
      $in: blockingStatuses,
      $nin: NON_BLOCKING_ORDER_STATUSES,
    },
    startDate: { $lte: reqEnd },
    endDate: { $gte: reqStart },
    // Chỉ tính các đơn đã thanh toán hoặc đang trong thời gian khóa tạm (chưa hết hạn holdExpiresAt)
    $or: [
      { status: { $nin: [RENTAL_ORDER_STATUS.WAITING_PAYMENT, RENTAL_ORDER_STATUS.APPROVED] } },
      { holdExpiresAt: null },
      { holdExpiresAt: { $gt: now } },
    ],
  };

  if (excludeOrderId) {
    if (mongoose.Types.ObjectId.isValid(excludeOrderId)) {
      overlapQuery._id = { $ne: new mongoose.Types.ObjectId(excludeOrderId) };
    } else {
      const cleanCode = String(excludeOrderId).replace(/^#/, "").trim();
      overlapQuery.orderCode = { $nin: [cleanCode, `#${cleanCode}`] };
    }
  }

  const activeOrders = await RentalOrder.find(overlapQuery);

  // 3. Tính tổng số lượng đang được đặt trong khoảng thời gian bị overlap
  let totalBookedQty = 0;

  for (const order of activeOrders) {
    if (isDateOverlap(reqStart, reqEnd, order.startDate, order.endDate)) {
      for (const item of order.items) {
        if (item.productId.toString() === productId.toString()) {
          totalBookedQty += item.quantity || 1;
        }
      }
    }
  }

  // 3.1. Tính thêm các khoảng thời gian bị shop owner khóa thủ công (bảo trì/kiểm định, orderId = null)
  const manualBlockQuery = {
    productId,
    orderId: null,
    startDate: { $lte: reqEnd },
    endDate: { $gte: reqStart },
  };

  const manualBlocks = await RentalAvailability.find(manualBlockQuery);
  for (const block of manualBlocks) {
    if (isDateOverlap(reqStart, reqEnd, block.startDate, block.endDate)) {
      totalBookedQty += block.blockedQuantity || 1;
    }
  }

  // 4. Tính tồn kho khả dụng
  const totalStock = product.totalQuantity || product.stockQuantity || 1;
  const availableQty = totalStock - totalBookedQty;

  // 5. Nếu số lượng yêu cầu lớn hơn tồn kho khả dụng -> ném lỗi 409 ngay tại bước Đặt / Duyệt
  if (requestedQty > availableQty) {
    const startStr = reqStart.toISOString().slice(0, 10);
    const endStr = reqEnd.toISOString().slice(0, 10);
    const error = new Error(
      `Kỳ thuê bạn chọn (${startStr} -> ${endStr}) của sản phẩm "${product.name}" bị trùng ngày đã có khách đặt trước hoặc đang được giữ chỗ (Còn lại: ${Math.max(
        0,
        availableQty
      )}, Yêu cầu: ${requestedQty})`
    );
    error.statusCode = 409;
    error.errorCode = "INSUFFICIENT_INVENTORY";
    throw error;
  }

  return {
    isAvailable: true,
    productId,
    startDate: reqStart.toISOString(),
    endDate: reqEnd.toISOString(),
    totalQuantity: totalStock,
    bookedQuantity: totalBookedQty,
    availableQuantity: availableQty,
  };
};

// Alias chuẩn theo yêu cầu nghiệp vụ
export const checkItemAvailability = checkRentalAvailability;
export const checkAvailability = checkRentalAvailability;

/**
 * Lấy danh sách các khoảng thời gian đã được đặt hoặc bị khóa của một sản phẩm
 * (Dùng cho Calendar DatePicker phía FE hiển thị disable các ngày đã hết đồ)
 */
export const getProductBookedDates = async (productId, options = {}) => {
  await releaseExpiredOrderHolds(productId);

  const product = await RentalProduct.findById(productId);
  if (!product) {
    const error = new Error("Sản phẩm không tồn tại");
    error.statusCode = 404;
    error.errorCode = "PRODUCT_NOT_FOUND";
    throw error;
  }

  const { excludeOrderId = null } = options || {};
  const now = new Date();

  const orderFilter = {
    status: {
      $in: LOCKING_ORDER_STATUSES,
      $nin: NON_BLOCKING_ORDER_STATUSES,
    },
    "items.productId": productId,
    $or: [
      { status: { $nin: [RENTAL_ORDER_STATUS.WAITING_PAYMENT, RENTAL_ORDER_STATUS.APPROVED] } },
      { holdExpiresAt: null },
      { holdExpiresAt: { $gt: now } },
    ],
  };

  if (excludeOrderId && mongoose.Types.ObjectId.isValid(excludeOrderId)) {
    orderFilter._id = { $ne: new mongoose.Types.ObjectId(excludeOrderId) };
  }

  const activeOrders = await RentalOrder.find(orderFilter).select(
    "_id orderCode renterId startDate endDate items status holdExpiresAt"
  );

  const manualBlocks = await RentalAvailability.find({ productId, orderId: null });

  const bookedRanges = activeOrders.map((order) => {
    const targetItem = order.items.find(
      (i) => i.productId.toString() === productId.toString()
    );
    return {
      orderId: order._id,
      orderCode: order.orderCode,
      renterId: order.renterId,
      startDate: order.startDate,
      endDate: order.endDate,
      quantity: targetItem?.quantity || 1,
      type: "RENTAL_ORDER",
      status: order.status,
      holdExpiresAt: order.holdExpiresAt || null,
    };
  });

  const blockedRanges = manualBlocks.map((block) => ({
    startDate: block.startDate,
    endDate: block.endDate,
    quantity: block.blockedQuantity,
    type: "MAINTENANCE_BLOCK",
    reason: block.reason,
    notes: block.notes,
  }));

  return {
    productId,
    totalQuantity: product.totalQuantity || product.stockQuantity || 1,
    holdDurationMs: HOLD_SLOT_DURATION_MS,
    bookedRanges: [...bookedRanges, ...blockedRanges],
  };
};

/**
 * Shop Owner chủ động khóa ngày bảo trì/kiểm định cho thiết bị
 */
export const blockAvailabilityDates = async (user, data) => {
  const { productId, startDate, endDate, blockedQuantity = 1, reason, notes } = data;

  const product = await RentalProduct.findById(productId);
  if (!product) {
    const error = new Error("Sản phẩm không tồn tại");
    error.statusCode = 404;
    error.errorCode = "PRODUCT_NOT_FOUND";
    throw error;
  }

  const ownerId = product.shopOwnerId || product.ownerId || product.shopId;
  if (ownerId && ownerId.toString() !== user._id.toString() && user.role !== "ADMIN") {
    const error = new Error("Chỉ chủ sở hữu thiết bị mới có quyền khóa lịch bảo dưỡng");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  const block = await RentalAvailability.create({
    productId,
    shopOwnerId: user._id,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    blockedQuantity,
    reason: reason || "MAINTENANCE",
    notes: notes || "",
  });

  return block;
};
