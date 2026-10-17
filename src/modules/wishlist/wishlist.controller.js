import {
  getUserWishlist,
  addToWishlist,
  toggleWishlist,
  removeFromWishlist,
  clearWishlist,
} from "./wishlist.service.js";
import { successResponse } from "../../utils/response.js";

/**
 * Lấy danh sách yêu thích của người dùng
 * GET /api/wishlist
 */
export const getWishlistController = async (req, res, next) => {
  try {
    const result = await getUserWishlist(req.user._id);

    return successResponse(
      res,
      "Lấy danh sách yêu thích thành công",
      result
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Thêm sản phẩm vào danh sách yêu thích
 * POST /api/wishlist
 */
export const addToWishlistController = async (req, res, next) => {
  try {
    const { productId, productType } = req.body;
    const result = await addToWishlist(req.user._id, { productId, productType });

    return successResponse(
      res,
      "Thêm vào danh sách yêu thích thành công",
      result,
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle trạng thái yêu thích (Bấm lần 1: Thêm, Bấm lần 2: Xóa)
 * POST /api/wishlist/toggle
 */
export const toggleWishlistController = async (req, res, next) => {
  try {
    const { productId, productType } = req.body;
    const result = await toggleWishlist(req.user._id, { productId, productType });

    return successResponse(
      res,
      result.isFavorited
        ? "Đã thêm sản phẩm vào danh sách yêu thích"
        : "Đã xóa sản phẩm khỏi danh sách yêu thích",
      result
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa sản phẩm khỏi danh sách yêu thích
 * DELETE /api/wishlist/:productId
 */
export const removeFromWishlistController = async (req, res, next) => {
  try {
    const result = await removeFromWishlist(req.user._id, req.params.productId);

    return successResponse(
      res,
      "Đã xóa sản phẩm khỏi danh sách yêu thích",
      result
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa toàn bộ danh sách yêu thích
 * DELETE /api/wishlist
 */
export const clearWishlistController = async (req, res, next) => {
  try {
    const result = await clearWishlist(req.user._id);

    return successResponse(
      res,
      "Đã làm rỗng danh sách yêu thích",
      result
    );
  } catch (error) {
    next(error);
  }
};
