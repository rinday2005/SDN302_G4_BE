import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import User from "../user/user.model.js";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/env.js";

const register = async ({ email, password, fullName, phoneNumber, role }) => {
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    const error = new Error("Email already exists");
    error.statusCode = 409;
    error.errorCode = "EMAIL_ALREADY_EXISTS";
    throw error;
  }

  // Enforce single SHOP_OWNER policy in the system
  let assignedRole = "USER";
  if (role === "SHOP_OWNER") {
    const existingShopOwner = await User.findOne({ role: "SHOP_OWNER" });
    if (existingShopOwner) {
      const error = new Error("Shop owner already exists. Only one shop owner is allowed.");
      error.statusCode = 400;
      error.errorCode = "SHOP_OWNER_ALREADY_EXISTS";
      throw error;
    }
    assignedRole = "SHOP_OWNER";
  } else if (role === "ADMIN") {
    const error = new Error("Cannot register with ADMIN role");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    email,
    passwordHash,
    fullName,
    phoneNumber,
    role: assignedRole,
  });

  return {
    id: user._id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email });

  if (!user) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    error.errorCode = "INVALID_CREDENTIALS";
    throw error;
  }

  const isPasswordCorrect = await bcrypt.compare(
    password,
    user.passwordHash
  );

  if (!isPasswordCorrect) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    error.errorCode = "INVALID_CREDENTIALS";
    throw error;
  }

  const accessToken = jwt.sign(
    {
      id: user._id,
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
      email: user.email,
      fullName: user.fullName,
      role: user.role,
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

export {
  register,
  login,
  logout,
  getShopOwnerStatus,
};