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

// VNPay Sandbox Configuration
export const VNPAY_TMN_CODE = process.env.VNPAY_TMN_CODE || "CGXZLS0Z";
export const VNPAY_HASH_SECRET = process.env.VNPAY_HASH_SECRET || "XNBCJFAKAZQSGTARRLGCHVZWCIOIGSHN";
export const VNPAY_URL = process.env.VNPAY_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
export const VNPAY_RETURN_URL = process.env.VNPAY_RETURN_URL || "http://localhost:5000/api/payments/vnpay-return";
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";