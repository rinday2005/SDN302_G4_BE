import mongoose from "mongoose";

const rentalReturnSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalOrder",
      required: true,
      index: true,
    },
    orderCode: {
      type: String,
      required: true,
      index: true,
    },
    renterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    shopOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "RentalProduct",
        },
        productName: String,
        condition: {
          type: String,
          enum: ["PERFECT", "GOOD", "MINOR_WEAR", "SCRATCHED", "DAMAGED", "MISSING_PARTS"],
          default: "GOOD",
        },
        checklist: [Boolean],
        photos: [String],
        note: String,
      },
    ],
    evidenceImages: [
      {
        type: String,
      },
    ],
    renterNote: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "RETURN_REQUESTED", // Đã gửi yêu cầu trả hàng
        "RETURNING",        // Bưu tá đang thu hồi kiện hàng
        "IN_INSPECTION",    // Bench Lab đang kiểm định
        "APPROVED",         // Kiểm định đạt chuẩn, hoàn cọc
        "PARTIAL_REFUND",   // Trừ một phần cọc do hao mòn/lỗi
        "REJECTED",         // Từ chối hoàn cọc do vi phạm nặng
      ],
      default: "RETURN_REQUESTED",
      index: true,
    },
    pickupDetails: {
      carrier: { type: String, default: "ReUse Logistics / ViettelPost" },
      trackingCode: String,
      pickupDate: Date,
      address: String,
    },
    inspectionResult: {
      inspectorName: { type: String, default: "Bench Lab QA Specialist" },
      inspectedAt: Date,
      conditionGrade: { type: String, default: "Grade A" },
      isApproved: { type: Boolean, default: true },
      deductionAmount: { type: Number, default: 0 },
      refundAmount: { type: Number, default: 0 },
      inspectorNotes: String,
      inspectionPhotos: [String],
    },
  },
  {
    timestamps: true,
  }
);

rentalReturnSchema.index({ renterId: 1, createdAt: -1 });
rentalReturnSchema.index({ shopOwnerId: 1, createdAt: -1 });

const RentalReturn = mongoose.model("RentalReturn", rentalReturnSchema);

export default RentalReturn;
