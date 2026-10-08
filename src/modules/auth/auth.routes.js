import { Router } from "express";

import {
  registerController,
  loginController,
  logoutController,
  getShopOwnerStatusController,
} from "./auth.controller.js";
import { validateRegister, validateLogin } from "./auth.validation.js";

const router = Router();

// POST /api/auth/register — validate body trước khi tạo user
router.post("/register", validateRegister, registerController);

// POST /api/auth/login — validate body trước khi xác thực
router.post("/login", validateLogin, loginController);

// POST /api/auth/logout — stateless logout (xoá token phía client)
router.post("/logout", logoutController);

// GET /api/auth/shop-owner-status — kiểm tra có shop owner chưa
router.get("/shop-owner-status", getShopOwnerStatusController);

export default router;