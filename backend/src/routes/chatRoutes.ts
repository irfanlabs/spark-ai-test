import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { chatRateLimiter } from "../middleware/rateLimit.js";
import {
  createSession,
  listMessages,
  listSessions,
} from "../services/chatService.js";
import { processChatTurn } from "../services/chatProcessor.js";

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
      const result = await processChatTurn({
        sessionId: req.params.sessionId,
        userId: req.user!.sub,
        content: (req.body as z.infer<typeof sendSchema>).content,
        confirmBooking: (req.body as z.infer<typeof sendSchema>).confirmBooking,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
