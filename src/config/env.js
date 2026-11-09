import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT || 5000;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const MONGO_URI = process.env.MONGO_URI;

export const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const isHostedEnv = Boolean(
  process.env.RENDER ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RENDER_SERVICE_ID ||
    process.env.NODE_ENV === "production"
);

const isLocalhostUrl = (url = "") =>
  url.includes("localhost") || url.includes("127.0.0.1");

// VNPay Configuration
export const VNPAY_TMN_CODE = process.env.VNPAY_TMN_CODE;
export const VNPAY_HASH_SECRET = process.env.VNPAY_HASH_SECRET;
export const VNPAY_URL = process.env.VNPAY_URL;

const defaultBackendBaseUrl = (
  process.env.RENDER_EXTERNAL_URL ||
  (isHostedEnv ? "https://sdn302-g4-be.onrender.com" : "http://localhost:5000")
).replace(/\/$/, "");

export const VNPAY_RETURN_URL =
  process.env.VNPAY_RETURN_URL &&
  !(isHostedEnv && isLocalhostUrl(process.env.VNPAY_RETURN_URL))
    ? process.env.VNPAY_RETURN_URL
    : `${defaultBackendBaseUrl}/api/payments/vnpay-return`;

const defaultFrontendUrl = isHostedEnv
  ? "https://sdn-302-g4-fe.vercel.app"
  : "http://localhost:5173";

export const FRONTEND_URL =
  process.env.FRONTEND_URL &&
  !process.env.FRONTEND_URL.includes("localhost:3000") &&
  !process.env.FRONTEND_URL.includes("127.0.0.1:3000") &&
  !(isHostedEnv && isLocalhostUrl(process.env.FRONTEND_URL))
    ? process.env.FRONTEND_URL
    : defaultFrontendUrl;

