import OrderGroup from "../order/orderGroup.model.js";
import mongoose from "mongoose";
import Payment from "./payment.model.js";
import RentalOrder, {
  RENTAL_ORDER_STATUS,
  HOLD_SLOT_DURATION_MINUTES,
  HOLD_SLOT_DURATION_MS,
} from "../rent/order/order.model.js";
import RentalProduct from "../rent/product/product.model.js";
import {
  checkRentalAvailability,
  releaseExpiredOrderHolds,
  createTemporaryHoldSlotsForOrder,
  confirmHoldSlotsForPaidOrder,
} from "../rent/availability/availability.service.js";
import ThriftOrder, { THRIFT_ORDER_STATUS } from "../thrift/order/thriftOrder.model.js";
import { lockAndMarkOrderPaid } from "../thrift/order/thriftOrder.service.js";
import User from "../user/user.model.js";
import { sendSystemNotificationSafe, notifyAdminsSafe } from "../notification/notification.service.js";
import { NOTIFICATION_TYPE } from "../notification/notification.model.js";
import {
  buildVnPayUrl,
  verifyVnPaySignature,
} from "./vnpay.utils.js";
import { calculateShippingFee, normalizeShopBranch } from "../../utils/shipping.js";
import {
  VNPAY_TMN_CODE,
  VNPAY_HASH_SECRET,
  VNPAY_URL,
  VNPAY_RETURN_URL,
} from "../../config/env.js";

const DEFAULT_HASH_SECRET = VNPAY_HASH_SECRET || "REUSE_HUB_VNPAY_SECRET_2026";
const DEFAULT_TMN_CODE = VNPAY_TMN_CODE || "REUSEHUB";
const DEFAULT_VNP_URL = VNPAY_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const defaultBackendBaseUrl = (
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.RENDER || process.env.NODE_ENV === "production"
    ? "https://sdn302-g4-be.onrender.com"
    : "http://localhost:5000")
).replace(/\/$/, "");
const DEFAULT_RETURN_URL = VNPAY_RETURN_URL || `${defaultBackendBaseUrl}/api/payments/vnpay-return`;

const createError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

/**
 * [BE-S3-04] Tạo URL thanh toán VNPay Sandbox (hỗ trợ cả đơn DB lẫn đơn tĩnh, RENT và THRIFT)
 */
