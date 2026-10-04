import { Router } from "express";
import { successResponse } from "../utils/response.js";

const router = Router();

router.get("/health", (req, res) => {
  return successResponse(res, "ReUse Hub API is running", {
    status: "ok",
  });
});

export default router;