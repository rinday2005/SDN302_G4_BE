import { successResponse } from "../../utils/response.js";
import {
  getProfile,
  updateProfile,
  updateAvatar,
} from "./user.service.js";
import { uploadImageToCloudinary } from "../../utils/cloudinaryUpload.js";

/**
 * GET /api/users/profile or /api/users/me
 */
export const getProfileController = async (req, res, next) => {
  try {
    const userId = req.user._id;
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
    const userId = req.user._id;
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

    // Upload buffer to Cloudinary
    const uploadResult = await uploadImageToCloudinary(
      file.buffer,
      "reuse_hub/avatars"
    );
    const avatarUrl = uploadResult.secure_url;

    // If user is authenticated, persist avatarUrl directly into MongoDB!
    let updatedUser = null;
    if (req.user?._id) {
      updatedUser = await updateAvatar(req.user._id, avatarUrl);
    }

    return res.status(200).json({
      success: true,
      message: "Avatar uploaded successfully",
      avatarUrl,
      url: avatarUrl,
      secure_url: avatarUrl,
      data: {
        avatarUrl,
        url: avatarUrl,
        secure_url: avatarUrl,
        user: updatedUser,
      },
    });
  } catch (error) {
    next(error);
  }
};
