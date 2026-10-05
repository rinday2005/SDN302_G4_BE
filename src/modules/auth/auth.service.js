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

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    email,
    passwordHash,
    fullName,
    phoneNumber,
    role: role || "USER"
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

export {
  register,
  login,
  logout,
};