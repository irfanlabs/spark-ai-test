import { env } from "../config/env.js";
import { pool } from "../db/pool.js";

export type ExtractedBooking = {
  intent: "book" | "question" | "unknown";
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  missingFields: string[];
  confidence: number;
};

export type AiChatResult = {
  reply: string;
  booking: ExtractedBooking;
  usedProvider: "openrouter" | "mock";
};

function buildSystemPrompt(context: {
  nowIso: string;
  pendingBooking?: { title: string; startsAt: string; endsAt: string } | null;
}): string {
  const pendingLine = context.pendingBooking
    ? `Pending booking awaiting user confirmation: ${JSON.stringify(context.pendingBooking)}. Do not change these times unless the user asks to modify them.`
    : "No pending booking awaiting confirmation.";

  return `You are an appointment booking assistant for a health clinic SaaS app ONLY.
You must NOT answer general knowledge, celebrities, news, politics, or any topic unrelated to scheduling.

Current UTC date/time: ${context.nowIso}
${pendingLine}

Always respond with valid JSON only (no markdown):
{
  "reply": "message to the user",
  "booking": {
    "intent": "book" | "question" | "unknown",
    "title": "string or omit",
    "description": "optional notes",
    "startsAt": "ISO 8601 UTC datetime when confirmed",
    "endsAt": "ISO 8601 UTC datetime when confirmed",
    "missingFields": ["any of: title, startsAt, endsAt, timezone"],
    "confidence": 0.0 to 1.0
  }
}

Rules:
- Scope: booking, rescheduling, cancelling, clinic scheduling questions only. For anything else, set intent to "unknown" and redirect to booking in reply. Never answer off-topic questions.
- Required before intent "book" with empty missingFields: title, startsAt, endsAt, timezone (IANA e.g. Asia/Karachi, or explicit UTC offset). If user gives local time without timezone, ask which timezone and include "timezone" in missingFields.
- Interpret dates relative to current UTC date above (year ${context.nowIso.slice(0, 4)} unless user specifies another).
- Default duration 30 minutes if user gives start time + duration only.
- Do NOT say an appointment is confirmed/booked in reply; the server confirms after the user says yes.
- For clinic-only "question" intent (hours, location), answer briefly then steer back to booking.`;
}

function aiProviderLabel(): string {
  return env.openRouterApiKey ? "openrouter" : "mock";
}

async function logInteraction(input: {
  sessionId?: string;
  userId?: string;
  request: unknown;
  response: unknown;
  latencyMs: number;
  error?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ai_interaction_logs
        (session_id, user_id, provider, model, request_payload, response_payload, latency_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.sessionId ?? null,
        input.userId ?? null,
        aiProviderLabel(),
        env.openRouterModel,
        JSON.stringify(input.request),
        JSON.stringify(input.response),
        input.latencyMs,
        input.error ?? null,
      ]
    );
  } catch (err) {
    console.error("[ai] Failed to log interaction", err);
  }
}

function parseAiJson(raw: string): { reply: string; booking: ExtractedBooking } {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  const slice =
    jsonStart >= 0 && jsonEnd > jsonStart
      ? trimmed.slice(jsonStart, jsonEnd + 1)
      : trimmed;
  const parsed = JSON.parse(slice) as { reply: string; booking: ExtractedBooking };
  if (!parsed.reply || !parsed.booking) {
    throw new Error("Invalid AI response shape");
  }
  parsed.booking.missingFields = parsed.booking.missingFields ?? [];
  return parsed;
}

function mockAssistant(
  userMessage: string,
  history: { role: string; content: string }[]
): AiChatResult {
  const lower = userMessage.toLowerCase();
  if (/\b(who is|what is|elon|musk|tell me about)\b/i.test(userMessage)) {
    return {
      reply:
        "I can only help with appointment booking at this clinic. What date, time (with timezone), and visit title would you like?",
      booking: {
        intent: "unknown",
        missingFields: ["title", "startsAt", "endsAt", "timezone"],
        confidence: 1,
      },
      usedProvider: "mock",
    };
  }

  const booking: ExtractedBooking = {
    intent: "unknown",
    missingFields: ["title", "startsAt", "endsAt", "timezone"],
    confidence: 0.5,
  };

  if (lower.includes("book") || lower.includes("appointment") || lower.includes("schedule")) {
    booking.intent = "book";
    booking.title = lower.includes("consultation") ? "Consultation" : "Appointment";
  }

  const dateMatch = userMessage.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (dateMatch) {
    const startsAt = new Date(`${dateMatch[1]}T${dateMatch[2]}:00`);
    if (!Number.isNaN(startsAt.getTime())) {
      booking.startsAt = startsAt.toISOString();
      const ends = new Date(startsAt.getTime() + 30 * 60 * 1000);
      booking.endsAt = ends.toISOString();
      booking.missingFields = booking.title ? [] : ["title"];
      if (booking.title) booking.missingFields = [];
    }
  }

  if (booking.startsAt && booking.title) {
    booking.missingFields = [];
    booking.confidence = 0.85;
  }

  const reply =
    booking.missingFields.length === 0 && booking.intent === "book"
      ? "I have everything I need. Confirm below or say yes to book."
      : booking.intent === "book"
        ? "I can help book that. Please share date/time (e.g. 2026-10-01 14:30) and what the visit is for."
        : "I'm here to help you book an appointment. What day and time works for you?";

  void history;
  return { reply, booking, usedProvider: "mock" };
}

async function callOpenRouter(
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.openRouterAppUrl,
      "X-Title": env.openRouterAppTitle,
    },
    body: JSON.stringify({
      model: env.openRouterModel,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenRouter response");
  return content;
}

export async function generateAssistantReply(input: {
  userMessage: string;
  history: { role: string; content: string }[];
  sessionId?: string;
  userId?: string;
  pendingBooking?: { title: string; startsAt: string; endsAt: string } | null;
}): Promise<AiChatResult> {
  const messages = [
    ...input.history.slice(-12),
    { role: "user", content: input.userMessage },
  ];

  const systemPrompt = buildSystemPrompt({
    nowIso: new Date().toISOString(),
    pendingBooking: input.pendingBooking ?? null,
  });

  const start = Date.now();
  if (!env.openRouterApiKey) {
    const result = mockAssistant(input.userMessage, input.history);
    await logInteraction({
      sessionId: input.sessionId,
      userId: input.userId,
      request: { messages, mode: "mock" },
      response: result,
      latencyMs: Date.now() - start,
    });
    return result;
  }

  try {
    const raw = await callOpenRouter(systemPrompt, messages);
    const parsed = parseAiJson(raw);
    const result: AiChatResult = {
      ...parsed,
      usedProvider: "openrouter",
    };
    await logInteraction({
      sessionId: input.sessionId,
      userId: input.userId,
      request: { messages, model: env.openRouterModel },
      response: result,
      latencyMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI error";
    await logInteraction({
      sessionId: input.sessionId,
      userId: input.userId,
      request: { messages },
      response: null,
      latencyMs: Date.now() - start,
      error: message,
    });
    const fallback = mockAssistant(input.userMessage, input.history);
    fallback.reply = `${fallback.reply} (AI temporarily unavailable — using guided mode.)`;
    return fallback;
  }
}
