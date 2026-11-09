import { successResponse } from "../../utils/response.js";
import {
  createGroupCheckout,
  getOrderGroupById,
  getUserOrderGroups,
} from "./orderGroup.service.js";

/**
 * POST /api/orders/group-checkout
 */
export const groupCheckoutController = async (req, res, next) => {
  try {
    const ipAddress =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "127.0.0.1";

    const host = String(req.headers.host || "");
    const isRemoteHost =
      Boolean(host) && !host.includes("localhost") && !host.includes("127.0.0.1");
    const originHeader = String(req.headers.origin || "").trim().replace(/\/$/, "");
    let returnUrl = req.body.returnUrl ? String(req.body.returnUrl).trim() : "";
    if (!returnUrl || (isRemoteHost && (returnUrl.includes("localhost") || returnUrl.includes("127.0.0.1")))) {
      if (originHeader && !(isRemoteHost && (originHeader.includes("localhost") || originHeader.includes("127.0.0.1")))) {
        returnUrl = `${originHeader}/payment-return`;
      } else if (isRemoteHost) {
        returnUrl = "https://sdn-302-g4-fe.vercel.app/payment-return";
      }
    }

    const result = await createGroupCheckout({
      user: req.user,
      shippingAddress: req.body.shippingAddress,
      paymentMethod: req.body.paymentMethod || "VNPAY",
      rentDates: req.body.rentDates || {},
      selectedRentItemIds: req.body.selectedRentItemIds,
      selectedThriftItemIds: req.body.selectedThriftItemIds,
      note: req.body.note,
      ipAddress,
      returnUrl,
    });

    return successResponse(
      res,
      "Tạo đơn hàng tổ hợp thành công",
      result,
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/group/:id
 */
export const getOrderGroupByIdController = async (req, res, next) => {
  try {
    const group = await getOrderGroupById(req.params.id, req.user);
    return successResponse(res, "Lấy thông tin đơn hàng tổng thành công", group);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/group
 */
export const getUserOrderGroupsController = async (req, res, next) => {
  try {
    const result = await getUserOrderGroups(req.user._id, req.query);
    return successResponse(res, "Lấy danh sách đơn hàng tổng thành công", result);
  } catch (error) {
    next(error);
  }
};

