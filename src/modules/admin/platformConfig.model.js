import mongoose from "mongoose";

const platformConfigSchema = new mongoose.Schema(
  {
    rentFeePercent: {
      type: Number,
      required: true,
      default: 10,
      min: 0,
      max: 100,
    },
    thriftFeePercent: {
      type: Number,
      required: true,
      default: 8,
      min: 0,
      max: 100,
    },
    description: {
      type: String,
      trim: true,
      default: "Cấu hình tỷ lệ % phí sàn ReUse Hub cho RENT và THRIFT",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "platformConfigs",
  }
);

const PlatformConfig =
  mongoose.models.PlatformConfig ||
  mongoose.model("PlatformConfig", platformConfigSchema);

export default PlatformConfig;
