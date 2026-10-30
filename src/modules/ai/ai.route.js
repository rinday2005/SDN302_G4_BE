import { Router } from "express";
import jwt from "jsonwebtoken";
import env from "../../config/env.js";
import User from "../user/user.model.js";
import authMiddleware from "../../middleware/auth.middleware.js";
import {
  chatWithAIController,
  getAIRecommendationsController,
  getAISessionsController,
} from "./ai.controller.js";

const router = Router();

// Middleware xác thực tùy chọn: Hỗ trợ cả Guest lẫn Customer đã đăng nhập
const optionalAuth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, env.jwtSecret);
      const userId = decoded?.userId || decoded?.id || decoded?._id;
      if (userId) {
        const user = await User.findById(userId).select("-passwordHash");
        if (user) req.user = user;
      }
    }
  } catch {
    // Cho phép tiếp tục với quyền Guest nếu token hết hạn hoặc không hợp lệ
  }
  return next();
};

router.post("/chat", optionalAuth, chatWithAIController);
router.get("/recommendations", optionalAuth, getAIRecommendationsController);
router.get("/sessions", authMiddleware, getAISessionsController);

export default router;

