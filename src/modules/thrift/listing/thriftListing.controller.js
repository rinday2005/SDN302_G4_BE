import * as thriftService from "./thriftListing.service.js";

export const createThriftListing = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const listing = await thriftService.createListing(userId, req.body);
    return res.status(201).json({
      success: true,
      message: "Tạo sản phẩm thanh lý thành công, đang chờ duyệt",
      data: listing,
    });
  } catch (error) {
    next(error);
  }
};

export const updateThriftListing = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { id } = req.params;
    const updated = await thriftService.updateListing(id, userId, req.body);
    return res.status(200).json({
      success: true,
      message: "Cập nhật sản phẩm thanh lý thành công",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicThriftListings = async (req, res, next) => {
  try {
    const listings = await thriftService.getPublicListings(req.query);
    return res.status(200).json({
      success: true,
      data: listings,
    });
  } catch (error) {
    next(error);
  }
};

export const getThriftListingById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const listing = await thriftService.getListingById(id);
    return res.status(200).json({
      success: true,
      data: listing,
    });
  } catch (error) {
    next(error);
  }
};