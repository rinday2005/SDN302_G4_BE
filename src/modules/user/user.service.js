import User from "./user.model.js";

/**
 * Format user data returned to client
 */
export const formatUserResponse = (user) => {
  if (!user) return null;
  return {
    id: user._id,
    _id: user._id,
    email: user.email,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber || null,
    phone: user.phoneNumber || null,
    avatarUrl: user.avatarUrl || null,
    role: user.role,
    kycStatus: user.kycStatus || null,
    address: user.address || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

/**
 * Get user profile by userId
 */
export const getProfile = async (userId) => {
  const user = await User.findById(userId).select("-passwordHash");
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    error.errorCode = "USER_NOT_FOUND";
    throw error;
  }
  return formatUserResponse(user);
};

/**
 * Update user profile by userId
 */
export const updateProfile = async (userId, data) => {
  const allowedFields = {};

  if (typeof data.fullName === "string") {
    allowedFields.fullName = data.fullName.trim();
  }

  // Support both 'phone' and 'phoneNumber' from FE
  const phone = data.phoneNumber ?? data.phone;
  if (typeof phone === "string") {
    allowedFields.phoneNumber = phone.trim();
  }

  if (typeof data.avatarUrl === "string") {
    allowedFields.avatarUrl = data.avatarUrl.trim();
  }

  if (data.address && typeof data.address === "object") {
    allowedFields.address = {
      province: data.address.province || "",
      district: data.address.district || "",
      ward: data.address.ward || "",
      detail: data.address.detail || "",
    };
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: allowedFields },
    { new: true, runValidators: true }
  ).select("-passwordHash");

  if (!updatedUser) {
    const error = new Error("User not found");
    error.statusCode = 404;
    error.errorCode = "USER_NOT_FOUND";
    throw error;
  }

  return formatUserResponse(updatedUser);
};

/**
 * Update user avatarUrl directly
 */
export const updateAvatar = async (userId, avatarUrl) => {
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: { avatarUrl } },
    { new: true }
  ).select("-passwordHash");

  if (!updatedUser) {
    const error = new Error("User not found");
    error.statusCode = 404;
    error.errorCode = "USER_NOT_FOUND";
    throw error;
  }

  return formatUserResponse(updatedUser);
};
