import { AppError, isAppError } from "../utils/errors.js";
import {
  addMessage,
  getSession,
  listMessages,
  updateSessionMetadata,
  type ChatMessage,
} from "./chatService.js";
import { generateAssistantReply, type AiChatResult } from "./aiService.js";
import { createAppointment, type Appointment } from "./appointmentService.js";
import {
  applyBookingOnlyPolicy,
  draftToPending,
  isAffirmativeConfirmation,
  isClearlyOffTopic,
  isReadyToBook,
  offTopicReply,
  type PendingBooking,
} from "./chatGuardrails.js";

export type ChatTurnResult = {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  booking: AiChatResult["booking"];
  appointment: Appointment | null;
  needsConfirmation: boolean;
};

function getPendingBooking(metadata: Record<string, unknown>): PendingBooking | null {
  const raw = metadata.pendingBooking;
  if (!raw || typeof raw !== "object") return null;
  const p = raw as PendingBooking;
  if (!p.title || !p.startsAt || !p.endsAt) return null;
  return p;
}

async function bookPending(
  userId: string,
  pending: PendingBooking
): Promise<Appointment> {
  return createAppointment({
    userId,
    title: pending.title,
    description: pending.description,
    startsAt: new Date(pending.startsAt),
    endsAt: new Date(pending.endsAt),
    source: "chat",
  });
}

export async function processChatTurn(input: {
  sessionId: string;
  userId: string;
  content: string;
  confirmBooking?: boolean;
}): Promise<ChatTurnResult> {
  const { sessionId, userId, content, confirmBooking } = input;

  const session = await getSession(userId, sessionId);
  if (!session) {
    throw new AppError(404, "Chat session not found");
  }

  const pendingFromSession = getPendingBooking(session.metadata);

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

  const wantsConfirm = Boolean(confirmBooking || isAffirmativeConfirmation(content));

  if (isClearlyOffTopic(content)) {
    const blocked = offTopicReply();
    const assistantMsg = await addMessage({
      sessionId,
      userId,
      role: "assistant",
      content: blocked.reply,
      metadata: { booking: blocked.booking, appointmentId: null, provider: blocked.usedProvider },
    });
    return {
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      booking: blocked.booking,
      appointment: null,
      needsConfirmation: Boolean(pendingFromSession),
    };
  }

  if (wantsConfirm && pendingFromSession) {
    let appointment: Appointment | null = null;
    let assistantContent: string;
    try {
      appointment = await bookPending(userId, pendingFromSession);
      await updateSessionMetadata(sessionId, userId, {
        pendingBooking: null,
        lastBookedAppointmentId: appointment.id,
      });
      assistantContent = `Your appointment "${appointment.title}" is confirmed for ${new Date(appointment.starts_at).toLocaleString()} (stored in UTC; local display depends on your browser).`;
    } catch (err) {
      if (isAppError(err) && err.statusCode === 409) {
        assistantContent =
          "That time slot is already booked on your calendar. Say a different date/time if you'd like another appointment.";
        await updateSessionMetadata(sessionId, userId, { pendingBooking: null });
      } else {
        throw err;
      }
    }

    const assistantMsg = await addMessage({
      sessionId,
      userId,
      role: "assistant",
      content: assistantContent,
      metadata: {
        booking: { intent: "book", missingFields: [], confidence: 1 },
        appointmentId: appointment?.id ?? null,
        provider: "openrouter",
      },
    });

    return {
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      booking: { intent: "book", missingFields: [], confidence: 1 },
      appointment,
      needsConfirmation: false,
    };
  }

  let ai = await generateAssistantReply({
    userMessage: content,
    history,
    sessionId,
    userId,
    pendingBooking: pendingFromSession
      ? {
          title: pendingFromSession.title,
          startsAt: pendingFromSession.startsAt,
          endsAt: pendingFromSession.endsAt,
        }
      : null,
  });
  ai = applyBookingOnlyPolicy(ai, content);

  const draft = ai.booking;
  const readyToBook = isReadyToBook(draft);

  if (readyToBook && wantsConfirm) {
    const pending = draftToPending(draft)!;
    let appointment: Appointment | null = null;
    let assistantContent = ai.reply;
    try {
      appointment = await bookPending(userId, pending);
      await updateSessionMetadata(sessionId, userId, {
        pendingBooking: null,
        lastBookedAppointmentId: appointment.id,
      });
      assistantContent += `\n\n✓ Booked: ${appointment.title} on ${new Date(appointment.starts_at).toLocaleString()}.`;
    } catch (err) {
      if (isAppError(err) && err.statusCode === 409) {
        assistantContent =
          "That time slot is already booked. Pick another time or check your appointments list.";
        await updateSessionMetadata(sessionId, userId, { pendingBooking: null });
      } else {
        throw err;
      }
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

    return {
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      booking: draft,
      appointment,
      needsConfirmation: false,
    };
  }

  if (readyToBook && !wantsConfirm) {
    const pending = draftToPending(draft)!;
    await updateSessionMetadata(sessionId, userId, { pendingBooking: pending });
  } else if (draft.intent === "book" && !readyToBook) {
    await updateSessionMetadata(sessionId, userId, { pendingBooking: null });
  }

  let assistantContent = ai.reply;
  if (readyToBook && !wantsConfirm) {
    assistantContent +=
      "\n\nReply **yes** or use **Confirm booking** when you're ready.";
  }

  const assistantMsg = await addMessage({
    sessionId,
    userId,
    role: "assistant",
    content: assistantContent,
    metadata: {
      booking: draft,
      appointmentId: null,
      provider: ai.usedProvider,
    },
  });

  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    booking: draft,
    appointment: null,
    needsConfirmation: Boolean(readyToBook && !wantsConfirm),
  };
}
