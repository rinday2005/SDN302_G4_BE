import mongoose from "mongoose";

const lockAppealSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    fullName: {
      type: String,
      trim: true,
      default: "",
    },
    question: {
      type: String,
      required: true,
      trim: true,
    },
    details: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["PENDING", "RESOLVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    lockReason: {
      type: String,
      trim: true,
      default: "",
    },
    adminReply: {
      type: String,
      trim: true,
      default: "",
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "appeals",
  }
);

const LockAppeal =
  mongoose.models.LockAppeal || mongoose.model("LockAppeal", lockAppealSchema);

export default LockAppeal;

