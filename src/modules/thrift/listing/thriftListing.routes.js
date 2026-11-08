import express from "express";
import * as thriftController from "./thriftListing.controller.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import authorize from "../../../middleware/role.middleware.js";

const router = express.Router();

// Middleware kiểm tra Shop Owner đã được duyệt KYC
const requireVerifiedShopOwner = (req, res, next) => {
  if (!req.user || (req.user.role !== "SHOP_OWNER" && req.user.role !== "ADMIN")) {
    return res.status(403).json({
      success: false,
      message: "Chỉ Shop Owner mới có quyền thực hiện thao tác này",
    });
  }

  const isApproved =
    req.user.role === "ADMIN" ||
    req.user.kycStatus === "APPROVED" ||
    req.user.kycStatus === "VERIFIED" ||
    Boolean(req.user.isKycVerified);

  if (!isApproved) {
    return res.status(403).json({
      success: false,
      code: "SHOP_KYC_REQUIRED",
      message: "Tài khoản Cửa hàng cần hoàn tất xác thực KYC (CCCD) và được phê duyệt trước khi tạo hoặc chỉnh sửa bài đăng thanh lý.",
    });
  }

  next();
};


// Public: Xem danh sách bài đăng (chỉ lấy status APPROVED)
router.get("/", thriftController.getPublicThriftListings);

// Shop Owner: Lấy danh sách sản phẩm thanh lý của mình
router.get(
  "/shop/mine",
  authMiddleware,
  authorize(["SHOP_OWNER"]),
  thriftController.getShopThriftListings
);

router.get("/:id", thriftController.getThriftListingById);

// Private: Chỉ Shop Owner mới có quyền tạo và sửa
// AC: User gọi API này trả 403
router.post(
  "/convert-from-rental",
  authMiddleware,
  requireVerifiedShopOwner,
  thriftController.convertFromRental
);

router.post(
  "/",
  authMiddleware,
  requireVerifiedShopOwner,
  thriftController.createThriftListing
);

router.put(
  "/:id",
  authMiddleware,
  requireVerifiedShopOwner,
  thriftController.updateThriftListing
);

router.delete(
  "/:id",
  authMiddleware,
  requireVerifiedShopOwner,
  thriftController.deleteThriftListing
);

export default router;