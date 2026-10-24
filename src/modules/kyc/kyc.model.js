import mongoose from "mongoose";

export const KYC_STATUS = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
});

const kycRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    idCardNumber: {
      type: String,
      required: [true, "idCardNumber is required"],
      trim: true,
    },
    frontImageUrl: {
      type: String,
      required: [true, "frontImageUrl is required"],
      trim: true,
    },
    backImageUrl: {
      type: String,
      required: [true, "backImageUrl is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(KYC_STATUS),
      default: KYC_STATUS.PENDING,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "kycRecords",
  }
);

kycRecordSchema.index({ userId: 1, createdAt: -1 });
kycRecordSchema.index({ status: 1, createdAt: -1 });

const KycRecord =
  mongoose.models.KycRecord || mongoose.model("KycRecord", kycRecordSchema);

export default KycRecord;
