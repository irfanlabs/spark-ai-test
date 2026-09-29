import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "../utils/jwt.js";
import {
  addMessage,
  createSession,
  getSession,
  listMessages,
  updateSessionMetadata,
} from "../services/chatService.js";
import { generateAssistantReply } from "../services/aiService.js";
import { createAppointment } from "../services/appointmentService.js";

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
          const { sessionId, content, confirmBooking } = parsed;
          const userMsg = await addMessage({
            sessionId,
            userId,
            role: "user",
            content,
          });

          const historyRows = await listMessages(sessionId, userId);
          const history = historyRows
            .filter((m) => m.id !== userMsg.id)
            .map((m) => ({ role: m.role, content: m.content }));

          const ai = await generateAssistantReply({
            userMessage: content,
            history,
            sessionId,
            userId,
          });

          let appointment = null;
          const draft = ai.booking;
          const readyToBook =
            draft.intent === "book" &&
            draft.missingFields.length === 0 &&
            draft.startsAt &&
            draft.endsAt &&
            draft.title;

          if (readyToBook && confirmBooking) {
            appointment = await createAppointment({
              userId,
              title: draft.title!,
              description: draft.description,
              startsAt: new Date(draft.startsAt!),
              endsAt: new Date(draft.endsAt!),
              source: "chat",
            });
            await updateSessionMetadata(sessionId, userId, {
              lastBookedAppointmentId: appointment.id,
            });
          }

          let assistantContent = ai.reply;
          if (readyToBook && !confirmBooking) {
            assistantContent +=
              "\n\nReply yes or tap Confirm booking when you're ready.";
          }
          if (appointment) {
            assistantContent += `\n\nBooked: ${appointment.title} on ${new Date(appointment.starts_at).toLocaleString()}.`;
          }

          const assistantMsg = await addMessage({
            sessionId,
            userId,
            role: "assistant",
            content: assistantContent,
            metadata: {
              booking: draft,
              appointmentId: appointment?.id ?? null,
              provider: ai.usedProvider,
            },
          });

          send(ws, {
            type: "chat_result",
            payload: {
              userMessage: userMsg,
              assistantMessage: assistantMsg,
              booking: draft,
              appointment,
              needsConfirmation: Boolean(readyToBook && !confirmBooking),
            },
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