const createVnPayPaymentUrl = async ({
  user,
  orderId,
  amount,
  orderCode,
  type = "RENT",
  ipAddress = "127.0.0.1",
  returnUrl,
  bankCode,
  productId,
  items,
  shippingAddress,
  startDate,
  endDate,
  rentalFee,
  depositAmount,
  shippingFee,
}) => {
  let order = null;
  let payAmount = amount ? Number(amount) : null;
  let code = orderCode || `RH_${Date.now().toString().slice(-6)}`;
  let isThrift = type === "THRIFT";

  // Check KYC status for RENT payments
  if (!isThrift && user && user.kycStatus !== "APPROVED") {
    throw createError("Tài khoản cần được duyệt KYC trước khi tạo giao dịch thuê", 403, "KYC_NOT_APPROVED");
  }

  // 1. Nếu có orderId hợp lệ, thử tìm trong RentalOrder hoặc ThriftOrder
  if (orderId && typeof orderId === "string" && mongoose.Types.ObjectId.isValid(orderId)) {
    if (isThrift) {
      order = await ThriftOrder.findById(orderId);
      if (!order) order = await RentalOrder.findById(orderId);
    } else {
      order = await RentalOrder.findById(orderId);
      if (!order) {
        order = await ThriftOrder.findById(orderId);
        if (order) isThrift = true;
      }
    }
  }

  // Nếu chưa tìm thấy bằng orderId, thử tìm bằng orderCode nếu có
  if (!order && orderCode) {
    if (isThrift) {
      order = await ThriftOrder.findOne({ orderCode });
      if (!order) order = await RentalOrder.findOne({ orderCode });
    } else {
      order = await RentalOrder.findOne({ orderCode });
      if (!order) {
        order = await ThriftOrder.findOne({ orderCode });
        if (order) isThrift = true;
      }
    }
  }

  // 2. Nếu tìm thấy đơn hàng trong DB -> dùng thông tin từ DB
  if (order) {
    const buyerId = order.renterId || order.buyerId || order.userId;
    if (buyerId && buyerId.toString() !== user._id.toString()) {
      throw createError("Bạn không có quyền thanh toán đơn hàng này", 403, "FORBIDDEN");
    }
    if (!isThrift && !(order.items && order.items[0]?.listingId)) {
      const now = new Date();
      let hasUpdates = false;
      const datesChanged =
        (startDate && new Date(startDate).getTime() !== new Date(order.startDate).getTime()) ||
        (endDate && new Date(endDate).getTime() !== new Date(order.endDate).getTime());

      if (startDate) { order.startDate = new Date(startDate); hasUpdates = true; }
      if (endDate) { order.endDate = new Date(endDate); hasUpdates = true; }

      // (a) Xác minh trạng thái đơn hàng có hợp lệ để thanh toán hay không (WAITING_PAYMENT / APPROVED)
      if (
        order.status === RENTAL_ORDER_STATUS.CANCELLED ||
        order.status === RENTAL_ORDER_STATUS.REJECTED
      ) {
        throw createError(
          `Đơn thuê ${order.orderCode} đã bị hủy hoặc từ chối (${order.status}), không thể thanh toán.`,
          400,
          "ORDER_NOT_PAYABLE"
        );
      }

      // (b) Kiểm tra thời gian Hold giữ chỗ 15 phút (Expiry Check):
      //     - Nếu đơn ĐANG ở WAITING_PAYMENT / APPROVED và CHƯA hết hạn holdExpiresAt (và khách không đổi ngày):
      //       => Slot lịch đã được Lock riêng cho chính đơn này từ bước Shop duyệt -> KHÔNG chạy check trùng lịch chung chung nữa!
      //     - Nếu thời gian giữ chỗ 15 phút đã quá hạn (hoặc khách đổi ngày trên trang checkout):
      //       => Chạy checkRentalAvailability bắt buộc loại trừ chính đơn hiện tại ({ excludeOrderId: order._id }).
      const isHoldStillValid =
        (order.status === RENTAL_ORDER_STATUS.WAITING_PAYMENT ||
          order.status === RENTAL_ORDER_STATUS.APPROVED) &&
        (!order.holdExpiresAt || new Date(order.holdExpiresAt) > now);

      if (!isHoldStillValid || datesChanged) {
        await releaseExpiredOrderHolds();

        // Nếu bắt buộc phải query DB check lịch tại API Checkout (do hết hạn Hold hoặc đổi ngày):
        // BẮT BUỘC loại trừ _id của đơn hàng hiện tại: { _id: { $ne: order._id } }
        for (const item of order.items || []) {
          const pid = item.productId?._id || item.productId;
          if (pid && mongoose.Types.ObjectId.isValid(pid)) {
            await checkRentalAvailability(pid, order.startDate, order.endDate, item.quantity || 1, {
              excludeOrderId: order._id,
            });
          }
        }
      }

      // (c) Làm mới / gia hạn Temporary Hold Slot 15 phút cho phiên thanh toán VNPay
      order.status = RENTAL_ORDER_STATUS.WAITING_PAYMENT;
      if (order.paymentStatus === "EXPIRED") {
        order.paymentStatus = "PENDING";
      }
      order.holdExpiresAt = new Date(now.getTime() + HOLD_SLOT_DURATION_MS);
      hasUpdates = true;
      await createTemporaryHoldSlotsForOrder(order, order.holdExpiresAt);

      if (shippingAddress && shippingAddress.province) {
        order.shippingAddress = {
          recipientName: shippingAddress.recipientName || order.shippingAddress?.recipientName || user.fullName || "Khách hàng",
          recipientPhone: shippingAddress.recipientPhone || order.shippingAddress?.recipientPhone || user.phoneNumber || "0900000000",
          province: shippingAddress.province || order.shippingAddress?.province || "Đà Nẵng",
          district: shippingAddress.district || order.shippingAddress?.district || "Quận Hải Châu",
          ward: shippingAddress.ward || order.shippingAddress?.ward || "Phường Hải Châu 1",
          detail: shippingAddress.detail || order.shippingAddress?.detail || "Địa chỉ mặc định",
        };
        hasUpdates = true;
      }
      if (rentalFee && Number(rentalFee) > 0) { order.rentalFee = Number(rentalFee); hasUpdates = true; }
      if (depositAmount && Number(depositAmount) > 0) { order.depositAmount = Number(depositAmount); hasUpdates = true; }
      if (shippingFee && Number(shippingFee) > 0) {
        order.shippingFee = Number(shippingFee);
        hasUpdates = true;
      } else {
        const firstPid = order.items?.[0]?.productId;
        const pDoc = firstPid && mongoose.Types.ObjectId.isValid(firstPid) ? await RentalProduct.findById(firstPid).select("location").lean() : null;
        const branch = normalizeShopBranch(pDoc?.location || order.items?.[0]?.location || "Đà Nẵng");
        const custProv = order.shippingAddress?.province || order.shippingAddress?.detail || "Đà Nẵng";
        try { order.shippingFee = calculateShippingFee(branch, custProv); } catch { order.shippingFee = 35000; }
        hasUpdates = true;
      }
      const computedTotal = (Number(order.rentalFee) || 0) + (Number(order.depositAmount) || 0) + (Number(order.shippingFee) || 0);
      if (computedTotal > 0 && order.totalAmount !== computedTotal) {
        order.totalAmount = computedTotal;
        hasUpdates = true;
      }
      if (hasUpdates) {
        await order.save();
      }
    }
    payAmount = order.totalAmount;
    code = order.orderCode;
    if (order.items && order.items[0]?.listingId) {
      isThrift = true;
      type = "THRIFT";
    }
  } else {
    // 3. Nếu chưa có đơn trong DB (data tĩnh từ FE) -> Tự tạo 1 RentalOrder tạm hợp lệ trong MongoDB gắn với user đang đăng nhập
    payAmount = payAmount || 1500000;

    // Tìm Shop Owner có sẵn trong DB hoặc fallback tạo
    let shopOwner = await User.findOne({ role: "SHOP_OWNER" });
    if (!shopOwner) {
      shopOwner = await User.create({
        email: `shop_${Date.now()}@reuse.vn`,
        passwordHash: "dummyPasswordHash123",
        fullName: "ReUse Official Shop",
        phoneNumber: "0901234567",
        role: "SHOP_OWNER",
      });
    }

    const now = new Date();
    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        let resolvedProduct = null;
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      resolvedProduct = await RentalProduct.findById(productId);
    }
    if (!resolvedProduct && Array.isArray(items) && items.length > 0 && items[0]?.productId && mongoose.Types.ObjectId.isValid(items[0].productId)) {
      resolvedProduct = await RentalProduct.findById(items[0].productId);
    }

    const orderItems = resolvedProduct
      ? [
          {
            productId: resolvedProduct._id,
            productName: resolvedProduct.name,
            quantity: 1,
            pricePerDay: resolvedProduct.pricePerDay || payAmount,
            depositAmount: resolvedProduct.depositAmount || 0,
            imageUrl: resolvedProduct.images?.[0] || "",
          },
        ]
      : Array.isArray(items) && items.length > 0
      ? items.map((it) => ({
          productId: it.productId && mongoose.Types.ObjectId.isValid(it.productId) ? it.productId : new mongoose.Types.ObjectId(),
          productName: it.productName || it.title || `Đơn hàng ${type === "THRIFT" ? "Thrift" : "Thuê"} (${code})`,
          quantity: Number(it.quantity) || 1,
          pricePerDay: Number(it.pricePerDay || it.price) || payAmount,
          depositAmount: Number(it.depositAmount || it.deposit) || 0,
          imageUrl: it.imageUrl || it.image || "",
        }))
      : [
          {
            productId: new mongoose.Types.ObjectId(),
            productName: `Đơn hàng ${type === "THRIFT" ? "Thrift" : "Thuê"} (${code})`,
            quantity: 1,
            pricePerDay: payAmount,
            depositAmount: 0,
          },
        ];

    const actualShopOwnerId = (resolvedProduct && resolvedProduct.ownerId) || shopOwner._id;

    order = await RentalOrder.create({
      orderCode: code,
      renterId: user._id,
      shopOwnerId: actualShopOwnerId,
      items: orderItems,
      startDate: startDate ? new Date(startDate) : now,
      endDate: endDate ? new Date(endDate) : nextDay,
      rentalFee: rentalFee ? Number(rentalFee) : payAmount,
      depositAmount: depositAmount ? Number(depositAmount) : 0,
      shippingFee: shippingFee ? Number(shippingFee) : 0,
      totalAmount: payAmount,
      shippingAddress: {
        recipientName: shippingAddress?.recipientName || user.fullName || "Khách hàng",
        recipientPhone: shippingAddress?.recipientPhone || user.phoneNumber || "0988776655",
        province: shippingAddress?.province || user.address?.province || "Hồ Chí Minh",
        district: shippingAddress?.district || user.address?.district || "Quận 1",
        ward: shippingAddress?.ward || user.address?.ward || "Bến Nghé",
        detail: shippingAddress?.detail || user.address?.detail || "Địa chỉ mặc định",
      },
      status: "WAITING_PAYMENT",
      paymentStatus: "PENDING",
    });
  }

  // 4. Sinh mã giao dịch duy nhất cho phiên thanh toán (Timestamp + RandomID, tối đa 34 ký tự, không chứa ký tự đặc biệt)
  const cleanCode = String(code || `RH${Date.now()}`).replace(/[^a-zA-Z0-9]/g, "").slice(-12);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const txnRef = `${cleanCode}_${Date.now().toString().slice(-8)}_${randomSuffix}`.slice(0, 34);
  const description = `Thanh toan don ${type.toLowerCase()} ${cleanCode}`;

  // 5. Lưu payment record trạng thái PENDING
  await Payment.create({
    orderId: order._id,
    orderModel: isThrift ? "ThriftOrder" : "RentalOrder",
    orderType: isThrift ? "THRIFT" : "RENT",
    userId: user._id,
    amount: payAmount,
    status: "PENDING",
    method: "VNPAY",
    txnRef,
    description,
  });

  // 6. Tạo VNPay Payment URL (Sandbox)
  const effectiveReturnUrl = returnUrl || DEFAULT_RETURN_URL;
  const paymentUrl = buildVnPayUrl({
    tmnCode: DEFAULT_TMN_CODE,
    hashSecret: DEFAULT_HASH_SECRET,
    vnpUrl: DEFAULT_VNP_URL,
    returnUrl: effectiveReturnUrl,
    ipAddr: ipAddress,
    amount: payAmount,
    txnRef,
    orderInfo: description,
    bankCode,
  });

  return {
    orderId: order._id,
    orderCode: code,
    totalAmount: payAmount,
    txnRef,
    vnpUrl: paymentUrl,
    paymentUrl,
  };
};

