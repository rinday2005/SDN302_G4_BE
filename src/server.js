
import http from "http";
import app from "./app.js";
import { PORT } from "./config/env.js";
import connectDB from "./config/db.js";
import { initSocketServer } from "./modules/chat/chat.socket.js";
import { startHoldSlotCleanupJob } from "./modules/rent/availability/availability.service.js";

const startServer = async () => {
    try {
        // 1. Connect MongoDB
        await connectDB();

        // 2. Start cleanup job for expired rental hold slots
        startHoldSlotCleanupJob(60 * 1000);

        // 3. Create HTTP server
        const server = http.createServer(app);

        // 4. Initialize Socket.IO
        initSocketServer(server);

        // 5. Start server
        server.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
        });

    } catch (error) {
        console.error("Failed to start server:", error.message);
        process.exit(1);
    }
};

startServer();