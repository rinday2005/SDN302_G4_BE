/**
 * Auth Validation Middleware
 *
 * Validates request body for register and login endpoints
 * using plain JavaScript (no external validation library).
 * On failure, throws an error with statusCode 400.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPhone = (phone) =>
  /^(0|\+84)[3-9]\d{8}$/.test(phone);

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.errorCode = "VALIDATION_ERROR";
  return error;
};

// ─── Register Validator ──────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Required: email, password, fullName
 * Optional: phoneNumber, role
 */
const validateRegister = (req, res, next) => {
  const { email, password, fullName, phoneNumber, role } = req.body;

  // email
  if (!email || typeof email !== "string" || !email.trim()) {
    return next(createValidationError("Email is required"));
  }
  if (!isValidEmail(email.trim())) {
    return next(createValidationError("Invalid email format"));
  }

  // password
  if (!password || typeof password !== "string") {
    return next(createValidationError("Password is required"));
  }
  if (password.length < 6) {
    return next(createValidationError("Password must be at least 6 characters"));
  }

  // fullName
  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    return next(createValidationError("Full name is required"));
  }
  if (fullName.trim().length < 2 || fullName.trim().length > 100) {
    return next(createValidationError("Full name must be between 2 and 100 characters"));
  }

  // phoneNumber (optional)
  if (phoneNumber !== undefined && phoneNumber !== null && phoneNumber !== "") {
    if (!isValidPhone(String(phoneNumber).trim())) {
      return next(createValidationError("Invalid Vietnamese phone number format"));
    }
  }

  // role (optional, only USER or SHOP_OWNER allowed at register)
  const allowedRoles = ["USER", "SHOP_OWNER"];
  if (role !== undefined && !allowedRoles.includes(role)) {
    return next(createValidationError(`Role must be one of: ${allowedRoles.join(", ")}`));
  }

  next();
};

// ─── Login Validator ─────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Required: email, password
 */
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || typeof email !== "string" || !email.trim()) {
    return next(createValidationError("Email is required"));
  }
  if (!isValidEmail(email.trim())) {
    return next(createValidationError("Invalid email format"));
  }

  if (!password || typeof password !== "string") {
    return next(createValidationError("Password is required"));
  }
  if (password.length < 1) {
    return next(createValidationError("Password cannot be empty"));
  }

  next();
};

// ─── Exports ─────────────────────────────────────────────────────────────────

export { validateRegister, validateLogin };
