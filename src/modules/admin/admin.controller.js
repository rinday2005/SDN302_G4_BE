import { successResponse } from "../../utils/response.js";
import {
  getPendingListingsService,
  getAllListingsService,
  reviewListingStatusService,
  getDisputesService,
  getDisputeByIdService,
  resolveDisputeService,
  getFinancialReportService,
} from "./admin.service.js";

/**
 * GET /api/admin/listings/pending
 * Lấy danh sách listings RENT & THRIFT đang chờ duyệt
 */
export const getPendingListingsController = async (req, res, next) => {
  try {
    const result = await getPendingListingsService(req.query);
    return successResponse(res, "Lấy danh sách listing chờ duyệt thành công", result, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/listings
 * Lấy danh sách toàn bộ listings (hỗ trợ filter status, type)
 */
export const getAllListingsController = async (req, res, next) => {
  try {
    const result = await getAllListingsService(req.query);
    return successResponse(res, "Lấy danh sách listing thành công", result, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/listings/:id/status hoặc /api/admin/listings/:type/:id/status
 * Duyệt hoặc từ chối listing
 */
export const reviewListingController = async (req, res, next) => {
  try {
    const type = req.params.type || req.body.type || "rent";
    const { id } = req.params;
    const result = await reviewListingStatusService(type, id, req.body, req.user);
    const action = req.body.status === "APPROVED" ? "phê duyệt" : "từ chối";
    return successResponse(res, `Đã ${action} listing thành công`, result, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/rent/listings/:id/status
 */
export const reviewRentListingController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await reviewListingStatusService("rent", id, req.body, req.user);
    const action = req.body.status === "APPROVED" ? "phê duyệt" : "từ chối";
    return successResponse(res, `Đã ${action} sản phẩm RENT thành công`, result, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/thrift/listings/:id/status
 */
export const reviewThriftListingController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await reviewListingStatusService("thrift", id, req.body, req.user);
    const action = req.body.status === "APPROVED" ? "phê duyệt" : "từ chối";
    return successResponse(res, `Đã ${action} mục đăng THRIFT thành công`, result, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/disputes
 * Lấy danh sách tranh chấp đơn hàng (RentalOrder & ThriftOrder)
 */
export const getDisputesController = async (req, res, next) => {
  try {
    const result = await getDisputesService(req.query);
    return successResponse(res, "Lấy danh sách tranh chấp thành công", result, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/disputes/:id
 * Lấy chi tiết tranh chấp của một đơn hàng
 */
export const getDisputeByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await getDisputeByIdService(id);
    return successResponse(res, "Lấy chi tiết tranh chấp thành công", result, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/disputes/:id/resolve
 * Admin phân xử và giải quyết tranh chấp (hoàn cọc / bồi thường)
 */
export const resolveDisputeController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await resolveDisputeService(id, req.body, req.user);
    return successResponse(res, "Phân xử và giải quyết tranh chấp thành công", result, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/finance/overview hoặc /api/admin/finance
 * Báo cáo tài chính toàn diện hệ thống và Shop Owner duy nhất
 */
export const getFinanceOverviewController = async (req, res, next) => {
  try {
    const result = await getFinancialReportService();
    return successResponse(res, "Lấy báo cáo tài chính thành công", result, 200);
  } catch (error) {
    next(error);
  }
};
