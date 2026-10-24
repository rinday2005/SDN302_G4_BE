import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import authorize from "../../middleware/role.middleware.js";
import {
  getPendingListingsController,
  getAllListingsController,
  reviewListingController,
  reviewRentListingController,
  reviewThriftListingController,
  getDisputesController,
  getDisputeByIdController,
  resolveDisputeController,
  getFinanceOverviewController,
} from "./admin.controller.js";
import {
  validateReviewListing,
  validateResolveDispute,
} from "./admin.validation.js";

const adminRouter = Router();

// ============================================================================
// AC: Chỉ ADMIN gọi được API; User/Shop Owner nhận 403; Chưa đăng nhập nhận 401
// ============================================================================
adminRouter.use(authMiddleware, authorize(["ADMIN"]));

// ============================================================================
// 1. KIỂM DUYỆT LISTING TOÀN DIỆN (RENT & THRIFT)
// ============================================================================
// Lấy danh sách listing chờ duyệt
adminRouter.get("/listings/pending", getPendingListingsController);

// Lấy danh sách toàn bộ listings (hỗ trợ filter status, type, pagination)
adminRouter.get("/listings", getAllListingsController);

// Duyệt / Từ chối listing (tự động nhận diện hoặc chỉ định type)
adminRouter.patch("/listings/:id/status", validateReviewListing, reviewListingController);
adminRouter.patch("/listings/:type/:id/status", validateReviewListing, reviewListingController);
adminRouter.patch("/rent/listings/:id/status", validateReviewListing, reviewRentListingController);
adminRouter.patch("/thrift/listings/:id/status", validateReviewListing, reviewThriftListingController);

// ============================================================================
// 2. XỬ LÝ TRANH CHẤP ĐƠN HÀNG (RENTAL ORDER & THRIFT DISPUTES)
// ============================================================================
// Lấy danh sách tranh chấp
adminRouter.get("/disputes", getDisputesController);

// Xem chi tiết một tranh chấp
adminRouter.get("/disputes/:id", getDisputeByIdController);

// Admin phân xử và giải quyết tranh chấp (hoàn cọc Renter / bồi thường Shop)
adminRouter.patch("/disputes/:id/resolve", validateResolveDispute, resolveDisputeController);
adminRouter.post("/disputes/:id/resolve", validateResolveDispute, resolveDisputeController);

// ============================================================================
// 3. BÁO CÁO TÀI CHÍNH TOÀN HỆ THỐNG & SHOP OWNER DUY NHẤT
// ============================================================================
adminRouter.get("/finance", getFinanceOverviewController);
adminRouter.get("/finance/overview", getFinanceOverviewController);
adminRouter.get("/financial-report", getFinanceOverviewController);
adminRouter.get("/reports/finance", getFinanceOverviewController);

export default adminRouter;
