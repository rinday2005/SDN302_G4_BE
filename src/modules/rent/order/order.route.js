import { Router } from "express";
import authMiddleware, { optionalAuthMiddleware } from "../../../middleware/auth.middleware.js";
import authorize from "../../../middleware/role.middleware.js";
import upload from "../../../middleware/upload.middleware.js";
import {
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
  requestReturnOrderController,
  inspectAndRefundOrderController,
  createDisputeOrderController,
} from "./order.controller.js";
import {
  validateCreateOrder,
  validateUpdateOrderStatus,
  validateHandoverOrder,
  validateRequestReturnOrder,
  validateInspectAndRefundOrder,
} from "./order.validation.js";

const router = Router();

// Shop Owner xem đơn thuê của shop / Admin xem tất cả (hỗ trợ cả khi FE gọi trước khi đăng nhập)
router.get("/shop", optionalAuthMiddleware, getAllOrdersController);

// Tất cả API đơn thuê còn lại đều yêu cầu đăng nhập
router.use(authMiddleware);

// Renter tạo đơn thuê (nhiều sản phẩm RENT của cùng 1 Shop Owner)
router.post("/", authorize(["USER"]), validateCreateOrder, createOrderController);

// Renter xem danh sách đơn thuê của mình
router.get("/my-orders", getUserOrdersController);

// Shop Owner phê duyệt đơn thuê -> chuyển sang WAITING_PAYMENT
router.post("/:id/approve", authorize(["SHOP_OWNER"]), approveOrderController);

// Shop Owner từ chối đơn thuê -> chuyển sang REJECTED và giải phóng reservation
router.post("/:id/reject", authorize(["SHOP_OWNER"]), rejectOrderController);

// [BE-S3-06] Shop Owner cập nhật thông tin bàn giao vận chuyển
router.post(
  "/:id/handover",
  authorize(["SHOP_OWNER"]),
  validateHandoverOrder,
  handoverOrderController
);

// [BE-S3-07] Renter xác nhận đã nhận đồ & ký biên bản bàn giao CLA đối kiểm 3 góc
router.post(
  "/:id/confirm-received",
  authorize(["USER", "SHOP_OWNER", "ADMIN"]),
  upload.any(),
  confirmReceivedOrderController
);

// Alias cho việc ký và cập nhật biên bản bàn giao CLA
router.post(
  "/:id/cla-proof",
  authorize(["USER", "SHOP_OWNER", "ADMIN"]),
  upload.any(),
  confirmReceivedOrderController
);

// [BE-S4-01] Renter yêu cầu trả đồ & upload ảnh hiện trạng (chuyển sang RETURN_REQUESTED)
router.post(
  "/:id/request-return",
  authorize(["USER", "SHOP_OWNER", "ADMIN"]),
  upload.array("images", 5),
  validateRequestReturnOrder,
  requestReturnOrderController
);

// [BE-S4-02] Shop Owner kiểm định hư hại & quyết định hoàn cọc -> chuyển COMPLETED
router.post(
  "/:id/inspect-and-refund",
  authorize(["SHOP_OWNER"]),
  upload.any(),
  validateInspectAndRefundOrder,
  inspectAndRefundOrderController
);

// [BE-DISPUTE] Renter / Shop Owner / Admin mở khiếu nại tranh chấp đơn thuê
router.post(
  "/:id/dispute",
  authorize(["USER", "SHOP_OWNER", "ADMIN"]),
  upload.any(),
  createDisputeOrderController
);

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
