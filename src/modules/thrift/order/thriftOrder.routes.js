import { Router } from "express";
import authMiddleware from "../../../middleware/auth.middleware.js";
import authorize from "../../../middleware/role.middleware.js";
import {
  checkoutThriftOrder,
  lockAndMarkOrderPaid,
  getMyThriftOrders,
  getSellerThriftOrders,
  getThriftOrderById,
  cancelThriftOrder,
  updateThriftOrderStatus,
  confirmDeliveredThriftOrder,
  disputeThriftOrder,
} from "./thriftOrder.controller.js";
import {
  validateCheckoutThriftOrder,
  validateUpdateThriftOrderStatus,
} from "./thriftOrder.validation.js";

const router = Router();

// Tất cả route thrift orders yêu cầu đăng nhập
router.use(authMiddleware);

// [BE-S4-05] API Đặt mua Đồ THRIFT
router.post("/", validateCheckoutThriftOrder, checkoutThriftOrder);
router.post("/checkout", validateCheckoutThriftOrder, checkoutThriftOrder);

// Xem danh sách đơn của người mua
router.get("/my-orders", getMyThriftOrders);

// Xem danh sách đơn của người bán (Shop Owner)
router.get("/seller-orders", authorize(["SHOP_OWNER", "ADMIN", "USER"]), getSellerThriftOrders);
router.get("/shop", authorize(["SHOP_OWNER", "ADMIN", "USER"]), getSellerThriftOrders);
router.get("/shop-orders", authorize(["SHOP_OWNER", "ADMIN", "USER"]), getSellerThriftOrders);

// Xem chi tiết đơn hàng (Chặn IDOR)
router.get("/:id", getThriftOrderById);

// [BE-S4-05] Khóa Sản phẩm Đã bán (Atomic Lock) & Xác nhận thanh toán thành công
router.post("/:id/pay", lockAndMarkOrderPaid);

// Khách xác nhận đã nhận hàng (Buyer confirms delivery)
router.post("/:id/confirm-delivered", confirmDeliveredThriftOrder);

// Mở khiếu nại tranh chấp đơn hàng THRIFT (Buyer / Seller / Admin)
router.post("/:id/dispute", disputeThriftOrder);

// Hủy đơn hàng
router.post("/:id/cancel", cancelThriftOrder);

// Cập nhật trạng thái xử lý/vận chuyển đơn hàng (Shop Owner / Admin)
router.patch(
  "/:id/status",
  authorize(["SHOP_OWNER", "ADMIN"]),
  validateUpdateThriftOrderStatus,
  updateThriftOrderStatus
);

export default router;