/**
 * [BE-S3-05] Xử lý Webhook IPN từ VNPay (Server-to-Server)
 */
const processVnPayIpn = async (queryParams = {}) => {
  // 1. AC: Xác minh chữ ký VNPay (checksum SHA512)
  const isValidSignature = verifyVnPaySignature(queryParams, DEFAULT_HASH_SECRET);
  if (!isValidSignature) {
    return { RspCode: "97", Message: "Invalid Checksum" };
  }

  const txnRef = queryParams.vnp_TxnRef;
  const vnpAmount = Number(queryParams.vnp_Amount) / 100;
  const responseCode = queryParams.vnp_ResponseCode;
  const transactionStatus = queryParams.vnp_TransactionStatus;

  // 2. Tìm payment record theo txnRef
  let payment = await Payment.findOne({ txnRef });

  // 3. Tìm RentalOrder hoặc ThriftOrder
  let order = null;
  let isThrift = payment?.orderType === "THRIFT";

  if (payment) {
    if (isThrift) {
      order = await ThriftOrder.findById(payment.orderId);
    } else {
      order = await RentalOrder.findById(payment.orderId);
      if (!order) {
        order = await ThriftOrder.findById(payment.orderId);
        if (order) isThrift = true;
      }
    }
  } else {
    // Fallback: tìm qua orderCode trong txnRef
    const orderCode = txnRef?.split("_")[0];
    if (orderCode) {
      order = await RentalOrder.findOne({ orderCode });
      if (!order) {
        order = await ThriftOrder.findOne({ orderCode });
        if (order) isThrift = true;
      }
    }
  }

  if (!order) {
    return { RspCode: "01", Message: "Order not found" };
  }

  // 4. AC: Kiểm tra số tiền
  if (Math.round(order.totalAmount) !== Math.round(vnpAmount)) {
    return { RspCode: "04", Message: "Invalid amount" };
  }

  // 5. AC: Không tạo duplicate payment record / không xử lý đơn đã confirm
  const isAlreadyPaid =
    (payment && payment.status === "PAID") ||
    order.status === "PAID" ||
    order.paymentStatus === "PAID";

  if (isAlreadyPaid) {
    return { RspCode: "02", Message: "Order already confirmed" };
  }

  // 6. Kiểm tra mã phản hồi giao dịch
  const isSuccess = responseCode === "00" && (!transactionStatus || transactionStatus === "00");

  if (isSuccess) {
    if (isThrift) {
      // AC: Khóa Sản phẩm Đã bán (Atomic Lock) cho ThriftOrder
      await lockAndMarkOrderPaid(order._id, {
        transactionNo: queryParams.vnp_TransactionNo || "",
        bankCode: queryParams.vnp_BankCode || "",
      });
    } else {
      // AC: Thanh toán thành công -> cập nhật RentalOrder thành PAID và chốt cố định Hold Slot (expiresAt = null)
      order.status = RENTAL_ORDER_STATUS.PAID;
      order.paymentStatus = "PAID";
      order.holdExpiresAt = null;
      await order.save();
      await confirmHoldSlotsForPaidOrder(order);
    }

    if (payment) {
      payment.status = "PAID";
      payment.transactionNo = queryParams.vnp_TransactionNo || "";
      payment.bankCode = queryParams.vnp_BankCode || "";
      payment.vnpResponse = queryParams;
      payment.paidAt = new Date();
      await payment.save();
    } else {
      await Payment.create({
        orderId: order._id,
        orderModel: isThrift ? "ThriftOrder" : "RentalOrder",
        orderType: isThrift ? "THRIFT" : "RENT",
        userId: order.renterId || order.buyerId || order.userId,
        amount: order.totalAmount,
        status: "PAID",
        method: "VNPAY",
        txnRef,
        transactionNo: queryParams.vnp_TransactionNo || "",
        bankCode: queryParams.vnp_BankCode || "",
        vnpResponse: queryParams,
        paidAt: new Date(),
      });
    }

    // [BE-S6-02] Bắn thông báo thanh toán thành công tới cả 3 role
    const payerId = order.renterId || order.buyerId || order.userId;
    const sellerId = order.shopOwnerId || order.items?.[0]?.sellerId || order.items?.[0]?.ownerId;
    if (payerId) {
      sendSystemNotificationSafe({
        userId: payerId,
        title: "Thanh toán thành công",
        message: `Đơn hàng ${order.orderCode} đã thanh toán thành công qua VNPAY (${(order.totalAmount || 0).toLocaleString("vi-VN")} VND).`,
        type: NOTIFICATION_TYPE.PAYMENT,
        link: isThrift ? `/thrift/orders/${order._id}` : `/rent/orders/${order._id}`,
        metadata: { orderId: order._id, orderCode: order.orderCode, isThrift },
      });
    }
    if (sellerId) {
      sendSystemNotificationSafe({
        userId: sellerId,
        title: "Khách đã thanh toán đơn hàng",
        message: `Đơn hàng ${order.orderCode} đã thanh toán ${Number(order.totalAmount || 0).toLocaleString("vi-VN")} VND qua VNPAY. Vui lòng chuẩn bị gửi hàng.`,
        type: isThrift ? NOTIFICATION_TYPE.THRIFT_ORDER : NOTIFICATION_TYPE.RENTAL_ORDER,
        link: isThrift ? `/shop/thrift/orders/${order.orderCode}` : `/shop/rent/orders/${order.orderCode}`,
        metadata: { orderId: order._id, orderCode: order.orderCode, isThrift },
      });
    }
    notifyAdminsSafe({
      title: "Giao dịch VNPay thành công",
      message: `Đơn hàng ${order.orderCode} đã quyết toán ${Number(order.totalAmount || 0).toLocaleString("vi-VN")} VND qua VNPay.`,
      type: NOTIFICATION_TYPE.PAYMENT,
      link: `/admin/finance`,
      metadata: { orderId: order._id, orderCode: order.orderCode, isThrift },
    });

    return { RspCode: "00", Message: "Confirm Success" };
  } else {
    // Thanh toán thất bại hoặc khách hủy
    order.paymentStatus = "FAILED";
    if (payment) {
      payment.status = "FAILED";
      payment.vnpResponse = queryParams;
      await payment.save();
    }
    await order.save();

    return { RspCode: "00", Message: "Confirm Success" };
  }
};

