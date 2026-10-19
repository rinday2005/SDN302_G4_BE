import {
  checkRentalAvailability,
  getProductBookedDates,
  blockAvailabilityDates,
} from "./availability.service.js";
import { successResponse } from "../../../utils/response.js";

/**
 * Kiểm tra tính sẵn sàng của sản phẩm trong khoảng ngày
 * POST /api/rent/availability/check hoặc GET /api/rent/availability/check
 */
export const checkAvailabilityController = async (req, res, next) => {
  try {
    const data = req.method === "GET" ? req.query : req.body;
    const { productId, startDate, endDate, quantity } = data;

    const result = await checkRentalAvailability(
      productId,
      startDate,
      endDate,
      Number(quantity) || 1
    );

    return successResponse(
      res,
      "Sản phẩm khả dụng trong khoảng thời gian đã chọn",
      result
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy danh sách ngày đã được đặt / bị khóa của sản phẩm (cho lịch DatePicker)
 * GET /api/rent/availability/:productId/booked-dates
 */
export const getProductBookedDatesController = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const result = await getProductBookedDates(productId);

    return successResponse(
      res,
      "Lấy lịch đặt sản phẩm thành công",
      result
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Shop Owner chủ động khóa lịch bảo trì / kiểm định
 * POST /api/rent/availability/block
 */
export const blockDatesController = async (req, res, next) => {
  try {
    const result = await blockAvailabilityDates(req.user, req.body);

    return successResponse(
      res,
      "Khóa lịch bảo trì sản phẩm thành công",
      result,
      201
    );
  } catch (error) {
    next(error);
  }
};
