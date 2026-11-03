import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    province: {
      type: String,
      trim: true,
    },
    district: {
      type: String,
      trim: true,
    },
    ward: {
      type: String,
      trim: true,
    },
    detail: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
    },

    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },

    phoneNumber: {
      type: String,
      trim: true,
    },

    role: {
      type: String,
      enum: ["USER", "SHOP_OWNER", "ADMIN"],
      default: "USER",
    },

    kyc: {
      citizenId: { type: String, trim: true },
      fullName: { type: String, trim: true },
      dob: { type: String, trim: true },
      idType: { type: String, default: "Căn cước công dân gắn chip (CCCD)" },
      residentAddress: { type: String, trim: true },
      cardFrontUrl: { type: String, trim: true },
      cardBackUrl: { type: String, trim: true },
      livenessUrl: { type: String, trim: true },
      kycCode: { type: String, trim: true },
      tier: { type: String, enum: ["TIER_1", "TIER_2", "TIER_3"], default: "TIER_2" },
      creditLimit: { type: Number, default: 50000000 },
      rejectionReason: { type: String, trim: true },
      submittedAt: { type: Date },
      verifiedAt: { type: Date },
    },

    kycStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: null,
    },

    avatarUrl: {
      type: String,
      trim: true,
    },

    avatarPublicId: {
      type: String,
      trim: true,
    },

    address: {
      type: addressSchema,
      default: null,
    },

    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "LOCKED", "SUSPENDED", "lock", "locked", "active"],
      default: "ACTIVE",
    },

    isLocked: {
      type: Boolean,
      default: false,
    },

    lockReason: {
      type: String,
      trim: true,
      default: "",
    },

    lockedAt: {
      type: Date,
      default: null,
    },

    lockAppeal: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    shopProfile: {
      shopName: {
        type: String,
        trim: true,
        default: "",
      },
      description: {
        type: String,
        trim: true,
        default: "",
      },
      specialization: {
        type: String,
        trim: true,
        default: "",
      },
      roleTitle: {
        type: String,
        trim: true,
        default: "Master Curator & Archival Custodian",
      },
      secondaryEmail: {
        type: String,
        trim: true,
        default: "",
      },
      businessAddress: {
        type: String,
        trim: true,
        default: "",
      },
      cityRegion: {
        type: String,
        trim: true,
        default: "Ho Chi Minh City, Vietnam",
      },
      coverUrl: {
        type: String,
        trim: true,
        default: "",
      },
      slogan: {
        type: String,
        trim: true,
        default: "",
      },
      hotline: {
        type: String,
        trim: true,
        default: "",
      },
      operatingHours: {
        type: String,
        trim: true,
        default: "08:00 - 20:00 (Thứ 2 - Chủ Nhật)",
      },
      website: {
        type: String,
        trim: true,
        default: "",
      },
      returnPolicy: {
        type: String,
        trim: true,
        default: "Đồng kiểm khi nhận hàng, hoàn cọc trong 24h sau khi hoàn tất kiểm định thiết bị.",
      },
      shippingCommitment: {
        type: String,
        trim: true,
        default: "Đóng gói bưu tá chuyên dụng Nanuk chống sốc và niêm phong chì bảo mật.",
      },
      rating: {
        type: Number,
        default: 5.0,
      },
      establishedYear: {
        type: Number,
        default: 2024,
      },
    },
  },
  {
    timestamps: true,
    collection: "users",
  }
);

// Multiple SHOP_OWNER accounts are supported in multi-vendor marketplace model

const User = mongoose.model("User", userSchema);

export default User;
