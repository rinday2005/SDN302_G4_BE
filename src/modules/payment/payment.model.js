import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalOrder",
      required: [true, "orderId là bắt buộc"],
      index: true,
    },
    orderType: {
      type: String,
      enum: ["RENT", "THRIFT"],
      default: "RENT",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId là bắt buộc"],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "amount là bắt buộc"],
      min: [0, "amount phải lớn hơn hoặc bằng 0"],
    },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING",
      index: true,
    },
    method: {
      type: String,
      enum: ["VNPAY", "COD", "MOMO", "BANK_TRANSFER"],
      default: "VNPAY",
    },
    txnRef: {
      type: String,
      required: [true, "txnRef là bắt buộc"],
      unique: true,
      trim: true,
    },
    transactionNo: {
      type: String,
      default: "",
      trim: true,
    },
    bankCode: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    vnpResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "payments",
  }
);

paymentSchema.index({ orderId: 1, status: 1 });

const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

export { Payment };
export default Payment;
