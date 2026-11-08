import mongoose from "mongoose";

const disputeVerdictSchema = new mongoose.Schema(
  {
    disputeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dispute",
      index: true,
    },
    disputeCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "orderModel",
      index: true,
    },
    orderModel: {
      type: String,
      enum: ["RentalOrder", "ThriftOrder"],
      default: "RentalOrder",
    },
    orderCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    orderType: {
      type: String,
      enum: ["RENT", "THRIFT"],
      default: "RENT",
    },
    productName: {
      type: String,
      default: "",
    },
    renter: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      fullName: { type: String, default: "" },
      email: { type: String, default: "" },
      refundAmount: { type: Number, default: 0 },
      walletBalanceBefore: { type: Number, default: 0 },
      walletBalanceAfter: { type: Number, default: 0 },
    },
    shopOwner: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      shopName: { type: String, default: "" },
      payoutAmount: { type: Number, default: 0 },
      walletBalanceBefore: { type: Number, default: 0 },
      walletBalanceAfter: { type: Number, default: 0 },
    },
    escrowAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    claimAmount: {
      type: Number,
      default: 0,
    },
    resolutionPreset: {
      type: String,
      enum: ["opt_1", "opt_2", "opt_3", "custom"],
      default: "opt_1",
    },
    resolution: {
      type: String,
      required: true,
    },
    refundToRenter: {
      type: Number,
      default: 0,
    },
    payoutToShop: {
      type: Number,
      default: 0,
    },
    adminNotes: {
      type: String,
      default: "",
    },
    multiSigTxHash: {
      type: String,
      required: true,
      index: true,
    },
    signatures: [
      {
        signerRole: { type: String, default: "ADMIN_TRIBUNAL" },
        protocol: { type: String, default: "FIDO2 / SHA-256 Multi-Sig" },
        status: { type: String, default: "CONFIRMED" },
        signedAt: { type: Date, default: Date.now },
      },
    ],
    executedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    executedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["EXECUTED", "COMPLETED", "SETTLED"],
      default: "EXECUTED",
    },
  },
  {
    timestamps: true,
    collection: "dispute_verdicts",
  }
);

disputeVerdictSchema.index({ createdAt: -1 });

const DisputeVerdict =
  mongoose.models.DisputeVerdict ||
  mongoose.model("DisputeVerdict", disputeVerdictSchema);

export default DisputeVerdict;

