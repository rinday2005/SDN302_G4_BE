import express from "express";
import * as thriftController from "./thriftListing.controller.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import authorize from "../../../middleware/role.middleware.js";

const router = express.Router();

// Private: Chỉ Shop Owner / Admin mới xem tất cả listing của mình
router.get(
  "/shop/mine",
  authMiddleware,
  authorize(["SHOP_OWNER", "ADMIN"]),
  thriftController.getShopThriftListings
);

// Public: Xem danh sách bài đăng (chỉ lấy status APPROVED)
router.get("/", thriftController.getPublicThriftListings);
router.get("/:id", thriftController.getThriftListingById);

// Private: Chỉ Shop Owner mới có quyền tạo và sửa
// AC: User gọi API này trả 403
router.post(
  "/convert-from-rental",
  authMiddleware,
  authorize(["SHOP_OWNER"]),
  thriftController.convertFromRental
);

router.post(
  "/",
  authMiddleware,
  authorize(["SHOP_OWNER"]),
  thriftController.createThriftListing
);

router.put(
  "/:id",
  authMiddleware,
  authorize(["SHOP_OWNER"]),
  thriftController.updateThriftListing
);

export default router;