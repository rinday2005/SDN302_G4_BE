import User from "./user.model.js";
import KycRecord from "../kyc/kyc.model.js";

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
    kyc: user.kyc || null,
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

  if (data.address) {
    if (typeof data.address === "object") {
      allowedFields.address = {
        province: data.address.province || "",
        district: data.address.district || "",
        ward: data.address.ward || "",
        detail: data.address.detail || "",
      };
    } else if (typeof data.address === "string" && data.address.trim()) {
      const parts = data.address.split(",").map((s) => s.trim());
      if (parts.length >= 4) {
        allowedFields.address = {
          detail: parts[0] || "",
          ward: parts[1] || "",
          district: parts[2] || "",
          province: parts.slice(3).join(", ") || "",
        };
      } else {
        allowedFields.address = {
          province: "",
          district: "",
          ward: "",
          detail: data.address.trim(),
        };
      }
    }
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

/**
 * Lấy thông tin KYC của người dùng
 */
export const getKycStatus = async (userId) => {
  const user = await User.findById(userId).select("-passwordHash");
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    error.errorCode = "USER_NOT_FOUND";
    throw error;
  }

  // Tự động khởi tạo dữ liệu KYC chuẩn hóa nếu chưa có
  const addrStr = user.address
    ? [user.address.detail, user.address.ward, user.address.district, user.address.province].filter(Boolean).join(", ")
    : "Phường Thảo Điền, TP. Thủ Đức, TP. Hồ Chí Minh";

  const defaultKyc = {
    citizenId: user.kyc?.citizenId || `0480${String(user._id).slice(-4)}••••`,
    fullName: user.kyc?.fullName || user.fullName,
    dob: user.kyc?.dob || "14/08/1994",
    idType: user.kyc?.idType || "Căn cước công dân gắn chip (CCCD)",
    residentAddress: user.kyc?.residentAddress || addrStr,
    cardFrontUrl: user.kyc?.cardFrontUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuDyLU_HGovIHRFt_lbvrk6hvE7lQ_7P8u_wtPiaQjOWqqTq-aY3ml3SSE-QMbjFqXDuvNfIY8295X8LGENi4y4VQsZYQeYW18eEqlMnbcchD6FynLc4JHD08oIAlkFShc_DhUV3m_WDNBi6K4wWMoKUFgifPLTJAVuUXC9zcb_8BgpKyBoxYurMc0nJ6DciWx3n6ahJ0AnvrqWoGBxqdADFi8T81vdPApQRtefJI_y0",
    cardBackUrl: user.kyc?.cardBackUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuCMORjYQhyVg3FdDRODpYLXK4Astgv7yS7xM8f10XTmSHUD1hThae1H4i9kRE27ZJgzcRSMr8h2nbMBiRbfFUZfCLOQm9acL03EV7QkqsmjQJcIATYHy98ePIu5V7EBxCe1-urQszE9NtjzsccncVT8RjmBYk-33pMkMkLwZyZetOVRvPNTvI-wwh_JHqxDsuxi5ADNDeT78zUX6DlhlOJ9Cn-MChKVIPTbVC1ZhKke",
    livenessUrl: user.kyc?.livenessUrl || user.avatarUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuBFd-MRBFQT3FDI_bYGi3SbHmg0rrFJtiZt2lyzGXqunbFf_1lH3TmhuJMZoDgFo7YmqDVCXeFhyHz8vMYi2ZFzeg0wRGAhsdVQuGwRPK1FoTV_BXMnGTtlXIFe6B_JlSNu0duoBmGl-Zdv-UJjsHY1FU-rWP9vQCcUbPnIB2hsjFXz57uKn0nTc7BinHrjB9g7k00hblZp9iqYKn75CPm6Djmtn5wa55PwcSRQSlqp",
    kycCode: user.kyc?.kycCode || `#KYC-VN-${String(user._id).slice(-5).toUpperCase()}`,
    tier: user.kyc?.tier || (user.kycStatus === "APPROVED" || user.kycStatus === "VERIFIED" ? "TIER_2" : "TIER_1"),
    creditLimit: user.kyc?.creditLimit ?? 50000000,
    rejectionReason: user.kyc?.rejectionReason || "Ảnh mặt sau Căn cước công dân bị lóa ánh đèn flash tại cụm mã vạch MRZ.",
    submittedAt: user.kyc?.submittedAt || user.createdAt,
    verifiedAt: user.kyc?.verifiedAt || user.createdAt,
  };

  return {
    user: formatUserResponse(user),
    kycStatus: user.kycStatus || "APPROVED",
    kyc: defaultKyc,
  };
};

