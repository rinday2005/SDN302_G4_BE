import LockAppeal from "../user/lockAppeal.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import User from "../user/user.model.js";
import Cart from "../cart/cart.model.js";
import Wishlist from "../wishlist/wishlist.model.js";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/env.js";

const ensureUserCartAndWishlist = async (userId) => {
  await Promise.all([
    Cart.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, rentItems: [], thriftItems: [] } },
      { upsert: true, returnDocument: "after" }
    ),
    Wishlist.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, items: [] } },
      { upsert: true, returnDocument: "after" }
    ),
  ]);
};

const register = async ({ email, password, fullName, phoneNumber, role, shopName, businessAddress, province }) => {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const existingUser = await User.findOne({ email: cleanEmail });

  if (existingUser) {
    const error = new Error("Email already exists");
    error.statusCode = 409;
    error.errorCode = "EMAIL_ALREADY_EXISTS";
    throw error;
  }

  // Multi-vendor marketplace: multiple SHOP_OWNER accounts are fully supported
  let assignedRole = "USER";
  if (role === "SHOP_OWNER") {
    assignedRole = "SHOP_OWNER";
  } else if (role === "ADMIN") {
    const error = new Error("Cannot register with ADMIN role");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const userData = {
    email: cleanEmail,
    passwordHash,
    fullName: String(fullName || "").trim(),
    phoneNumber: String(phoneNumber || "").trim(),
    role: assignedRole,
  };

  if (assignedRole === "SHOP_OWNER") {
    const sName = String(shopName || fullName || "").trim() || "Cửa hàng ReUse";
    const bAddress = String(businessAddress || "").trim();
    const prov = String(province || "").trim();

    userData.shopProfile = {
      shopName: sName,
      businessAddress: bAddress,
      cityRegion: prov ? `${prov}, Việt Nam` : "Việt Nam",
      hotline: String(phoneNumber || "").trim(),
      operatingHours: "08:00 - 20:00 (Thứ 2 - Chủ Nhật)",
      rating: 5.0,
      establishedYear: new Date().getFullYear(),
    };

    if (prov || bAddress) {
      userData.address = {
        province: prov,
        district: "",
        ward: "",
        detail: bAddress,
      };
    }
  }

  const user = await User.create(userData);

  await ensureUserCartAndWishlist(user._id);

  return {
    id: user._id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
};

const login = async ({ email, password }) => {
  const cleanEmail = String(email || "").trim();
  const normalizedEmail = cleanEmail.toLowerCase();
  const inputPassword = String(password || "").trim();

  if (!cleanEmail || !inputPassword) {
    const error = new Error("Vui lòng nhập đầy đủ email và mật khẩu");
    error.statusCode = 400;
    error.errorCode = "INVALID_CREDENTIALS";
    throw error;
  }

  let user = await User.findOne({ email: normalizedEmail });
  if (!user && cleanEmail) {
    user = await User.findOne({ email: cleanEmail });
  }

  if (!user) {
    const error = new Error("Tài khoản chưa được đăng ký hoặc mật khẩu không chính xác");
    error.statusCode = 401;
    error.errorCode = "INVALID_CREDENTIALS";
    throw error;
  }

  // Raw doc check in case legacy field 'password' exists
  const rawDoc = user._doc || user;
  const legacyPassword = rawDoc.password;
  const hashToCompare = user.passwordHash || legacyPassword;

  let isPasswordCorrect = false;

  if (
    hashToCompare &&
    (hashToCompare.startsWith("$2a$") ||
      hashToCompare.startsWith("$2b$") ||
      hashToCompare.startsWith("$2y$"))
  ) {
    isPasswordCorrect = await bcrypt.compare(inputPassword, hashToCompare);
  } else if (hashToCompare) {
    // Plain text comparison fallback (cho các tài khoản legacy)
    isPasswordCorrect = inputPassword === hashToCompare;
  }

  if (!isPasswordCorrect) {
    const error = new Error("Tài khoản chưa được đăng ký hoặc mật khẩu không chính xác");
    error.statusCode = 401;
    error.errorCode = "INVALID_CREDENTIALS";
    throw error;
  }

  // Auto-upgrade / sync passwordHash to ensure user can log in consistently
  if (inputPassword) {
    try {
      const isAlreadyMatching =
        user.passwordHash &&
        user.passwordHash.startsWith("$2b$") &&
        (await bcrypt.compare(inputPassword, user.passwordHash));

      if (!isAlreadyMatching) {
        user.passwordHash = await bcrypt.hash(inputPassword, 10);
        if (rawDoc.password) {
          user.set("password", undefined, { strict: false });
        }
        await user.save();
      }
    } catch {
      // Continue even if save fails
    }
  }

  // Ensure 1 user = 1 cart & 1 wishlist on every login
  try {
    await ensureUserCartAndWishlist(user._id);
  } catch {
    // Non-blocking
  }

  // Kiểm tra tài khoản có bị tạm khóa hay không (Lưu trạng thái trong MongoDB)
  if (user.status === "lock" || user.status === "locked" || user.status === "LOCKED" || user.status === "SUSPENDED" || user.isLocked) {
    const error = new Error("Tài khoản của bạn đã bị tạm khóa bởi Quản trị viên");
    error.statusCode = 403;
    error.errorCode = "ACCOUNT_LOCKED";
    error.data = {
      isLocked: true,
      email: user.email,
      fullName: user.fullName,
      lockReason: user.lockReason || "Tài khoản bị tạm khóa để kiểm tra bảo mật hoặc rà soát giao dịch",
      lockedAt: user.lockedAt,
      lockAppeal: user.lockAppeal || null,
    };
    throw error;
  }

  const accessToken = jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
    }
  );

  return {
    accessToken,
    user: {
      id: user._id,
      _id: user._id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber || null,
      phone: user.phoneNumber || null,
      avatarUrl: user.avatarUrl || null,
      role: user.role,
      kycStatus: user.kycStatus || null,
      isKycVerified: user.kycStatus === "APPROVED",
      shopProfile: user.shopProfile || null,
      address: user.address || null,
    },
  };
};

