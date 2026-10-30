import { successResponse } from "../../utils/response.js";
import {
  getShopProfileService,
  updateShopProfileService,
  getShopRevenueService,
} from "./shop.service.js";

/**
 * GET /api/shop/profile
 * Truy vấn dữ liệu thực tế của Shop từ MongoDB
 */
export const getShopProfileController = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const profile = await getShopProfileService(userId);

    return successResponse(
      res,
      "Lấy thông tin Shop thành công",
      profile
    );
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/shop/profile
 * Nhận dữ liệu cập nhật từ Form, validate dữ liệu và lưu trực tiếp vào Collection User/Shop trong DB
 */
export const updateShopProfileController = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const updatedProfile = await updateShopProfileService(userId, req.body);

    return successResponse(
      res,
      "Cập nhật hồ sơ Shop thành công",
      updatedProfile
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/shop/revenue
 * Tính toán doanh thu thực tế bằng MongoDB Aggregation Pipeline từ Collection RentalOrder & ThriftOrder
 * Điều kiện: Chỉ tính tổng tiền của các giao dịch/đơn hàng có status === 'COMPLETED'
 * Phân tách rõ: Doanh thu Rent và Doanh thu Thrift
 */
export const getShopRevenueController = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const revenueData = await getShopRevenueService(userId, req.query);

    return successResponse(
      res,
      "Thống kê phân tích doanh thu Shop thành công",
      revenueData
    );
  } catch (error) {
    next(error);
  }
};
