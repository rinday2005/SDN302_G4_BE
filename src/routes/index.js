import { Router } from "express";
import { successResponse } from "../utils/response.js";
import authRoutes from "../modules/auth/auth.routes.js";

// NOTE [An - BE-S1-07]:
// Added Category routes required by Jira task BE-S1-07.
// This file is owned by N; change made only to register Category APIs.
import {
  publicCategoryRouter,
  adminCategoryRouter,
} from "../modules/category/category.route.js";

const router = Router();

router.get("/api/health", (req, res) => {
  return successResponse(res, "ReUse Hub API is running", {
    status: "ok",
  });
});

router.use("/api/auth", authRoutes);

// NOTE [An - BE-S1-07]:
// Register Category routes only. Existing routes are unchanged.
router.use("/api/categories", publicCategoryRouter);
router.use("/api/admin/categories", adminCategoryRouter);

export default router;