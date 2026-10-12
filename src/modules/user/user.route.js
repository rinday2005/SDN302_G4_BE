import { Router } from "express";
import authMiddleware, { optionalAuthMiddleware } from "../../middleware/auth.middleware.js";
import upload from "../../middleware/upload.middleware.js";
import {
  getProfileController,
  updateProfileController,
  uploadAvatarController,
} from "./user.controller.js";

const router = Router();

// GET current user profile
router.get("/profile", authMiddleware, getProfileController);
router.get("/me", authMiddleware, getProfileController);

// PUT update user profile (fullName, phone, avatarUrl, address...)
router.put("/profile", authMiddleware, updateProfileController);

// POST upload avatar (supports multipart with fields 'avatar', 'file', or 'image')
// Uses optionalAuthMiddleware so that if the user is authenticated, it immediately saves to MongoDB
router.post(
  "/avatar",
  optionalAuthMiddleware,
  upload.any(),
  uploadAvatarController
);

export default router;
