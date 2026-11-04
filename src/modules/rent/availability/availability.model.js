import mongoose from "mongoose";

const rentalAvailabilitySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalProduct",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalOrder",
      default: null,
      index: true,
    },
    shopOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    blockedQuantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ["HOLD", "BLOCKED", "RELEASED"],
      default: "BLOCKED",
      index: true,
    },
    reason: {
      type: String,
      enum: ["MAINTENANCE", "CLEANING", "RESERVED", "OUT_OF_STOCK", "HOLD_SLOT", "OTHER"],
      default: "MAINTENANCE",
    },
    // Trường phục vụ MongoDB TTL Index: Tự động xóa document Temporary Hold Slot khi quá hạn mà chưa thanh toán
    // Khi đơn hàng đã PAID, trường này được set về null để khóa lịch cố định suốt kỳ thuê
    expiresAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

rentalAvailabilitySchema.index({ productId: 1, startDate: 1, endDate: 1 });
// MongoDB TTL Index: tự động xóa bản ghi giữ chỗ tạm thời ngay tại thời điểm expiresAt (expireAfterSeconds: 0)
rentalAvailabilitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RentalAvailability =
  mongoose.models.RentalAvailability ||
  mongoose.model("RentalAvailability", rentalAvailabilitySchema);

export default RentalAvailability;
