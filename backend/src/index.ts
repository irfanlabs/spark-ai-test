import express from "express";
import cors from "cors";
import http from "http";
import { env } from "./config/env.js";
import { requestLogger } from "./middleware/logger.js";
import { apiRateLimiter } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import { attachChatWebSocket } from "./ws/chatWs.js";
import { ensureDemoUser } from "./services/userService.js";
import { pool } from "./db/pool.js";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);
app.use(apiRateLimiter);

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "disconnected" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/chat", chatRoutes);

app.use(errorHandler);

const server = http.createServer(app);
attachChatWebSocket(server);

async function start(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    await ensureDemoUser();
  } catch (err) {
    console.warn("[startup] Database not ready yet:", err);
  }

  server.listen(env.port, () => {
    console.log(`[api] Server running on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
