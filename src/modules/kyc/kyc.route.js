import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import authorize from "../../middleware/role.middleware.js";
import {
  submitKycController,
  reviewKycController,
  getMyKycController,
  getAdminKycByIdController,
  listAdminKycController,
} from "./kyc.controller.js";
import {
  validateSubmitKyc,
  validateAdminReviewKyc,
} from "./kyc.validation.js";

const kycRouter = Router();
const adminKycRouter = Router();

// ==========================================
// USER KYC ROUTES
// Mount path in app: /api/kyc
// ==========================================
kycRouter.use(authMiddleware);

kycRouter.post("/submit", validateSubmitKyc, submitKycController);
kycRouter.get("/me", getMyKycController);
kycRouter.get("/status", getMyKycController);
kycRouter.get("/", getMyKycController);

// ==========================================
// ADMIN KYC ROUTES
// Mount path in app: /api/admin/kyc
// Only Admin can access
// ==========================================
adminKycRouter.use(authMiddleware, authorize(["ADMIN"]));

adminKycRouter.patch("/:id", validateAdminReviewKyc, reviewKycController);
adminKycRouter.get("/:id", getAdminKycByIdController);
adminKycRouter.get("/", listAdminKycController);

export { kycRouter, adminKycRouter };
export default kycRouter;
