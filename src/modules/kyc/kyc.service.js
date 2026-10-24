import mongoose from "mongoose";
import KycRecord, { KYC_STATUS } from "./kyc.model.js";
import User from "../user/user.model.js";

const createError = (message, statusCode = 400, errorCode = "BAD_REQUEST") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
};

/**
 * User submits KYC application
 * AC: User không thể tự đặt KYC thành APPROVED.
 * Status always forced to PENDING.
 * Trạng thái User và KYC record đồng bộ.
 */
export const submitKycApplication = async (userId, data = {}) => {
  const user = await User.findById(userId);
  if (!user) {
    throw createError("User not found", 404, "USER_NOT_FOUND");
  }

  const idCardNumber = String(data.idCardNumber || data.citizenId || "").trim();
  const frontImageUrl = String(data.frontImageUrl || data.cardFrontUrl || "").trim();
  const backImageUrl = String(data.backImageUrl || data.cardBackUrl || "").trim();

  if (!idCardNumber) {
    throw createError("Số CCCD/CMND là bắt buộc", 400, "ID_CARD_NUMBER_REQUIRED");
  }
  if (!frontImageUrl) {
    throw createError("Ảnh mặt trước CCCD là bắt buộc", 400, "FRONT_IMAGE_URL_REQUIRED");
  }
  if (!backImageUrl) {
    throw createError("Ảnh mặt sau CCCD là bắt buộc", 400, "BACK_IMAGE_URL_REQUIRED");
  }

  // AC: User cannot set status to APPROVED - always forced to PENDING
  const kycRecord = await KycRecord.create({
    userId: user._id,
    idCardNumber,
    frontImageUrl,
    backImageUrl,
    status: KYC_STATUS.PENDING,
    rejectionReason: null,
  });

  // AC: Trạng thái User và KYC record đồng bộ
  user.kycStatus = KYC_STATUS.PENDING;
  if (!user.kyc) {
    user.kyc = {};
  }
  user.kyc.citizenId = idCardNumber;
  user.kyc.cardFrontUrl = frontImageUrl;
  user.kyc.cardBackUrl = backImageUrl;
  user.kyc.submittedAt = new Date();
  user.kyc.rejectionReason = null;
  await user.save();

  return kycRecord;
};

/**
 * Admin reviews KYC application
 * AC: Admin mới được duyệt/từ chối.
 * AC: Từ chối phải có lý do.
 * AC: Duyệt KYC chỉ cập nhật user.kycStatus = APPROVED, không thay đổi role.
 * AC: Trạng thái User và KYC record đồng bộ.
 */
export const reviewKycApplication = async (recordId, { status, rejectionReason } = {}) => {
  if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
    throw createError("ID hồ sơ KYC không hợp lệ", 400, "INVALID_ID");
  }

  if (!status || ![KYC_STATUS.APPROVED, KYC_STATUS.REJECTED].includes(status)) {
    throw createError(
      "Trạng thái duyệt KYC phải là APPROVED hoặc REJECTED",
      400,
      "INVALID_KYC_STATUS"
    );
  }

  // AC: Từ chối phải có lý do
  if (status === KYC_STATUS.REJECTED && (!rejectionReason || !String(rejectionReason).trim())) {
    throw createError(
      "Lý do từ chối (rejectionReason) là bắt buộc khi từ chối hồ sơ KYC",
      400,
      "REJECTION_REASON_REQUIRED"
    );
  }

  const kycRecord = await KycRecord.findById(recordId);
  if (!kycRecord) {
    throw createError("Hồ sơ KYC không tồn tại", 404, "KYC_RECORD_NOT_FOUND");
  }

  // Update KycRecord
  kycRecord.status = status;
  kycRecord.rejectionReason = status === KYC_STATUS.REJECTED ? String(rejectionReason).trim() : null;
  await kycRecord.save();

  // Update associated User - keep status synchronized
  const user = await User.findById(kycRecord.userId);
  if (user) {
    // AC: Duyệt KYC chỉ cập nhật user.kycStatus = APPROVED, KHÔNG THAY ĐỔI ROLE
    user.kycStatus = status;

    if (!user.kyc) {
      user.kyc = {};
    }

    if (status === KYC_STATUS.APPROVED) {
      user.kyc.verifiedAt = new Date();
      user.kyc.rejectionReason = null;
    } else if (status === KYC_STATUS.REJECTED) {
      user.kyc.rejectionReason = kycRecord.rejectionReason;
    }

    // Role is preserved exactly as is!
    await user.save();
  }

  return kycRecord;
};

/**
 * Get single KYC record by ID
 */
export const getKycRecordById = async (recordId) => {
  if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
    throw createError("ID hồ sơ KYC không hợp lệ", 400, "INVALID_ID");
  }

  const kycRecord = await KycRecord.findById(recordId).populate(
    "userId",
    "fullName email phoneNumber role kycStatus"
  );

  if (!kycRecord) {
    throw createError("Hồ sơ KYC không tồn tại", 404, "KYC_RECORD_NOT_FOUND");
  }

  return kycRecord;
};

/**
 * Get latest KYC record for a user
 */
export const getUserKycApplication = async (userId) => {
  const [kycRecord, user] = await Promise.all([
    KycRecord.findOne({ userId }).sort({ createdAt: -1 }),
    User.findById(userId).select("fullName email phoneNumber role kycStatus kyc"),
  ]);

  return {
    user,
    kycRecord,
  };
};

/**
 * List all KYC records (Admin)
 */
export const listKycRecords = async (query = {}) => {
  const { status, page = 1, limit = 20 } = query;
  const filter = {};
  if (status && Object.values(KYC_STATUS).includes(status)) {
    filter.status = status;
  }

  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const skip = (numericPage - 1) * numericLimit;

  const [records, total] = await Promise.all([
    KycRecord.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("userId", "fullName email phoneNumber role kycStatus"),
    KycRecord.countDocuments(filter),
  ]);

  return {
    records,
    pagination: {
      page: numericPage,
      limit: numericLimit,
      total,
      totalPages: Math.ceil(total / numericLimit),
    },
  };
};
