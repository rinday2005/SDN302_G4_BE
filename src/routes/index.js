import { Router } from "express";
import { successResponse } from "../utils/response.js";
import authRoutes from "../modules/auth/auth.routes.js";

const router = Router();

router.get("/health", (req, res) => {
  return successResponse(res, "ReUse Hub API is running", {
    status: "ok",
  });
});

router.use("/api/auth", authRoutes);

export default router;