import { successResponse } from "../../utils/response.js";
import {
  submitKycApplication,
  reviewKycApplication,
  getKycRecordById,
  getUserKycApplication,
  listKycRecords,
} from "./kyc.service.js";

/**
 * POST /api/kyc/submit
 * User submits KYC application
 */
export const submitKycController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const result = await submitKycApplication(userId, req.body);
    return successResponse(
      res,
      "Gửi hồ sơ KYC thành công. Hồ sơ đang chờ phê duyệt.",
      result,
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/kyc/:id
 * Admin approves or rejects KYC application
 */
export const reviewKycController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const result = await reviewKycApplication(id, { status, rejectionReason });
    const actionText = status === "APPROVED" ? "phê duyệt" : "từ chối";
    return successResponse(
      res,
      `Đã ${actionText} hồ sơ KYC thành công`,
      result,
      200
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/kyc/me or GET /api/kyc/status or GET /api/kyc
 * User gets current KYC status and submitted record
 */
export const getMyKycController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const result = await getUserKycApplication(userId);
    return successResponse(res, "Lấy thông tin KYC thành công", result, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/kyc/:id
 * Admin views single KYC record
 */
export const getAdminKycByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await getKycRecordById(id);
    return successResponse(res, "Lấy chi tiết hồ sơ KYC thành công", result, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/kyc
 * Admin lists all KYC records
 */
export const listAdminKycController = async (req, res, next) => {
  try {
    const result = await listKycRecords(req.query);
    return successResponse(res, "Lấy danh sách hồ sơ KYC thành công", result, 200);
  } catch (error) {
    next(error);
  }
};
