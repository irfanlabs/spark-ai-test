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

const SYSTEM_PROMPT = `You are an appointment booking assistant for a health clinic SaaS app.
Help users schedule appointments. Extract structured booking data from the conversation.

Always respond with valid JSON only (no markdown), in this shape:
{
  "reply": "friendly message to the user",
  "booking": {
    "intent": "book" | "question" | "unknown",
    "title": "optional appointment title",
    "description": "optional notes",
    "startsAt": "ISO 8601 datetime if known",
    "endsAt": "ISO 8601 datetime if known",
    "missingFields": ["list of missing required fields: title, startsAt, endsAt"],
    "confidence": 0.0 to 1.0
  }
}

Rules:
- Required to book: title (or infer e.g. "Consultation"), startsAt, endsAt (default 30 min after startsAt if duration mentioned).
- Use the user's timezone context from messages when possible; if ambiguous, ask in reply and list missingFields.
- If user asks general questions, set intent to question and answer briefly.
- Never invent confirmed bookings in reply; say you will book once details are complete.`;

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
  const booking: ExtractedBooking = {
    intent: "unknown",
    missingFields: ["title", "startsAt", "endsAt"],
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
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
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
}): Promise<AiChatResult> {
  const messages = [
    ...input.history.slice(-12),
    { role: "user", content: input.userMessage },
  ];

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
    const raw = await callOpenRouter(messages);
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
