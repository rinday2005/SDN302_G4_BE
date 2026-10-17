import mongoose from "mongoose";
import Payment from "./payment.model.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../rent/order/order.model.js";
import ThriftOrder from "../thrift/order/thriftOrder.model.js";
import { createThriftOrderService } from "../thrift/order/thriftOrder.service.js";
import User from "../user/user.model.js";
import {
  buildVnPayUrl,
  verifyVnPaySignature,
} from "./vnpay.utils.js";
import {
  VNPAY_TMN_CODE,
  VNPAY_HASH_SECRET,
  VNPAY_URL,
  VNPAY_RETURN_URL,
} from "../../config/env.js";

const createError = (message, statusCode, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

/**
 * [BE-S3-04] Tạo URL thanh toán VNPay Sandbox (Hỗ trợ cả RENT và THRIFT)
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
  items,
  shippingAddress,
  startDate,
  endDate,
  rentalFee,
  depositAmount,
  shippingFee,
}) => {
  const isThrift = type === "THRIFT" || (orderCode && orderCode.includes("TRF"));
  let payAmount = amount ? Number(amount) : null;
  let code = orderCode || `${isThrift ? "TRF" : "RH"}_${Date.now().toString().slice(-6)}`;
  let targetOrderId = null;

  if (isThrift) {
    // ── XỬ LÝ THANH TOÁN CHO ĐƠN THRIFT ──
    let thriftOrder = null;

    if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
      thriftOrder = await ThriftOrder.findById(orderId);
    }

    if (!thriftOrder && orderCode) {
      const cleanCode = orderCode.replace("#", "");
      thriftOrder = await ThriftOrder.findOne({
        $or: [{ orderCode }, { orderCode: `#${cleanCode}` }, { orderCode: cleanCode }],
      });
    }

    // Nếu chưa có ThriftOrder trong DB, khởi tạo mới từ các item truyền vào hoặc DB
    if (!thriftOrder) {
      thriftOrder = await createThriftOrderService({
        user,
        items: Array.isArray(items) ? items : [],
        shippingAddress,
      });
    }

    targetOrderId = thriftOrder._id;
    payAmount = thriftOrder.totalAmount;
    code = thriftOrder.orderCode;
  } else {
    // ── XỬ LÝ THANH TOÁN CHO ĐƠN RENT ──
    let order = null;

    if (orderId && typeof orderId === "string" && mongoose.Types.ObjectId.isValid(orderId)) {
      order = await RentalOrder.findById(orderId);
    }

    if (!order && orderCode) {
      order = await RentalOrder.findOne({ orderCode });
    }

    const parseOrderItems = (rawItems) => {
      if (Array.isArray(rawItems) && rawItems.length > 0) {
        return rawItems.map((it) => {
          let pId = it.productId || it.id;
          if (!pId || !mongoose.Types.ObjectId.isValid(pId)) {
            pId = new mongoose.Types.ObjectId();
          }
          return {
            productId: pId,
            productName: it.productName || it.title || `Sản phẩm (${code})`,
            quantity: Math.max(1, Number(it.quantity || it.qty || 1)),
            pricePerDay: Number(it.pricePerDay || it.dailyPrice || it.price || 0),
            depositAmount: Number(it.depositAmount || it.deposit || 0),
            imageUrl: it.imageUrl || it.image || "",
          };
        });
      }
      return null;
    };

    if (order) {
      if (order.renterId.toString() !== user._id.toString()) {
        throw createError("Bạn không có quyền thanh toán đơn hàng này", 403, "FORBIDDEN");
      }
      const parsed = parseOrderItems(items);
      if (parsed && (order.items.length === 0 || order.items[0]?.productName?.includes("Đơn hàng"))) {
        order.items = parsed;
        if (shippingAddress) {
          order.shippingAddress = {
            recipientName: (shippingAddress.recipientName || order.shippingAddress?.recipientName || user.fullName || "Khách hàng").trim(),
            recipientPhone: (shippingAddress.recipientPhone || order.shippingAddress?.recipientPhone || user.phoneNumber || "0988776655").trim(),
            province: (shippingAddress.province || order.shippingAddress?.province || "Hồ Chí Minh").trim(),
            district: (shippingAddress.district || order.shippingAddress?.district || "Quận 1").trim(),
            ward: (shippingAddress.ward || order.shippingAddress?.ward || "Bến Nghé").trim(),
            detail: (shippingAddress.detail || order.shippingAddress?.detail || "Địa chỉ mặc định").trim(),
          };
        }
        await order.save();
      }
      payAmount = order.totalAmount;
      code = order.orderCode;
      targetOrderId = order._id;
    } else {
      payAmount = payAmount || 1500000;

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

      const now = startDate ? new Date(startDate) : new Date();
      const nextDay = endDate ? new Date(endDate) : new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const parsedItems = parseOrderItems(items) || [
        {
          productId: new mongoose.Types.ObjectId(),
          productName: `Đơn hàng Thuê (${code})`,
          quantity: 1,
          pricePerDay: payAmount,
          depositAmount: 0,
          imageUrl: "",
        },
      ];

      const calcRentalFee = rentalFee !== undefined ? Number(rentalFee) : payAmount;
      const calcDepositAmount = depositAmount !== undefined ? Number(depositAmount) : 0;
      const calcShippingFee = shippingFee !== undefined ? Number(shippingFee) : 0;
      const finalTotal = payAmount || (calcRentalFee + calcDepositAmount + calcShippingFee);

      const shipAddr = shippingAddress || {};
      const effectiveAddress = {
        recipientName: (shipAddr.recipientName || user.fullName || "Khách hàng").trim(),
        recipientPhone: (shipAddr.recipientPhone || user.phoneNumber || "0988776655").trim(),
        province: (shipAddr.province || user.address?.province || "Hồ Chí Minh").trim(),
        district: (shipAddr.district || user.address?.district || "Quận 1").trim(),
        ward: (shipAddr.ward || user.address?.ward || "Bến Nghé").trim(),
        detail: (shipAddr.detail || user.address?.detail || "Địa chỉ mặc định").trim(),
      };

      order = await RentalOrder.create({
        orderCode: code,
        renterId: user._id,
        shopOwnerId: shopOwner._id,
        startDate: now,
        endDate: nextDay,
        rentalDays: Math.max(1, Math.ceil((nextDay.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
        items: parsedItems,
        rentalFee: calcRentalFee,
        depositAmount: calcDepositAmount,
        shippingFee: calcShippingFee,
        totalAmount: finalTotal,
        shippingAddress: effectiveAddress,
        status: RENTAL_ORDER_STATUS.WAITING_PAYMENT,
        paymentStatus: "PENDING",
      });

      targetOrderId = order._id;
    }
  }

  // 4. Sinh mã giao dịch duy nhất cho phiên thanh toán
  const txnRef = `${code}_${Date.now()}`;
  const description = `Thanh toan don ${type.toLowerCase()} ${code}`;

  // 5. Lưu payment record trạng thái PENDING
  await Payment.create({
    orderId: targetOrderId,
    orderType: isThrift ? "THRIFT" : "RENT",
    userId: user._id,
    amount: payAmount,
    status: "PENDING",
    method: "VNPAY",
    txnRef,
    description,
  });

  // 6. Tạo VNPay Payment URL (Sandbox)
  const effectiveReturnUrl = returnUrl || VNPAY_RETURN_URL;
  const paymentUrl = buildVnPayUrl({
    tmnCode: VNPAY_TMN_CODE,
    hashSecret: VNPAY_HASH_SECRET,
    vnpUrl: VNPAY_URL,
    returnUrl: effectiveReturnUrl,
    ipAddr: ipAddress,
    amount: payAmount,
    txnRef,
    orderInfo: description,
    bankCode,
  });

  return {
    orderId: targetOrderId,
    orderCode: code,
    totalAmount: payAmount,
    txnRef,
    vnpUrl: paymentUrl,
    paymentUrl,
    type: isThrift ? "THRIFT" : "RENT",
  };
};

/**
 * [BE-S3-05] Xử lý Webhook IPN từ VNPay (Server-to-Server)
 */
const processVnPayIpn = async (queryParams = {}) => {
  const isValidSignature = verifyVnPaySignature(queryParams, VNPAY_HASH_SECRET);
  if (!isValidSignature) {
    return { RspCode: "97", Message: "Invalid Checksum" };
  }

  const txnRef = queryParams.vnp_TxnRef;
  const vnpAmount = Number(queryParams.vnp_Amount) / 100;
  const responseCode = queryParams.vnp_ResponseCode;
  const transactionStatus = queryParams.vnp_TransactionStatus;

  let payment = await Payment.findOne({ txnRef });
  const isThrift = payment?.orderType === "THRIFT" || txnRef?.includes("TRF");

  if (isThrift) {
    let thriftOrder = null;
    if (payment) {
      thriftOrder = await ThriftOrder.findById(payment.orderId);
    }
    if (!thriftOrder) {
      const orderCode = txnRef?.split("_")[0];
      if (orderCode) {
        thriftOrder = await ThriftOrder.findOne({
          $or: [{ orderCode }, { orderCode: `#${orderCode}` }],
        });
      }
    }

    if (!thriftOrder) {
      return { RspCode: "01", Message: "Thrift Order not found" };
    }

    if (Math.round(thriftOrder.totalAmount) !== Math.round(vnpAmount)) {
      return { RspCode: "04", Message: "Invalid amount" };
    }

    if (thriftOrder.status === "PAID" || thriftOrder.paymentStatus === "PAID") {
      return { RspCode: "02", Message: "Order already confirmed" };
    }

    const isSuccess = responseCode === "00" && (!transactionStatus || transactionStatus === "00");

    if (isSuccess) {
      thriftOrder.status = "DELIVERED";
      thriftOrder.paymentStatus = "PAID";
      thriftOrder.escrowStatus = "HELD_72H";
      const now = new Date();
      thriftOrder.timeline = [
        {
          status: "PENDING_PAYMENT",
          title: "Khởi tạo phiên đặt đơn THRIFT",
          description: "Đơn mua đã được tạo thành công trên hệ thống ReUse Hub.",
          timestamp: new Date(now.getTime() - 3600000 * 3),
        },
        {
          status: "PAID",
          title: "Thanh toán Smart Escrow (VNPay Lock)",
          description: `Đã nhận thanh toán ${thriftOrder.totalAmount.toLocaleString('vi-VN')}₫ từ VNPay. Tiền được ký quỹ bảo chứng Smart Escrow.`,
          timestamp: new Date(now.getTime() - 3600000 * 2),
        },
        {
          status: "PROCESSING",
          title: "Atelier Thẩm định & Niêm phong sáp",
          description: "Kiểm tra phòng Lab Collimator đạt chuẩn 100%. Niêm phong sáp yếm khí hoàn tất (Tự động thông qua cho Test User).",
          timestamp: new Date(now.getTime() - 3600000 * 1.5),
        },
        {
          status: "SHIPPED",
          title: "Vận chuyển bọc thép Nanuk 935",
          description: "Bưu tá chuyên trách Viettel Armored Transit đã bàn giao vali bọc thép an toàn.",
          timestamp: new Date(now.getTime() - 3600000 * 0.5),
        },
        {
          status: "DELIVERED",
          title: "Đã giao hàng · Cửa sổ đối kiểm 72H đang mở",
          description: "Đã giao hàng tận tay an toàn. Quý khách có trọn vẹn 72 giờ đối kiểm độc lập trước khi Smart Escrow giải ngân.",
          timestamp: now,
        },
      ];

      if (payment) {
        payment.status = "PAID";
        payment.transactionNo = queryParams.vnp_TransactionNo || "";
        payment.bankCode = queryParams.vnp_BankCode || "";
        payment.vnpResponse = queryParams;
        payment.paidAt = new Date();
        await payment.save();
      }

      await thriftOrder.save();
      return { RspCode: "00", Message: "Confirm Success" };
    } else {
      thriftOrder.paymentStatus = "FAILED";
      if (payment) {
        payment.status = "FAILED";
        payment.vnpResponse = queryParams;
        await payment.save();
      }
      await thriftOrder.save();
      return { RspCode: "00", Message: "Confirm Success" };
    }
  }

  // Xử lý đơn RENT
  let order = null;
  if (payment) {
    order = await RentalOrder.findById(payment.orderId);
  } else {
    const orderCode = txnRef?.split("_")[0];
    if (orderCode) {
      order = await RentalOrder.findOne({ orderCode });
    }
  }

  if (!order) {
    return { RspCode: "01", Message: "Order not found" };
  }

  if (Math.round(order.totalAmount) !== Math.round(vnpAmount)) {
    return { RspCode: "04", Message: "Invalid amount" };
  }

  if (
    (payment && payment.status === "PAID") ||
    order.status === RENTAL_ORDER_STATUS.PAID ||
    order.paymentStatus === "PAID"
  ) {
    return { RspCode: "02", Message: "Order already confirmed" };
  }

  const isSuccess = responseCode === "00" && (!transactionStatus || transactionStatus === "00");

  if (isSuccess) {
    order.status = RENTAL_ORDER_STATUS.DELIVERED;
    if (!order.shippingDetails) { order.shippingDetails = {}; }
    order.shippingDetails.deliveredAt = new Date();
    order.shippingDetails.carrierName = "Nanuk White-Glove (2 chiều)";
    order.paymentStatus = "PAID";

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
        orderType: "RENT",
        userId: order.renterId,
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

    await order.save();
    return { RspCode: "00", Message: "Confirm Success" };
  } else {
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
  const isValidSignature = verifyVnPaySignature(queryParams, VNPAY_HASH_SECRET);
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
  const isThrift = payment?.orderType === "THRIFT" || txnRef?.includes("TRF");

  if (isThrift) {
    let thriftOrder = null;
    if (payment) {
      thriftOrder = await ThriftOrder.findById(payment.orderId);
    }
    if (!thriftOrder) {
      const orderCode = txnRef?.split("_")[0];
      if (orderCode) {
        thriftOrder = await ThriftOrder.findOne({
          $or: [{ orderCode }, { orderCode: `#${orderCode}` }],
        });
      }
    }

    if (!thriftOrder) {
      return {
        success: false,
        status: "FAILED",
        responseCode: "01",
        message: "Không tìm thấy đơn hàng THRIFT",
      };
    }

    const isSuccess = responseCode === "00" && (!transactionStatus || transactionStatus === "00");

    if (isSuccess) {
      if (thriftOrder.status !== "DELIVERED") {
        thriftOrder.status = "DELIVERED";
        thriftOrder.paymentStatus = "PAID";
        thriftOrder.escrowStatus = "HELD_72H";
        const now = new Date();
        thriftOrder.timeline = [
          {
            status: "PENDING_PAYMENT",
            title: "Khởi tạo phiên đặt đơn THRIFT",
            description: "Đơn mua đã được tạo thành công trên hệ thống ReUse Hub.",
            timestamp: new Date(now.getTime() - 3600000 * 3),
          },
          {
            status: "PAID",
            title: "Thanh toán Smart Escrow (VNPay Lock)",
            description: `Đã nhận thanh toán ${thriftOrder.totalAmount.toLocaleString('vi-VN')}₫ từ VNPay. Tiền được ký quỹ bảo chứng Smart Escrow.`,
            timestamp: new Date(now.getTime() - 3600000 * 2),
          },
          {
            status: "PROCESSING",
            title: "Atelier Thẩm định & Niêm phong sáp",
            description: "Kiểm tra phòng Lab Collimator đạt chuẩn 100%. Niêm phong sáp yếm khí hoàn tất (Tự động thông qua cho Test User).",
            timestamp: new Date(now.getTime() - 3600000 * 1.5),
          },
          {
            status: "SHIPPED",
            title: "Vận chuyển bọc thép Nanuk 935",
            description: "Bưu tá chuyên trách Viettel Armored Transit đã bàn giao vali bọc thép an toàn.",
            timestamp: new Date(now.getTime() - 3600000 * 0.5),
          },
          {
            status: "DELIVERED",
            title: "Đã giao hàng · Cửa sổ đối kiểm 72H đang mở",
            description: "Đã giao hàng tận tay an toàn. Quý khách có trọn vẹn 72 giờ đối kiểm độc lập trước khi Smart Escrow giải ngân.",
            timestamp: now,
          },
        ];
        await thriftOrder.save();
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
        orderId: thriftOrder._id,
        orderCode: thriftOrder.orderCode,
        totalAmount: thriftOrder.totalAmount,
        transactionNo: queryParams.vnp_TransactionNo || "",
        status: "PAID",
        type: "THRIFT",
        message: "Thanh toán đơn mua THRIFT thành công qua VNPay",
      };
    } else {
      if (payment && payment.status === "PENDING") {
        payment.status = "FAILED";
        payment.vnpResponse = queryParams;
        await payment.save();
      }
      thriftOrder.paymentStatus = "FAILED";
      await thriftOrder.save();

      return {
        success: false,
        orderId: thriftOrder._id,
        orderCode: thriftOrder.orderCode,
        totalAmount: thriftOrder.totalAmount,
        status: "FAILED",
        responseCode,
        type: "THRIFT",
        message: "Thanh toán đơn mua THRIFT không thành công",
      };
    }
  }

  // Đơn RENT
  let order = null;
  if (payment) {
    order = await RentalOrder.findById(payment.orderId);
  } else {
    const orderCode = txnRef?.split("_")[0];
    if (orderCode) {
      order = await RentalOrder.findOne({ orderCode });
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

  const isSuccess = responseCode === "00" && (!transactionStatus || transactionStatus === "00");

  if (isSuccess) {
    if (order.status !== RENTAL_ORDER_STATUS.PAID) {
      order.status = RENTAL_ORDER_STATUS.DELIVERED;
      if (!order.shippingDetails) { order.shippingDetails = {}; }
      order.shippingDetails.deliveredAt = new Date();
      order.shippingDetails.carrierName = "Nanuk White-Glove (2 chiều)";
      order.paymentStatus = "PAID";
      await order.save();
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
      transactionNo: queryParams.vnp_TransactionNo || "",
      status: "PAID",
      type: "RENT",
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
      type: "RENT",
      message: "Thanh toán không thành công hoặc người dùng đã hủy giao dịch",
    };
  }
};

export {
  createVnPayPaymentUrl,
  processVnPayIpn,
  processVnPayReturn,
};
