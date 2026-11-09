import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";

import routes from "./routes/index.js";
import errorMiddleware from "./middleware/error.middleware.js";

const app = express();

app.set("etag", false);

// Frontend URLs
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "https://sdn-302-g4-fe.vercel.app",
  process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, "") : null,
].filter(Boolean);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = origin.replace(/\/$/, "");
      if (
        allowedOrigins.includes(normalizedOrigin) ||
        normalizedOrigin.endsWith(".vercel.app") ||
        normalizedOrigin.endsWith(".onrender.com")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

// Security
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

// Body parsers
app.use(express.json({ limit: "25mb" }));
app.use(
  express.urlencoded({
    extended: true,
    limit: "25mb",
  })
);

app.use(morgan("dev"));

// Health check & Root routes (supports both GET and HEAD for Render health checks)
app.get(["/", "/health", "/api"], (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to ReUse Hub API",
    status: "ok",
    environment: process.env.NODE_ENV || "development",
  });
});

// Serve public images for mobile & web apps
const publicImagesPath = path.resolve(
  process.cwd(),
  "../ReUseHubMobile/public/images"
);

const assetImagesPath = path.resolve(
  process.cwd(),
  "../ReUseHubMobile/src/assets/images"
);

app.use("/images", express.static(publicImagesPath));
app.use("/images", express.static(assetImagesPath));
app.use("/public/images", express.static(publicImagesPath));

// Payment redirect
app.get(
  ["/payment-success", "/payment-failed", "/payment-return"],
  (req, res) => {
    const defaultFeUrl =
      process.env.RENDER || process.env.NODE_ENV === "production"
        ? "https://sdn-302-g4-fe.vercel.app"
        : "http://localhost:5173";
    const frontendUrl = process.env.FRONTEND_URL || defaultFeUrl;

    return res.redirect(
      `${frontendUrl.replace(/\/$/, "")}${req.originalUrl}`
    );
  }
);

// Normalize API prefix so requests work whether VITE_API_URL has /api or not
const API_MODULE_PREFIXES = [
  "/auth",
  "/categories",
  "/admin",
  "/products",
  "/rent",
  "/reviews",
  "/thrift",
  "/thrift-orders",
  "/thrift-listings",
  "/cart",
  "/payments",
  "/payment",
  "/upload",
  "/users",
  "/wishlist",
  "/kyc",
  "/chat",
  "/notifications",
  "/notification",
  "/ai",
  "/shop",
  "/orders",
  "/order-groups",
];

app.use((req, res, next) => {
  if (req.url.startsWith("/api/api/")) {
    req.url = req.url.replace(/^\/api\/api\//, "/api/");
  } else if (
    !req.url.startsWith("/api/") &&
    req.url !== "/api" &&
    API_MODULE_PREFIXES.some(
      (prefix) =>
        req.url === prefix ||
        req.url.startsWith(`${prefix}/`) ||
        req.url.startsWith(`${prefix}?`)
    )
  ) {
    req.url = `/api${req.url}`;
  }
  next();
});

// API cache control
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// API routes
app.use("/", routes);

// 404 handler
app.use((req, res, next) => {
  const error = new Error("Route not found");
  error.statusCode = 404;
  error.errorCode = "ROUTE_NOT_FOUND";

  next(error);
});

// Global error handler
app.use(errorMiddleware);

export default app;