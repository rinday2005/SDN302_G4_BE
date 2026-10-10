import {
  createOrder,
  getUserOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  approveOrder,
  rejectOrder,
  handoverOrder,
  confirmReceivedOrder,
} from "./order.service.js";
import { successResponse } from "../../../utils/response.js";

const createOrderController = async (req, res, next) => {
  try {
    const order = await createOrder({
      user: req.user,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      shippingAddress: req.body.shippingAddress,
    });

    return successResponse(res, "Order created successfully", order, 201);
  } catch (error) {
    next(error);
  }
};

const getUserOrdersController = async (req, res, next) => {
  try {
    const result = await getUserOrders(req.user._id, req.query);

    return successResponse(res, "Orders retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

const getOrderByIdController = async (req, res, next) => {
  try {
    const order = await getOrderById(req.params.id, req.user);

    return successResponse(res, "Order details retrieved successfully", order);
  } catch (error) {
    next(error);
  }
};

const getAllOrdersController = async (req, res, next) => {
  try {
    const result = await getAllOrders(req.user, req.query);

    return successResponse(res, "Shop orders retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

const updateOrderStatusController = async (req, res, next) => {
  try {
    const order = await updateOrderStatus(req.params.id, req.body.status, req.user);

    return successResponse(res, "Order status updated successfully", order);
  } catch (error) {
    next(error);
  }
};

const cancelOrderController = async (req, res, next) => {
  try {
    const order = await cancelOrder(req.params.id, req.user);

    return successResponse(res, "Order cancelled successfully", order);
  } catch (error) {
    next(error);
  }
};

const approveOrderController = async (req, res, next) => {
  try {
    const order = await approveOrder(req.params.id, req.user);

    return successResponse(res, "Order approved successfully. Waiting for payment.", order);
  } catch (error) {
    next(error);
  }
};

const rejectOrderController = async (req, res, next) => {
  try {
    const order = await rejectOrder(req.params.id, req.user, {
      reason: req.body?.reason,
    });

    return successResponse(res, "Order rejected successfully", order);
  } catch (error) {
    next(error);
  }
};

const handoverOrderController = async (req, res, next) => {
  try {
    const order = await handoverOrder(req.params.id, req.user, {
      carrierName: req.body.carrierName,
      trackingCode: req.body.trackingCode,
      status: req.body.status,
    });

    return successResponse(
      res,
      "Order handover information updated successfully",
      order
    );
  } catch (error) {
    next(error);
  }
};

const confirmReceivedOrderController = async (req, res, next) => {
  try {
    const order = await confirmReceivedOrder(req.params.id, req.user);

    return successResponse(
      res,
      "Order confirmed received successfully. Rental period has started.",
      order
    );
  } catch (error) {
    next(error);
  }
};

export {
  createOrderController,
  getUserOrdersController,
  getOrderByIdController,
  getAllOrdersController,
  updateOrderStatusController,
  cancelOrderController,
  approveOrderController,
  rejectOrderController,
  handoverOrderController,
  confirmReceivedOrderController,
};
