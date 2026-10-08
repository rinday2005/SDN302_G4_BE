import { Router } from "express";

import {
  registerController,
  loginController,
  logoutController,
  getShopOwnerStatusController,
} from "./auth.controller.js";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginController);
router.post("/logout", logoutController);
router.get("/shop-owner-status", getShopOwnerStatusController);

export default router;