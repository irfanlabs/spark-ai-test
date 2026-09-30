import { env } from "../config/env.js";
import type { ExtractedBooking, AiChatResult } from "./aiService.js";

const BOOKING_KEYWORDS =
  /\b(appoint|book|schedule|reschedul|cancel|slot|time|date|confirm|yes|no|title|consult|visit|clinic|sept|sep|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|pm|am|\d{1,2}:\d{2}|\d{4})\b/i;

const OFF_TOPIC_PATTERNS =
  /\b(who is|what is|tell me about|elon|musk|president|weather|news|joke|poem|stock|crypto|recipe|capital of)\b/i;

export function isAffirmativeConfirmation(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(yes|yeah|yep|yup|confirm|confirmed|ok|okay|sure|book it|go ahead|please book)[.!]?$/.test(
    t
  );
}

export function isBookingRelatedMessage(text: string): boolean {
  const trimmed = text.trim();
  if (isAffirmativeConfirmation(trimmed)) return true;
  if (BOOKING_KEYWORDS.test(trimmed)) return true;
  if (OFF_TOPIC_PATTERNS.test(trimmed)) return false;
  // Short ambiguous replies during booking flow are handled via pending booking + affirmatives.
  return trimmed.length <= 40;
}

export function isClearlyOffTopic(text: string): boolean {
  if (isAffirmativeConfirmation(text)) return false;
  if (BOOKING_KEYWORDS.test(text)) return false;
  return OFF_TOPIC_PATTERNS.test(text);
}

export function offTopicReply(): AiChatResult {
  return {
    reply:
      "I'm only able to help with scheduling appointments at this clinic (book, change, or clarify visit details). What date and time would you like, and what's the visit for?",
    booking: {
      intent: "unknown",
      missingFields: ["title", "startsAt", "endsAt", "timezone"],
      confidence: 1,
    },
    usedProvider: env.openRouterApiKey ? "openrouter" : "mock",
  };
}

export function applyBookingOnlyPolicy(
  result: AiChatResult,
  userMessage: string
): AiChatResult {
  if (isClearlyOffTopic(userMessage)) {
    return offTopicReply();
  }

  if (result.booking.intent === "question") {
    const lower = userMessage.toLowerCase();
    const clinicQuestion =
      /\b(hour|open|close|location|address|parking|insurance|cost|fee|cancel|policy)\b/.test(
        lower
      );
    if (!clinicQuestion) {
      return {
        ...result,
        reply:
          "I can only assist with appointment booking and simple scheduling questions for this clinic. Would you like to book, change, or check an appointment?",
        booking: {
          intent: "unknown",
          missingFields: result.booking.missingFields,
          confidence: result.booking.confidence,
        },
      };
    }
  }

  return result;
}

export type PendingBooking = {
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  timezone?: string;
};

export function draftToPending(draft: ExtractedBooking): PendingBooking | null {
  if (!draft.title || !draft.startsAt || !draft.endsAt) return null;
  return {
    title: draft.title,
    description: draft.description,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
  };
}

export function isReadyToBook(draft: ExtractedBooking): boolean {
  return (
    draft.intent === "book" &&
    draft.missingFields.length === 0 &&
    Boolean(draft.title && draft.startsAt && draft.endsAt)
  );
}
