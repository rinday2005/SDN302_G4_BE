import mongoose from "mongoose";

const fail = (next, message, errorCode) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.errorCode = errorCode;
  return next(error);
};

// POST /api/payments/create-vnpay-url body: { orderId, type = "RENT" }
const validateCreateVnPayUrl = (req, res, next) => {
  const { orderId, type } = req.body;

  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    return fail(next, "orderId không hợp lệ", "INVALID_ORDER_ID");
  }

  if (type !== undefined && !["RENT", "THRIFT"].includes(type)) {
    return fail(next, "type phải là RENT hoặc THRIFT", "INVALID_ORDER_TYPE");
  }

  next();
};

export {
  validateCreateVnPayUrl,
};
