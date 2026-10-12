import jwt from "jsonwebtoken";

import User from "../modules/user/user.model.js";
import { JWT_SECRET } from "../config/env.js";

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

    const user = await User.findById(decoded.id);

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
      const user = await User.findById(decoded.id);
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