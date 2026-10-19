import {
  createReturnRequest,
  getMyReturns,
  getReturnById,
  getReturnByOrderId,
  inspectAndCompleteReturn,
} from "./return.service.js";
import { successResponse } from "../../../utils/response.js";

/**
 * Gửi yêu cầu hoàn trả đồ thuê
 * POST /api/rent/returns
 */
export const createReturnController = async (req, res, next) => {
  try {
    const returnData = {
      orderId: req.body.orderId,
      items: req.body.items,
      evidenceImages: req.body.images || req.body.evidenceImages || [],
      renterNote: req.body.note || req.body.renterNote || "",
      pickupDetails: req.body.pickupDetails,
    };

    // Hỗ trợ upload file từ multipart nếu có
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      returnData.evidenceImages = req.files.map((f) => f.path || f.url || f.filename);
    }

    const result = await createReturnRequest(req.user, returnData);

    return successResponse(
      res,
      "Gửi yêu cầu hoàn trả đơn thuê thành công",
      result,
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Xem danh sách phiếu hoàn trả của Renter hiện tại
 * GET /api/rent/returns/my-returns
 */
export const getMyReturnsController = async (req, res, next) => {
  try {
    const result = await getMyReturns(req.user._id, req.query);

    return successResponse(
      res,
      "Lấy danh sách phiếu hoàn trả thành công",
      result
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy chi tiết phiếu hoàn trả theo ID
 * GET /api/rent/returns/:id
 */
export const getReturnByIdController = async (req, res, next) => {
  try {
    const result = await getReturnById(req.params.id, req.user);

    return successResponse(
      res,
      "Lấy chi tiết phiếu hoàn trả thành công",
      result
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy phiếu hoàn trả theo orderId
 * GET /api/rent/returns/order/:orderId
 */
export const getReturnByOrderIdController = async (req, res, next) => {
  try {
    const result = await getReturnByOrderId(req.params.orderId, req.user);

    return successResponse(
      res,
      "Lấy thông tin hoàn trả theo đơn hàng thành công",
      result
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Shop Owner / Bench Lab thẩm định tình trạng đồ và hoàn tất giải tỏa cọc
 * POST /api/rent/returns/:id/inspect
 */
export const inspectReturnController = async (req, res, next) => {
  try {
    const result = await inspectAndCompleteReturn(
      req.params.id,
      req.user,
      req.body
    );

    return successResponse(
      res,
      "Thẩm định hoàn cọc Bench Lab thành công",
      result
    );
  } catch (error) {
    next(error);
  }
};
