import http from "http";
import app from "./app.js";
import { PORT } from "./config/env.js";
import connectDB from "./config/db.js";
import { initSocketServer } from "./modules/chat/chat.socket.js";
import { startHoldSlotCleanupJob } from "./modules/rent/availability/availability.service.js";

// Khởi động forwarder dự phòng trên port 3000 để tự động chuyển tiếp request về port 5173 nếu có request nhầm sang 3000
const startPort3000Forwarder = () => {
  try {
    const forwarder = http.createServer((req, res) => {
      res.writeHead(302, {
        Location: `http://localhost:5173${req.url}`,
      });
      res.end();
    });
    forwarder.on("error", () => {
      // Bỏ qua nếu port 3000 đang được tiến trình khác sử dụng
    });
    forwarder.listen(3000, () => {
      console.log("Port 3000 forwarder active -> tự động chuyển hướng sang http://localhost:5173");
    });
  } catch {}
};

const startServer = async () => {
  try {
    await connectDB();
    startHoldSlotCleanupJob(60 * 1000);
    startPort3000Forwarder();

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