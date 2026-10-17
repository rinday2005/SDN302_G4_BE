import { Router } from "express";
import authMiddleware from "../../../middleware/auth.middleware.js";
import authorize from "../../../middleware/role.middleware.js";
import {
  createThriftOrderController,
  getMyThriftOrdersController,
  getThriftOrderByIdController,
  cancelThriftOrderController,
  confirmDeliveredThriftOrderController,
  updateThriftOrderStatusController,
  disputeThriftOrderController,
  reviewThriftOrderController,
} from "./thriftOrder.controller.js";

const router = Router();

// Toàn bộ API đơn mua THRIFT yêu cầu đăng nhập
router.use(authMiddleware);

// Tạo đơn mua THRIFT
router.post("/", createThriftOrderController);

// Khách hàng xem danh sách đơn mua THRIFT của mình
router.get("/my-orders", getMyThriftOrdersController);

// Xem chi tiết đơn mua THRIFT theo ID hoặc OrderCode
router.get("/:id", getThriftOrderByIdController);

// Khách hàng hủy đơn mua
router.post("/:id/cancel", cancelThriftOrderController);
router.patch("/:id/cancel", cancelThriftOrderController);

// Khách hàng xác nhận đã nhận hàng & hoàn tất đối soát 72h
router.post("/:id/confirm-delivered", confirmDeliveredThriftOrderController);

// Cập nhật trạng thái đơn hàng (Shop Owner / Admin)
router.patch("/:id/status", authorize(["SHOP_OWNER", "ADMIN"]), updateThriftOrderStatusController);


// Khách hàng yêu cầu đối soát / khiếu nại đóng băng Escrow
router.post("/:id/dispute", disputeThriftOrderController);

// Khách hàng đánh giá hiện vật & Atelier
router.post("/:id/review", reviewThriftOrderController);

export default router;
