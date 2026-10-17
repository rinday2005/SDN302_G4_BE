import RentalProduct from "../product/rentalProduct.model.js";
import RentalOrder from "../order/order.model.js";
import RentalAvailability from "./availability.model.js";
import { isDateOverlap } from "./availability.utils.js";

/**
 * Kiểm tra khả dụng lịch thuê
 * @param {string|ObjectId} productId - ID sản phẩm cần thuê
 * @param {Date|string} startDate - Ngày bắt đầu thuê
 * @param {Date|string} endDate - Ngày kết thúc thuê
 * @param {number} requestedQty - Số lượng cần thuê
 */
export const checkRentalAvailability = async (
  productId,
  startDate,
  endDate,
  requestedQty = 1
) => {
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

  // 1. Lấy thông tin sản phẩm để biết tổng tồn kho (totalQuantity)
  const product = await RentalProduct.findById(productId);
  if (!product) {
    const error = new Error("Sản phẩm không tồn tại");
    error.statusCode = 404;
    error.errorCode = "PRODUCT_NOT_FOUND";
    throw error;
  }

  // 2. Tìm tất cả đơn hàng chứa sản phẩm này và đang chiếm giữ tồn kho
  // Loại bỏ các đơn REJECTED, CANCELLED và COMPLETED
  const activeOrders = await RentalOrder.find({
    status: { $nin: ["REJECTED", "CANCELLED", "COMPLETED"] },
    "items.productId": productId,
  });

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

  // 3.1. Tính thêm các khoảng thời gian bị shop owner khóa thủ công (bảo trì/kiểm định)
  const manualBlocks = await RentalAvailability.find({
    productId,
  });
  for (const block of manualBlocks) {
    if (isDateOverlap(reqStart, reqEnd, block.startDate, block.endDate)) {
      totalBookedQty += block.blockedQuantity || 1;
    }
  }

  // 4. Tính tồn kho khả dụng
  const totalStock = product.totalQuantity || product.stockQuantity || 1;
  const availableQty = totalStock - totalBookedQty;

  // 5. Nếu số lượng yêu cầu lớn hơn tồn kho khả dụng -> ném lỗi 409
  if (requestedQty > availableQty) {
    const error = new Error(
      `Sản phẩm không đủ số lượng khả dụng trong khoảng thời gian này (Còn lại: ${Math.max(
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

/**
 * Lấy danh sách các khoảng thời gian đã được đặt hoặc bị khóa của một sản phẩm
 * (Dùng cho Calendar DatePicker phía FE hiển thị disable các ngày đã hết đồ)
 */
export const getProductBookedDates = async (productId) => {
  const product = await RentalProduct.findById(productId);
  if (!product) {
    const error = new Error("Sản phẩm không tồn tại");
    error.statusCode = 404;
    error.errorCode = "PRODUCT_NOT_FOUND";
    throw error;
  }

  const activeOrders = await RentalOrder.find({
    status: { $nin: ["REJECTED", "CANCELLED", "COMPLETED"] },
    "items.productId": productId,
  }).select("orderCode startDate endDate items status");

  const manualBlocks = await RentalAvailability.find({ productId });

  const bookedRanges = activeOrders.map((order) => {
    const targetItem = order.items.find(
      (i) => i.productId.toString() === productId.toString()
    );
    return {
      orderCode: order.orderCode,
      startDate: order.startDate,
      endDate: order.endDate,
      quantity: targetItem?.quantity || 1,
      type: "RENTAL_ORDER",
      status: order.status,
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

  if (product.shopOwnerId.toString() !== user._id.toString() && user.role !== "ADMIN") {
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