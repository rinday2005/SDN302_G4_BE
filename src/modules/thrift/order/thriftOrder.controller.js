import {
  disputeThriftOrderService,
  reviewThriftOrderService,
  createThriftOrderService,
  getMyThriftOrdersService,
  getThriftOrderByIdService,
  cancelThriftOrderService,
  confirmDeliveredThriftOrderService,
  updateThriftOrderStatusService,
} from "./thriftOrder.service.js";
import { successResponse } from "../../../utils/response.js";

export const createThriftOrderController = async (req, res, next) => {
  try {
    const order = await createThriftOrderService({
      user: req.user,
      items: req.body.items,
      shippingAddress: req.body.shippingAddress,
      note: req.body.note,
      paymentMethod: req.body.paymentMethod || "VNPAY",
    });

    return successResponse(res, "Tạo đơn mua THRIFT thành công", order, 201);
  } catch (error) {
    next(error);
  }
};

export const getMyThriftOrdersController = async (req, res, next) => {
  try {
    const result = await getMyThriftOrdersService(req.user._id, req.query);
    return successResponse(res, "Lấy danh sách đơn mua THRIFT thành công", result);
  } catch (error) {
    next(error);
  }
};

export const getThriftOrderByIdController = async (req, res, next) => {
  try {
    const order = await getThriftOrderByIdService(req.params.id, req.user);
    return successResponse(res, "Lấy chi tiết đơn mua THRIFT thành công", order);
  } catch (error) {
    next(error);
  }
};

export const cancelThriftOrderController = async (req, res, next) => {
  try {
    const order = await cancelThriftOrderService(req.params.id, req.user, req.body.reason);
    return successResponse(res, "Hủy đơn mua THRIFT thành công", order);
  } catch (error) {
    next(error);
  }
};

export const confirmDeliveredThriftOrderController = async (req, res, next) => {
  try {
    const order = await confirmDeliveredThriftOrderService(req.params.id, req.user);
    return successResponse(res, "Xác nhận nghiệm thu & cấp chứng thư số thành công", order);
  } catch (error) {
    next(error);
  }
};

export const updateThriftOrderStatusController = async (req, res, next) => {
  try {
    const order = await updateThriftOrderStatusService(req.params.id, req.user, req.body);
    return successResponse(res, "Cập nhật trạng thái đơn THRIFT thành công", order);
  } catch (error) {
    next(error);
  }
};


export const disputeThriftOrderController = async (req, res, next) => {
  try {
    const order = await disputeThriftOrderService(req.params.id, req.user, req.body);
    return successResponse(res, "Đã tiếp nhận yêu cầu đối soát và tạm dừng giải ngân Escrow", order);
  } catch (error) {
    next(error);
  }
};

export const reviewThriftOrderController = async (req, res, next) => {
  try {
    const order = await reviewThriftOrderService(req.params.id, req.user, req.body);
    return successResponse(res, "Đăng đánh giá hiện vật thành công", order);
  } catch (error) {
    next(error);
  }
};


export default {
  createThriftOrderController,
  getMyThriftOrdersController,
  getThriftOrderByIdController,
  cancelThriftOrderController,
  confirmDeliveredThriftOrderController,
  updateThriftOrderStatusController,
  disputeThriftOrderController,
  reviewThriftOrderController,
};
