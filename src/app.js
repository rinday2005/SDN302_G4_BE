import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import routes from "./routes/index.js";
import errorMiddleware from "./middleware/error.middleware.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.use("/", routes);

app.use((req, res, next) => {
  const error = new Error("Route not found");
  error.statusCode = 404;
  error.errorCode = "ROUTE_NOT_FOUND";

  next(error);
});

app.use(errorMiddleware);

export default app;