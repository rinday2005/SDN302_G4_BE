import mongoose from "mongoose";

const rentalAvailabilitySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalProduct",
      required: true,
      index: true,
    },
    shopOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
    reason: {
      type: String,
      enum: ["MAINTENANCE", "CLEANING", "RESERVED", "OUT_OF_STOCK", "OTHER"],
      default: "MAINTENANCE",
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

const RentalAvailability = mongoose.model("RentalAvailability", rentalAvailabilitySchema);

export default RentalAvailability;
