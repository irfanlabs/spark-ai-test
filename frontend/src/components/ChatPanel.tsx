"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { api, ApiError, type ChatMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useChatSocket } from "@/hooks/useChatSocket";

type Props = {
  onBooked?: () => void;
};

function optimisticUserMessage(content: string): ChatMessage {
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    role: "user",
    content,
    created_at: new Date().toISOString(),
  };
}

export function ChatPanel({ onBooked }: Props) {
  const { token } = useAuth();
  const { status, joinSession, sendChat } = useChatSocket(token);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (loading || !sessionId) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, sessionId]);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (!token || initializedRef.current) return;
    const authToken: string = token;
    if (status === "connecting") return;

    let cancelled = false;

    async function init() {
      try {
        if (status === "connected") {
          const joined = await joinSession();
          if (cancelled) return;
          initializedRef.current = true;
          setSessionId(joined.sessionId);
          setMessages(joined.messages);
          return;
        }
        const { session } = await api.createChatSession(authToken);
        const { messages: history } = await api.listChatMessages(authToken, session.id);
        if (cancelled) return;
        initializedRef.current = true;
        setSessionId(session.id);
        setMessages(history);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to start chat");
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [token, status, joinSession]);

  async function dispatchMessage(content: string, confirmBooking?: boolean) {
    if (!token || !sessionId) return;

    const pendingUser = optimisticUserMessage(content);
    setMessages((prev) => [...prev, pendingUser]);
    setLoading(true);
    setError(null);

    try {
      let result;
      if (status === "connected") {
        try {
          result = await sendChat(content, confirmBooking);
        } catch {
          result = await api.sendChatMessage(token, sessionId, {
            content,
            confirmBooking,
          });
        }
      } else {
        result = await api.sendChatMessage(token, sessionId, {
          content,
          confirmBooking,
        });
      }

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== pendingUser.id),
        result.userMessage,
        result.assistantMessage,
      ]);
      setNeedsConfirmation(result.needsConfirmation);
      if (result.appointment) onBooked?.();
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== pendingUser.id));
      setError(err instanceof ApiError ? err.message : "Message failed");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    await dispatchMessage(text);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Booking assistant</h2>
          <p className="text-xs text-slate-500">
            Ask in natural language — e.g. &quot;Book a consultation on Oct 5 at 2pm&quot;
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            status === "connected"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {status === "connected" ? "Live" : "REST fallback"}
        </span>
      </div>

      <div
        ref={messagesRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {messages.length === 0 && (
          <p className="text-sm text-slate-500">
            Hi! I can help you schedule an appointment. What would you like to book?
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-500">
              Assistant is typing…
            </div>
          </div>
        )}
      </div>

      {needsConfirmation && (
        <div className="shrink-0 border-t border-slate-100 bg-teal-50/60 px-4 py-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void dispatchMessage("yes", true)}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            Confirm booking
          </button>
        </div>
      )}

      {error && (
        <p className="shrink-0 px-4 pb-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="shrink-0 border-t border-slate-100 p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message…"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-500 focus:ring-2"
            disabled={loading || !sessionId}
          />
          <button
            type="submit"
            disabled={loading || !sessionId || !input.trim()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