/**
 * [BE-S3-05] Xử lý Return URL từ VNPay (Browser callback sau thanh toán)
 */
const processVnPayReturn = async (queryParams = {}) => {
  // 1. AC: Xác minh chữ ký
  const isValidSignature = verifyVnPaySignature(queryParams, DEFAULT_HASH_SECRET);
  if (!isValidSignature) {
    return {
      success: false,
      status: "FAILED",
      responseCode: "97",
      message: "Chữ ký VNPay không hợp lệ (Invalid Checksum)",
    };
  }

  const txnRef = queryParams.vnp_TxnRef;
  const vnpAmount = Number(queryParams.vnp_Amount) / 100;
  const responseCode = queryParams.vnp_ResponseCode;
  const transactionStatus = queryParams.vnp_TransactionStatus;

  let payment = await Payment.findOne({ txnRef });
  let order = null;
  let isThrift = payment?.orderType === "THRIFT";

  if (payment) {
    if (isThrift) {
      order = await ThriftOrder.findById(payment.orderId);
    } else {
      order = await RentalOrder.findById(payment.orderId);
      if (!order) {
        order = await ThriftOrder.findById(payment.orderId);
        if (order) isThrift = true;
      }
    }
  } else {
    const orderCode = txnRef?.split("_")[0];
    if (orderCode) {
      order = await RentalOrder.findOne({ orderCode });
      if (!order) {
        order = await ThriftOrder.findOne({ orderCode });
        if (order) isThrift = true;
      }
    }
  }

  if (!order) {
    return {
      success: false,
      status: "FAILED",
      responseCode: "01",
      message: "Không tìm thấy đơn hàng",
    };
  }

  // 2. AC: Kiểm tra số tiền
  if (Math.round(order.totalAmount) !== Math.round(vnpAmount)) {
    return {
      success: false,
      orderId: order._id,
      orderCode: order.orderCode,
      status: "FAILED",
      responseCode: "04",
      message: "Số tiền thanh toán không khớp với đơn hàng",
    };
  }

  const isSuccess = responseCode === "00" && (!transactionStatus || transactionStatus === "00");

  if (isSuccess) {
    if (isThrift) {
      // AC: Khóa Sản phẩm Đã bán (Atomic Lock) cho ThriftOrder
      await lockAndMarkOrderPaid(order._id, {
        transactionNo: queryParams.vnp_TransactionNo || "",
        bankCode: queryParams.vnp_BankCode || "",
      });
    } else {
      // Đảm bảo đơn được cập nhật PAID nếu IPN chưa xử lý kịp
      if (order.status !== RENTAL_ORDER_STATUS.PAID) {
        order.status = RENTAL_ORDER_STATUS.PAID;
        order.paymentStatus = "PAID";
        order.holdExpiresAt = null;
        await order.save();
        await confirmHoldSlotsForPaidOrder(order);

        const payerId = order.renterId || order.buyerId || order.userId;
        if (payerId) {
          sendSystemNotificationSafe({
            userId: payerId,
            title: "Thanh toán đơn thuê thành công",
            message: `Đơn thuê ${order.orderCode} đã thanh toán thành công qua VNPAY (${Number(order.totalAmount || 0).toLocaleString("vi-VN")} VND).`,
            type: NOTIFICATION_TYPE.PAYMENT,
            link: `/rent/orders/${order._id}`,
            metadata: { orderId: order._id, orderCode: order.orderCode },
          });
        }
        if (order.shopOwnerId) {
          sendSystemNotificationSafe({
            userId: order.shopOwnerId,
            title: "Khách đã thanh toán đơn thuê",
            message: `Đơn thuê ${order.orderCode} đã được khách thanh toán ${Number(order.totalAmount || 0).toLocaleString("vi-VN")} VND. Vui lòng chuẩn bị bàn giao đồ.`,
            type: NOTIFICATION_TYPE.RENTAL_ORDER,
            link: `/shop/rent/orders/${order.orderCode}`,
            metadata: { orderId: order._id, orderCode: order.orderCode },
          });
        }
        notifyAdminsSafe({
          title: "Đơn thuê đã quyết toán VNPay",
          message: `Đơn thuê ${order.orderCode} vừa thanh toán ${Number(order.totalAmount || 0).toLocaleString("vi-VN")} VND vào Smart Escrow.`,
          type: NOTIFICATION_TYPE.PAYMENT,
          link: `/admin/finance`,
          metadata: { orderId: order._id, orderCode: order.orderCode },
        });
      }
    }

    if (payment && payment.status !== "PAID") {
      payment.status = "PAID";
      payment.transactionNo = queryParams.vnp_TransactionNo || "";
      payment.bankCode = queryParams.vnp_BankCode || "";
      payment.vnpResponse = queryParams;
      payment.paidAt = new Date();
      await payment.save();
    }

    return {
      success: true,
      orderId: order._id,
      orderCode: order.orderCode,
      totalAmount: order.totalAmount,
      txnRef: txnRef || queryParams.vnp_TxnRef || "",
      transactionNo: queryParams.vnp_TransactionNo || "",
      orderType: isThrift ? "THRIFT" : "RENT",
      status: "PAID",
      message: "Thanh toán thành công",
    };
  } else {
    if (payment && payment.status === "PENDING") {
      payment.status = "FAILED";
      payment.vnpResponse = queryParams;
      await payment.save();
    }
    order.paymentStatus = "FAILED";
    await order.save();

    return {
      success: false,
      orderId: order._id,
      orderCode: order.orderCode,
      totalAmount: order.totalAmount,
      status: "FAILED",
      responseCode,
      message: "Thanh toán không thành công hoặc người dùng đã hủy giao dịch",
    };
  }
};

