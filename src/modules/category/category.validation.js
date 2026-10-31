const slugify = (val = "") =>
  val
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeCategoryBody = (body = {}) => {
  if (body.type === "COMMON") {
    body.type = "BOTH";
  } else if (!body.type && body.market) {
    body.type = body.market === "COMMON" ? "BOTH" : body.market;
  }

  if (typeof body.isActive === "string") {
    if (body.isActive === "true") body.isActive = true;
    else if (body.isActive === "false") body.isActive = false;
  } else if (body.isActive === undefined && body.status) {
    body.isActive = body.status === "ACTIVE";
  }

  if (typeof body.slug === "string") {
    body.slug = body.slug
      .replace(/^\/categories\//i, "")
      .replace(/^\/+/, "")
      .trim()
      .toLowerCase();
  }
};

const validateCreateCategory = (req, res, next) => {
  normalizeCategoryBody(req.body);
  const { name, type, isActive } = req.body;

  if (!name || !String(name).trim()) {
    const error = new Error("Category name is required");
    error.statusCode = 400;
    error.errorCode = "CATEGORY_NAME_REQUIRED";
    return next(error);
  }

  if (!req.body.slug || !String(req.body.slug).trim()) {
    req.body.slug = slugify(name);
  }

  if (!req.body.slug) {
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
  normalizeCategoryBody(req.body);
  const { name, slug, type, isActive } = req.body;

  if (name !== undefined && !String(name).trim()) {
    const error = new Error("Category name cannot be empty");
    error.statusCode = 400;
    error.errorCode = "INVALID_CATEGORY_NAME";
    return next(error);
  }

  if (slug !== undefined && !String(slug).trim()) {
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
