const validateCreateCategory = (req, res, next) => {
  const { name, slug, type, isActive } = req.body;

  if (!name || !name.trim()) {
    const error = new Error("Category name is required");
    error.statusCode = 400;
    error.errorCode = "CATEGORY_NAME_REQUIRED";
    return next(error);
  }

  if (!slug || !slug.trim()) {
    const error = new Error("Category slug is required");
    error.statusCode = 400;
    error.errorCode = "CATEGORY_SLUG_REQUIRED";
    return next(error);
  }

  if (type && !["RENT", "THRIFT", "BOTH"].includes(type)) {
    const error = new Error("Category type must be RENT, THRIFT or BOTH");
    error.statusCode = 400;
    error.errorCode = "INVALID_CATEGORY_TYPE";
    return next(error);
  }

  if (isActive !== undefined && typeof isActive !== "boolean") {
    const error = new Error("isActive must be boolean");
    error.statusCode = 400;
    error.errorCode = "INVALID_IS_ACTIVE";
    return next(error);
  }

  next();
};

const validateUpdateCategory = (req, res, next) => {
  const { name, slug, type, isActive } = req.body;

  if (name !== undefined && !name.trim()) {
    const error = new Error("Category name cannot be empty");
    error.statusCode = 400;
    error.errorCode = "INVALID_CATEGORY_NAME";
    return next(error);
  }

  if (slug !== undefined && !slug.trim()) {
    const error = new Error("Category slug cannot be empty");
    error.statusCode = 400;
    error.errorCode = "INVALID_CATEGORY_SLUG";
    return next(error);
  }

  if (type !== undefined && !["RENT", "THRIFT", "BOTH"].includes(type)) {
    const error = new Error("Category type must be RENT, THRIFT or BOTH");
    error.statusCode = 400;
    error.errorCode = "INVALID_CATEGORY_TYPE";
    return next(error);
  }

  if (isActive !== undefined && typeof isActive !== "boolean") {
    const error = new Error("isActive must be boolean");
    error.statusCode = 400;
    error.errorCode = "INVALID_IS_ACTIVE";
    return next(error);
  }

  next();
};

export {
  validateCreateCategory,
  validateUpdateCategory,
};