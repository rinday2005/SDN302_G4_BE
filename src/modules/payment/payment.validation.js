import mongoose from "mongoose";

const fail = (next, message, errorCode) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.errorCode = errorCode;
  return next(error);
};

// POST /api/payments/create-vnpay-url body: { orderId, amount, orderCode, type = "RENT" }
const validateCreateVnPayUrl = (req, res, next) => {
  const { orderId, amount, type } = req.body;

  // Nếu không có orderId thì bắt buộc phải có amount (dành cho data tĩnh)
  if (!orderId && !amount) {
    return fail(
      next,
      "Cần cung cấp orderId hoặc amount để tạo thanh toán",
      "INVALID_PARAMS"
    );
  }

  // Nếu có orderId và không rỗng thì kiểm tra ObjectId hợp lệ
  if (orderId && typeof orderId === "string" && orderId.trim() !== "") {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return fail(next, "orderId không hợp lệ", "INVALID_ORDER_ID");
    }
  }

  if (type !== undefined && !["RENT", "THRIFT"].includes(type)) {
    return fail(next, "type phải là RENT hoặc THRIFT", "INVALID_ORDER_TYPE");
  }

  next();
};

export { validateCreateVnPayUrl };
