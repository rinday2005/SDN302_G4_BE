import * as thriftOrderService from "./thriftOrder.service.js";
import { successResponse } from "../../../utils/response.js";

export const checkoutThriftOrder = async (req, res, next) => {
  try {
    const order = await thriftOrderService.checkoutThriftOrder({
      user: req.user,
      listingIds: req.body.listingIds,
      shippingAddress: req.body.shippingAddress,
      shippingFee: req.body.shippingFee,
      paymentMethod: req.body.paymentMethod,
      note: req.body.note,
    });

    return successResponse(
      res,
      "Tạo đơn hàng thanh lý thành công",
      order,
      201
    );
  } catch (error) {
    next(error);
  }
};

export const lockAndMarkOrderPaid = async (req, res, next) => {
  try {
    const { id } = req.params;
    const paidOrder = await thriftOrderService.lockAndMarkOrderPaid(id, req.body);

    return successResponse(
      res,
      "Thanh toán đơn hàng thành công, tất cả sản phẩm đã được khóa SOLD",
      paidOrder,
      200
    );
  } catch (error) {
    next(error);
  }
};

export const getMyThriftOrders = async (req, res, next) => {
  try {
    const result = await thriftOrderService.getMyThriftOrders(req.user, req.query);
    return successResponse(
      res,
      "Lấy danh sách đơn hàng THRIFT của bạn thành công",
      result.orders,
      200
    );
  } catch (error) {
    next(error);
  }
};

export const getSellerThriftOrders = async (req, res, next) => {
  try {
    const result = await thriftOrderService.getSellerThriftOrders(req.user, req.query);
    return successResponse(
      res,
      "Lấy danh sách đơn hàng THRIFT của shop thành công",
      result.orders,
      200
    );
  } catch (error) {
    next(error);
  }
};

export const getThriftOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await thriftOrderService.getThriftOrderById(id, req.user);
    return successResponse(res, "Lấy chi tiết đơn hàng THRIFT thành công", order, 200);
  } catch (error) {
    next(error);
  }
};

export const cancelThriftOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cancelledOrder = await thriftOrderService.cancelThriftOrder(
      id,
      req.user,
      req.body?.reason
    );
    return successResponse(res, "Hủy đơn hàng THRIFT thành công", cancelledOrder, 200);
  } catch (error) {
    next(error);
  }
};

export const updateThriftOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updatedOrder = await thriftOrderService.updateThriftOrderStatus(
      id,
      req.user,
      req.body
    );
    return successResponse(
      res,
      "Cập nhật trạng thái đơn hàng THRIFT thành công",
      updatedOrder,
      200
    );
  } catch (error) {
    next(error);
  }
};

export const confirmDeliveredThriftOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await thriftOrderService.confirmDeliveredThriftOrder(id, req.user);
    return successResponse(res, "Xác nhận nhận hàng thành công", order, 200);
  } catch (error) {
    next(error);
  }
};
