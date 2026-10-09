import RentalProduct from "../product/rentalProduct.model.js";
import RentalOrder from "../order/rentalOrder.model.js";
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
  requestedQty
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
  // AC: Loại bỏ các đơn REJECTED, CANCELLED (và COMPLETED)
  const activeOrders = await RentalOrder.find({
    status: { $nin: ["REJECTED", "CANCELLED", "COMPLETED"] },
    "items.productId": productId,
  });

  // 3. Tính tổng số lượng đang được đặt trong khoảng thời gian bị overlap
  let totalBookedQty = 0;

  for (const order of activeOrders) {
    // Kiểm tra overlap giữa khoảng thời gian khách muốn thuê và thời gian của order cũ
    if (isDateOverlap(reqStart, reqEnd, order.startDate, order.endDate)) {
      // Vì 1 đơn hàng có thể có nhiều items, lọc đúng item của productId này
      for (const item of order.items) {
        if (item.productId.toString() === productId.toString()) {
          totalBookedQty += item.quantity;
        }
      }
    }
  }

  // 4. Tính tồn kho khả dụng
  const availableQty = product.totalQuantity - totalBookedQty;

  // 5. AC: Nếu số lượng yêu cầu lớn hơn tồn kho khả dụng -> ném lỗi 409
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
    totalQuantity: product.totalQuantity,
    bookedQuantity: totalBookedQty,
    availableQuantity: availableQty,
  };
};