const logout = async () => {
  return {
    message: "Logout successful",
  };
};

const getShopOwnerStatus = async () => {
  const shopOwner = await User.findOne({ role: "SHOP_OWNER" }).select(
    "fullName email phoneNumber address avatarUrl createdAt"
  );

  return {
    hasShopOwner: Boolean(shopOwner),
    shopOwner: shopOwner || null,
  };
};

/**
 * Người dùng gửi khiếu nại / đề nghị Admin xem xét mở khóa tài khoản
 */
const appealAccountLock = async ({ email, question, details }) => {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    const error = new Error("Không tìm thấy tài khoản với email này");
    error.statusCode = 404;
    error.errorCode = "USER_NOT_FOUND";
    throw error;
  }

  if (user.status !== "lock" && user.status !== "locked" && user.status !== "LOCKED" && user.status !== "SUSPENDED" && !user.isLocked) {
    const error = new Error("Tài khoản này hiện đang hoạt động bình thường, không bị khóa");
    error.statusCode = 400;
    error.errorCode = "ACCOUNT_NOT_LOCKED";
    throw error;
  }

  const submittedAt = new Date();
  const appealQuestion = String(question || "Tôi không vi phạm quy tắc cộng đồng, đề nghị kiểm tra lại lý do khóa.").trim();
  const appealDetails = String(details || "").trim();

  // 1. Lưu bản ghi đơn khiếu nại vào collection 'appeals' trong MongoDB
  const savedAppeal = await LockAppeal.create({
    userId: user._id,
    email: user.email,
    fullName: user.fullName || "",
    question: appealQuestion,
    details: appealDetails,
    lockReason: user.lockReason || "Tài khoản bị tạm khóa để kiểm tra an toàn hoặc rà soát vi phạm",
    status: "PENDING",
    adminReply: "",
    submittedAt,
    resolvedAt: null,
  });

  // 2. Đồng thời cập nhật trường lockAppeal trên bản ghi User trong MongoDB
  user.lockAppeal = {
    appealId: savedAppeal._id,
    question: savedAppeal.question,
    details: savedAppeal.details,
    submittedAt: savedAppeal.submittedAt,
    status: "PENDING",
    adminReply: "",
    resolvedAt: null,
  };
  user.markModified("lockAppeal");
  await user.save();

  return {
    success: true,
    message: "Đề nghị mở khóa tài khoản đã được lưu vào cơ sở dữ liệu và ghi nhận thành công. Quản trị viên sẽ kiểm tra và phản hồi sớm nhất qua email của bạn.",
    lockAppeal: user.lockAppeal,
    appealId: savedAppeal._id,
  };
};

export {
  register,
  login,
  logout,
  getShopOwnerStatus,
  appealAccountLock,
};
