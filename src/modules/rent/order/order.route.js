import { Router } from "express";
import authMiddleware from "../../../middleware/auth.middleware.js";
import authorize from "../../../middleware/role.middleware.js";
import {
  createOrderController,
  getUserOrdersController,
  getOrderByIdController,
  getAllOrdersController,
  updateOrderStatusController,
  cancelOrderController,
} from "./order.controller.js";
import {
  validateCreateOrder,
  validateUpdateOrderStatus,
} from "./order.validation.js";

const router = Router();

// Tất cả API đơn thuê đều yêu cầu đăng nhập
router.use(authMiddleware);

// Renter tạo đơn thuê (nhiều sản phẩm RENT của cùng 1 Shop Owner)
router.post("/", authorize(["USER"]), validateCreateOrder, createOrderController);

// Renter xem danh sách đơn thuê của mình
router.get("/my-orders", getUserOrdersController);

// Shop Owner xem đơn thuê của shop / Admin xem tất cả
router.get("/shop", authorize(["SHOP_OWNER", "ADMIN"]), getAllOrdersController);

// Xem chi tiết đơn thuê (Renter / Shop Owner của đơn / Admin)
router.get("/:id", getOrderByIdController);

// Cập nhật trạng thái theo vòng đời đơn thuê
router.patch(
  "/:id/status",
  authorize(["SHOP_OWNER", "ADMIN"]),
  validateUpdateOrderStatus,
  updateOrderStatusController
);

// Hủy đơn thuê
router.patch("/:id/cancel", cancelOrderController);

export default router;
