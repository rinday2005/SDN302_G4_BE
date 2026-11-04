import http from "http";
import app from "./app.js";
import { PORT } from "./config/env.js";
import connectDB from "./config/db.js";
import { initSocketServer } from "./modules/chat/chat.socket.js";
import { startHoldSlotCleanupJob } from "./modules/rent/availability/availability.service.js";

const startServer = async () => {
  try {
    await connectDB();
    startHoldSlotCleanupJob(60 * 1000);

    const server = http.createServer(app);
    initSocketServer(server);

    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();