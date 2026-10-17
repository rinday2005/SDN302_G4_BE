import {
  getThriftListings,
  getThriftListingById,
  createThriftListing,
  updateThriftListing,
  deleteThriftListing,
} from "./thriftListing.service.js";
import { successResponse } from "../../../utils/response.js";

/**
 * Lấy danh sách sản phẩm thanh lý
 * GET /api/thrift/listings
 */
export const getThriftListingsController = async (req, res, next) => {
  try {
    const result = await getThriftListings(req.query);

    return successResponse(
      res,
      "Lấy danh sách sản phẩm thanh lý thành công",
      result
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy chi tiết sản phẩm thanh lý
 * GET /api/thrift/listings/:id
 */
export const getThriftListingByIdController = async (req, res, next) => {
  try {
    const listing = await getThriftListingById(req.params.id);

    return successResponse(
      res,
      "Lấy chi tiết sản phẩm thanh lý thành công",
      listing
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Đăng bán sản phẩm thanh lý mới
 * POST /api/thrift/listings
 */
export const createThriftListingController = async (req, res, next) => {
  try {
    const listing = await createThriftListing(req.user, req.body);

    return successResponse(
      res,
      "Đăng bán sản phẩm thanh lý thành công",
      listing,
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật sản phẩm thanh lý
 * PUT /api/thrift/listings/:id
 */
export const updateThriftListingController = async (req, res, next) => {
  try {
    const listing = await updateThriftListing(
      req.params.id,
      req.user,
      req.body
    );

    return successResponse(
      res,
      "Cập nhật sản phẩm thanh lý thành công",
      listing
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Ẩn hoặc xóa sản phẩm thanh lý
 * DELETE /api/thrift/listings/:id
 */
export const deleteThriftListingController = async (req, res, next) => {
  try {
    const result = await deleteThriftListing(req.params.id, req.user);

    return successResponse(
      res,
      "Xóa sản phẩm thanh lý thành công",
      result
    );
  } catch (error) {
    next(error);
  }
};
