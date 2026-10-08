import mongoose from "mongoose";

const validateCreateProduct = (req, res, next) => {
  const { name, category, type, pricePerDay, thriftPrice } = req.body;

  if (!name || !name.trim()) {
    const error = new Error("Product name is required");
    error.statusCode = 400;
    error.errorCode = "PRODUCT_NAME_REQUIRED";
    return next(error);
  }

  if (!category || !mongoose.Types.ObjectId.isValid(category)) {
    const error = new Error("Valid category id is required");
    error.statusCode = 400;
    error.errorCode = "INVALID_CATEGORY_ID";
    return next(error);
  }

  if (type && !["RENT", "THRIFT", "BOTH"].includes(type)) {
    const error = new Error("Product type must be RENT, THRIFT or BOTH");
    error.statusCode = 400;
    error.errorCode = "INVALID_PRODUCT_TYPE";
    return next(error);
  }

  if (type === "RENT" && (pricePerDay === undefined || Number(pricePerDay) < 0)) {
    const error = new Error("Rental price per day is required and must be non-negative");
    error.statusCode = 400;
    error.errorCode = "INVALID_PRICE_PER_DAY";
    return next(error);
  }

  if (type === "THRIFT" && (thriftPrice === undefined || Number(thriftPrice) < 0)) {
    const error = new Error("Thrift price is required and must be non-negative");
    error.statusCode = 400;
    error.errorCode = "INVALID_THRIFT_PRICE";
    return next(error);
  }

  next();
};

const validateUpdateProduct = (req, res, next) => {
  const { name, category, type } = req.body;

  if (name !== undefined && !name.trim()) {
    const error = new Error("Product name cannot be empty");
    error.statusCode = 400;
    error.errorCode = "INVALID_PRODUCT_NAME";
    return next(error);
  }

  if (category !== undefined && !mongoose.Types.ObjectId.isValid(category)) {
    const error = new Error("Valid category id is required");
    error.statusCode = 400;
    error.errorCode = "INVALID_CATEGORY_ID";
    return next(error);
  }

  if (type !== undefined && !["RENT", "THRIFT", "BOTH"].includes(type)) {
    const error = new Error("Product type must be RENT, THRIFT or BOTH");
    error.statusCode = 400;
    error.errorCode = "INVALID_PRODUCT_TYPE";
    return next(error);
  }

  next();
};

export {
  validateCreateProduct,
  validateUpdateProduct,
};