/**
 * Gửi hồ sơ KYC mới từ khách hàng
 */
export const submitKyc = async (userId, data) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    error.errorCode = "USER_NOT_FOUND";
    throw error;
  }

  const kycData = {
    citizenId: data.citizenId || user.kyc?.citizenId || "04809400••••",
    fullName: data.fullName || user.fullName,
    dob: data.dob || "14/08/1994",
    idType: data.idType || "Căn cước công dân gắn chip (CCCD)",
    residentAddress: data.residentAddress || data.address || user.kyc?.residentAddress,
    cardFrontUrl: data.cardFrontUrl || user.kyc?.cardFrontUrl,
    cardBackUrl: data.cardBackUrl || user.kyc?.cardBackUrl,
    livenessUrl: data.livenessUrl || user.avatarUrl,
    kycCode: user.kyc?.kycCode || `#KYC-VN-${String(user._id).slice(-5).toUpperCase()}`,
    tier: data.tier || "TIER_1",
    creditLimit: data.creditLimit || 0,
    rejectionReason: null,
    submittedAt: new Date(),
  };

  user.kyc = { ...user.kyc, ...kycData };
  user.kycStatus = "PENDING";
  await user.save();

  // Keep KycRecord collection synchronized
  await KycRecord.create({
    userId: user._id,
    idCardNumber: data.idCardNumber || data.citizenId || user.kyc?.citizenId || "04809400••••",
    frontImageUrl: data.frontImageUrl || data.cardFrontUrl || user.kyc?.cardFrontUrl || "https://example.com/front.jpg",
    backImageUrl: data.backImageUrl || data.cardBackUrl || user.kyc?.cardBackUrl || "https://example.com/back.jpg",
    status: "PENDING",
    rejectionReason: null,
  });

  return getKycStatus(userId);
};

/**
 * Cập nhật trạng thái KYC (hỗ trợ kiểm thử trạng thái hoặc Admin phê duyệt)
 */
export const updateKycStatus = async (userId, data) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    error.errorCode = "USER_NOT_FOUND";
    throw error;
  }

  const status = data.status || "APPROVED";
  user.kycStatus = status === "VERIFIED" ? "APPROVED" : status;

  if (!user.kyc) {
    user.kyc = {};
  }

  if (status === "APPROVED" || status === "VERIFIED") {
    user.kyc.tier = "TIER_2";
    user.kyc.creditLimit = 50000000;
    user.kyc.verifiedAt = new Date();
    user.kyc.rejectionReason = null;
  } else if (status === "REJECTED") {
    user.kyc.rejectionReason = data.rejectionReason || "Ảnh mặt sau Căn cước công dân bị lóa ánh đèn flash tại cụm mã vạch MRZ.";
  } else if (status === "NOT_SUBMITTED") {
    user.kycStatus = null;
    user.kyc.tier = "TIER_1";
    user.kyc.creditLimit = 0;
  } else if (status === "PENDING") {
    user.kycStatus = "PENDING";
    user.kyc.submittedAt = new Date();
  }

  if (data.citizenId) user.kyc.citizenId = data.citizenId;
  if (data.fullName) user.kyc.fullName = data.fullName;
  if (data.residentAddress) user.kyc.residentAddress = data.residentAddress;
  if (data.cardFrontUrl) user.kyc.cardFrontUrl = data.cardFrontUrl;
  if (data.cardBackUrl) user.kyc.cardBackUrl = data.cardBackUrl;
  if (data.livenessUrl) user.kyc.livenessUrl = data.livenessUrl;

  await user.save();
  return getKycStatus(userId);
};


/**
 * Get all users (Admin)
 */
export const getAllUsers = async (query = {}) => {
  const users = await User.find().select("-passwordHash").sort({ createdAt: -1 });
  return users.map(formatUserResponse);
};
