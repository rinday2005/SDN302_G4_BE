import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import {
  getWishlistController,
  addToWishlistController,
  toggleWishlistController,
  removeFromWishlistController,
  clearWishlistController,
} from "./wishlist.controller.js";
import { validateToggleWishlist } from "./wishlist.validation.js";

const router = Router();

// Tất cả thao tác wishlist đều yêu cầu người dùng đăng nhập
router.use(authMiddleware);

// 1. Lấy danh sách yêu thích
// GET /api/wishlist
router.get("/", getWishlistController);

// 2. Thêm sản phẩm vào danh sách yêu thích
// POST /api/wishlist
router.post("/", validateToggleWishlist, addToWishlistController);

// 3. Toggle trạng thái yêu thích (Thêm nếu chưa có, Xóa nếu đã có)
// POST /api/wishlist/toggle
router.post("/toggle", validateToggleWishlist, toggleWishlistController);

// 4. Xóa một sản phẩm khỏi danh sách yêu thích
// DELETE /api/wishlist/:productId
router.delete("/:productId", removeFromWishlistController);

// 5. Xóa toàn bộ danh sách yêu thích
// DELETE /api/wishlist
router.delete("/", clearWishlistController);

export default router;