export {
  createVnPayPaymentUrl,
  processVnPayIpn,
  processVnPayReturn,
};


export const markOrderGroupPaid = async (orderGroup, paymentDetails = {}) => {
  if (!orderGroup) return;
  orderGroup.paymentStatus = "PAID";
  orderGroup.status = "PROCESSING";
  orderGroup.paidAt = new Date();
  orderGroup.transactionNo = paymentDetails.transactionNo || "";
  orderGroup.bankCode = paymentDetails.bankCode || "";
  await orderGroup.save();

  // Process each child order
  for (const child of orderGroup.childOrders || []) {
    try {
      if (child.orderModel === "RentalOrder") {
        const rOrder = await RentalOrder.findById(child.orderId);
        if (rOrder) {
          rOrder.paymentStatus = "PAID";
          rOrder.status = RENTAL_ORDER_STATUS.PAID;
          await rOrder.save();
          // Notify shop owner
          sendSystemNotificationSafe({
            userId: rOrder.shopOwnerId,
            title: "Đơn thuê mới đã thanh toán",
            message: `Khách hàng đã thanh toán đơn thuê ${rOrder.orderCode}. Vui lòng chuẩn bị hàng để giao.`,
            type: NOTIFICATION_TYPE.RENTAL_ORDER,
            link: `/shop/orders`,
            metadata: { orderId: rOrder._id, orderCode: rOrder.orderCode },
          });
        }
      } else if (child.orderModel === "ThriftOrder") {
        await lockAndMarkOrderPaid(child.orderId, paymentDetails);
        const tOrder = await ThriftOrder.findById(child.orderId);
        const sellerId = tOrder?.items?.[0]?.sellerId || tOrder?.shopOwnerId;
        if (sellerId) {
          sendSystemNotificationSafe({
            userId: sellerId,
            title: "Đơn thanh lý mới đã thanh toán",
            message: `Khách hàng đã thanh toán đơn mua ${tOrder.orderCode}. Vui lòng kiểm tra và gửi hàng.`,
            type: NOTIFICATION_TYPE.THRIFT_ORDER,
            link: `/shop/thrift/orders`,
            metadata: { orderId: tOrder._id, orderCode: tOrder.orderCode },
          });
        }
      }
    } catch (err) {
      console.warn("Child order mark paid error:", err.message);
    }
  }

  // Notify customer
  sendSystemNotificationSafe({
    userId: orderGroup.customerId,
    title: "Thanh toán đơn hàng thành công",
    message: `Đơn hàng ${orderGroup.orderCode} gồm ${orderGroup.childOrders.length} đơn con đã được thanh toán thành công!`,
    type: NOTIFICATION_TYPE.PAYMENT,
    link: `/orders`,
    metadata: { orderGroupId: orderGroup._id, orderCode: orderGroup.orderCode },
  });
};
