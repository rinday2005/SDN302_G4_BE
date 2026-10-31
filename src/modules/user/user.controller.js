import { successResponse } from "../../utils/response.js";
import {
  getProfile,
  updateProfile,
  updateAvatar,
  getKycStatus,
  submitKyc,
  updateKycStatus,
  getAllUsers,
} from "./user.service.js";
import User from "./user.model.js";
import {
  uploadImageToCloudinary,
  deleteImageFromCloudinary,
} from "../../utils/cloudinaryUpload.js";

import mongoose from "mongoose";

/**
 * GET /api/users/profile or /api/users/me
 */
export const getProfileController = async (req, res, next) => {
  try {
    let userId = req.user?._id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const fallbackUser =
        (await User.findOne({ role: { $in: ["USER", "CUSTOMER"] } })) ||
        (await User.findOne());
      userId = fallbackUser?._id;
    }

    if (!userId) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    const profile = await getProfile(userId);

    return successResponse(
      res,
      "User profile retrieved successfully",
      profile
    );
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/users/profile
 */
export const updateProfileController = async (req, res, next) => {
  try {
    let userId = req.user?._id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const fallbackUser =
        (await User.findOne({ role: { $in: ["USER", "CUSTOMER"] } })) ||
        (await User.findOne());
      userId = fallbackUser?._id;
    }

    if (!userId) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng để cập nhật",
      });
    }

    const profile = await updateProfile(userId, req.body);

    return successResponse(
      res,
      "User profile updated successfully",
      profile
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/avatar
 */
export const uploadAvatarController = async (req, res, next) => {
  try {
    // Support file sent via single('avatar'|'file'|'image') or fields or any()
    const file =
      req.file ||
      req.files?.avatar?.[0] ||
      req.files?.file?.[0] ||
      req.files?.image?.[0] ||
      (Array.isArray(req.files) ? req.files[0] : null);

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp file ảnh avatar",
      });
    }

    // 1. Kiểm tra ảnh avatar cũ trên Cloudinary để chuẩn bị xóa dọn dẹp
    let previousPublicId = null;
    let previousAvatarUrl = null;
    if (req.user?._id) {
      const existingUser = await User.findById(req.user._id).select("avatarUrl avatarPublicId");
      if (existingUser) {
        previousPublicId = existingUser.avatarPublicId;
        previousAvatarUrl = existingUser.avatarUrl;
      }
    }

    // 2. Upload file ảnh mới lên Cloudinary
    const uploadResult = await uploadImageToCloudinary(
      file.buffer,
      "reuse_hub/avatars"
    );
    const avatarUrl = uploadResult.secure_url;
    const avatarPublicId = uploadResult.public_id;

    // 3. Dọn dẹp/xóa ảnh cũ trên Cloudinary để tránh rác storage
    if (previousPublicId || (previousAvatarUrl && previousAvatarUrl.includes("cloudinary.com"))) {
      await deleteImageFromCloudinary(previousPublicId || previousAvatarUrl);
    }

    // 4. Lưu trực tiếp đường dẫn URL và public_id từ Cloudinary vào MongoDB
    let updatedUser = null;
    if (req.user?._id) {
      updatedUser = await updateAvatar(req.user._id, avatarUrl, avatarPublicId);
    }

    return res.status(200).json({
      success: true,
      message: "Avatar uploaded successfully",
      avatarUrl,
      url: avatarUrl,
      secure_url: avatarUrl,
      public_id: avatarPublicId,
      data: {
        avatarUrl,
        url: avatarUrl,
        secure_url: avatarUrl,
        public_id: avatarPublicId,
        user: updatedUser,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/kyc
 */
export const getKycController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const kyc = await getKycStatus(userId);
    return successResponse(res, "Lấy thông tin KYC thành công", kyc);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/kyc/submit
 */
export const submitKycController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const result = await submitKyc(userId, req.body);
    return successResponse(res, "Gửi hồ sơ KYC thành công. Hệ thống đang tiến hành thẩm định.", result);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/users/kyc/status
 */
export const updateKycStatusController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const result = await updateKycStatus(userId, req.body);
    return successResponse(res, "Cập nhật trạng thái KYC thành công", result);
  } catch (error) {
    next(error);
  }
};


/**
 * GET /api/users
 */
export const getAllUsersController = async (req, res, next) => {
  try {
    const users = await getAllUsers(req.query);
    return successResponse(res, "Lấy danh sách người dùng thành công", users);
  } catch (error) {
    next(error);
  }
};
