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

    address: {
      type: addressSchema,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "users",
  }
);

// Ensure only one user can have the role SHOP_OWNER in the database
userSchema.index(
  { role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: "SHOP_OWNER" },
  }
);

const User = mongoose.model("User", userSchema);

export default User;