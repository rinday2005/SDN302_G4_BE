import mongoose from "mongoose";

/**
 * [BE-S6-02] In-app Notification Model
 * Collection notifications gồm userId, title, message, type, link, isRead.
 */
export const NOTIFICATION_TYPE = {
  RENTAL_ORDER: "RENTAL_ORDER",
  THRIFT_ORDER: "THRIFT_ORDER",
  PAYMENT: "PAYMENT",
  KYC: "KYC",
  LISTING: "LISTING",
  RETURN: "RETURN",
  REFUND: "REFUND",
  SYSTEM: "SYSTEM",
};

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      default: NOTIFICATION_TYPE.SYSTEM,
      index: true,
    },
    link: {
      type: String,
      default: "",
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
