import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { chatRateLimiter } from "../middleware/rateLimit.js";
import {
  addMessage,
  createSession,
  listMessages,
  listSessions,
  updateSessionMetadata,
} from "../services/chatService.js";
import { generateAssistantReply } from "../services/aiService.js";
import { createAppointment } from "../services/appointmentService.js";

const router = Router();

router.use(authenticate);

router.get("/sessions", async (req, res, next) => {
  try {
    const sessions = await listSessions(req.user!.sub);
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

router.post("/sessions", async (req, res, next) => {
  try {
    const session = await createSession(req.user!.sub);
    res.status(201).json({ session });
  } catch (err) {
    next(err);
  }
});

router.get("/sessions/:sessionId/messages", async (req, res, next) => {
  try {
    const messages = await listMessages(req.params.sessionId, req.user!.sub);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

const sendSchema = z.object({
  content: z.string().min(1).max(4000),
  confirmBooking: z.boolean().optional(),
});

router.post(
  "/sessions/:sessionId/messages",
  chatRateLimiter,
  validate(sendSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;
      const sessionId = req.params.sessionId;
      const { content, confirmBooking } = req.body as z.infer<typeof sendSchema>;

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
        assistantContent += "\n\nReply **yes** or use **Confirm booking** when you're ready.";
      }
      if (appointment) {
        assistantContent += `\n\n✓ Booked: ${appointment.title} on ${new Date(appointment.starts_at).toLocaleString()}.`;
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

      res.status(201).json({
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        booking: draft,
        appointment,
        needsConfirmation: Boolean(readyToBook && !confirmBooking),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
