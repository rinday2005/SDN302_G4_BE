import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { JWT_SECRET, MONGO_URI } from "../../src/config/env.js";
import app from "../../src/app.js";

const DEFAULT_SECRET = JWT_SECRET || "ReUseHub_Auth_9xK7mP2q_2026";
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || MONGO_URI || "mongodb://127.0.0.1:27017/reuse_hub";

export const generateTestToken = (user) => {
  const payload = {
    id: user._id ? user._id.toString() : user.id,
    role: user.role,
  };
  return jwt.sign(payload, DEFAULT_SECRET, { expiresIn: "1h" });
};

export const connectTestDb = async () => {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  await mongoose.connect(TEST_MONGO_URI);
};

export const disconnectTestDb = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
};

export const isMongoAvailable = async () => {
  try {
    if (mongoose.connection.readyState === 1) return true;
    const conn = await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    return conn.connection.readyState === 1;
  } catch {
    return false;
  }
};

/**
 * Creates an ephemeral HTTP server for Express app integration tests
 */
export const createTestServer = async () => {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;
      const close = () => new Promise((res) => server.close(res));

      const request = async (path, options = {}) => {
        const url = `${baseUrl}${path}`;
        const headers = {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        };

        if (options.token) {
          headers.Authorization = `Bearer ${options.token}`;
        }

        const fetchOptions = {
          method: options.method || "GET",
          headers,
        };

        if (options.body) {
          fetchOptions.body = JSON.stringify(options.body);
        }

        const res = await fetch(url, fetchOptions);
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }

        return {
          status: res.status,
          ok: res.ok,
          headers: res.headers,
          data,
        };
      };

      resolve({ server, baseUrl, close, request });
    });
  });
};
