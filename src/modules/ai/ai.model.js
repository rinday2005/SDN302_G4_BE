import mongoose from "mongoose";

const aiMessageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    sender: { type: String, enum: ["user", "ai"], required: true },
    text: { type: String, default: "" },
    timestamp: { type: String, default: "" },
    bannerTitle: { type: String },
    bannerSubtitle: { type: String },
    recommendations: { type: Array, default: [] },
    comparison: { type: mongoose.Schema.Types.Mixed },
    costBreakdown: { type: mongoose.Schema.Types.Mixed },
    orderSummaries: { type: Array, default: [] },
    quickFollowUps: { type: [String], default: [] },
  },
  { _id: false }
);

const aiConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    title: {
      type: String,
      trim: true,
      default: "Hội thoại tư vấn ReUse AI",
    },
    preferences: {
      maxDailyRentBudget: { type: Number, default: 300000 },
      travelDaysDefault: { type: Number, default: 4 },
      preferredLocation: { type: String, default: "Đà Nẵng" },
    },
    messages: {
      type: [aiMessageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "aiConversations",
  }
);

const AIConversation =
  mongoose.models.AIConversation ||
  mongoose.model("AIConversation", aiConversationSchema);

export default AIConversation;

