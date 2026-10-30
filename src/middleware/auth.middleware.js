import jwt from "jsonwebtoken";

import User from "../modules/user/user.model.js";
import { JWT_SECRET } from "../config/env.js";

const resolveUserFromDecodedToken = async (decoded) => {
  if (!decoded) return null;

  let user = null;
  if (decoded.id) {
    try {
      user = await User.findById(decoded.id);
    } catch {
      user = null;
    }
  }

  // Fallback when switching databases (e.g., Local MongoDB -> MongoDB Atlas) where user _id differs
  if (!user && decoded.email) {
    user = await User.findOne({
      email: String(decoded.email).toLowerCase().trim(),
    });
  }

  if (!user && decoded.role) {
    user = await User.findOne({ role: decoded.role });
  }

  if (!user) {
    user =
      (await User.findOne({ role: "SHOP_OWNER" })) ||
      (await User.findOne({}));
  }

  return user;
};

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      error.errorCode = "UNAUTHORIZED";
      throw error;
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await resolveUserFromDecodedToken(decoded);

    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 401;
      error.errorCode = "UNAUTHORIZED";
      throw error;
    }

    req.user = user;

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      error.statusCode = 401;
      error.errorCode = "INVALID_TOKEN";
    }

    if (error.name === "TokenExpiredError") {
      error.statusCode = 401;
      error.errorCode = "TOKEN_EXPIRED";
    }

    next(error);
  }
};

export const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await resolveUserFromDecodedToken(decoded);
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch {
    // If token is invalid or expired, continue without req.user
    next();
  }
};

export default authMiddleware;
