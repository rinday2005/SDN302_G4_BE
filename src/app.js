import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";

import routes from "./routes/index.js";
import errorMiddleware from "./middleware/error.middleware.js";

const app = express();

app.set("etag", false);

// Cross-origin allowed for static resources
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(morgan("dev"));

// Serve public images for mobile & web apps (public/images trước, src/assets/images làm dự phòng)
const publicImagesPath = path.resolve(process.cwd(), "../ReUseHubMobile/public/images");
const assetImagesPath = path.resolve(process.cwd(), "../ReUseHubMobile/src/assets/images");
app.use("/images", express.static(publicImagesPath));
app.use("/images", express.static(assetImagesPath));
app.use("/public/images", express.static(publicImagesPath));

app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.use("/", routes);

app.use((req, res, next) => {
  const error = new Error("Route not found");
  error.statusCode = 404;
  error.errorCode = "ROUTE_NOT_FOUND";

  next(error);
});

app.use(errorMiddleware);

export default app;
