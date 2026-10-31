import { Router } from "express";
import authMiddleware, { optionalAuthMiddleware } from "../../middleware/auth.middleware.js";
import authorize from "../../middleware/role.middleware.js";
import {
  getShopProfileController,
  updateShopProfileController,
  getShopRevenueController,
} from "./shop.controller.js";

const router = Router();

// 1. Profile Shop APIs
router.get("/profile", optionalAuthMiddleware, getShopProfileController);
router.put("/profile", optionalAuthMiddleware, updateShopProfileController);

// 2. Revenue Analytics API (MongoDB Aggregation Pipeline)
router.get("/revenue", optionalAuthMiddleware, getShopRevenueController);

export default router;
