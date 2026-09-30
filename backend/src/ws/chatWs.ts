import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "../utils/jwt.js";
import {
  createSession,
  getSession,
  listMessages,
} from "../services/chatService.js";
import { processChatTurn } from "../services/chatProcessor.js";

type ClientMessage =
  | { type: "ping" }
  | { type: "join"; sessionId?: string }
  | { type: "chat"; sessionId: string; content: string; confirmBooking?: boolean };

type ServerMessage =
  | { type: "pong" }
  | { type: "joined"; sessionId: string }
  | { type: "messages"; messages: unknown[] }
  | { type: "chat_result"; payload: unknown }
  | { type: "error"; message: string };

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function attachChatWebSocket(server: Server, path = "/ws"): void {
  const wss = new WebSocketServer({ server, path });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) {
      ws.close(4401, "Missing token");
      return;
    }

    let userId: string;
    try {
      userId = verifyToken(token).sub;
    } catch {
      ws.close(4401, "Invalid token");
      return;
    }

    ws.on("message", async (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as ClientMessage;

        if (parsed.type === "ping") {
          send(ws, { type: "pong" });
          return;
        }

        if (parsed.type === "join") {
          let sessionId = parsed.sessionId;
          if (sessionId) {
            const session = await getSession(userId, sessionId);
            if (!session) {
              send(ws, { type: "error", message: "Session not found" });
              return;
            }
          } else {
            const session = await createSession(userId);
            sessionId = session.id;
          }
          const messages = await listMessages(sessionId, userId);
          send(ws, { type: "joined", sessionId });
          send(ws, { type: "messages", messages });
          return;
        }

        if (parsed.type === "chat") {
          const result = await processChatTurn({
            sessionId: parsed.sessionId,
            userId,
            content: parsed.content,
            confirmBooking: parsed.confirmBooking,
          });

          send(ws, {
            type: "chat_result",
            payload: result,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "WebSocket handler error";
        send(ws, { type: "error", message });
      }
    });
  });

  console.log(`[ws] Chat WebSocket listening on ${path}`);
}
