"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/api";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";

type ChatResultPayload = {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  needsConfirmation: boolean;
  appointment: unknown;
};

type Status = "disconnected" | "connecting" | "connected" | "fallback";

export function useChatSocket(token: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("disconnected");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const pendingRef = useRef<
    Map<string, { resolve: (v: ChatResultPayload) => void; reject: (e: Error) => void }>
  >(new Map());

  const connect = useCallback(() => {
    if (!token || wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("fallback");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string) as
        | { type: "joined"; sessionId: string }
        | { type: "messages"; messages: ChatMessage[] }
        | { type: "chat_result"; payload: ChatResultPayload }
        | { type: "error"; message: string };

      if (data.type === "joined") {
        setSessionId(data.sessionId);
      }
      if (data.type === "chat_result") {
        const entry = [...pendingRef.current.values()][0];
        entry?.resolve(data.payload);
        pendingRef.current.clear();
      }
      if (data.type === "error") {
        const entry = [...pendingRef.current.values()][0];
        entry?.reject(new Error(data.message));
        pendingRef.current.clear();
      }
    };
  }, [token]);

  useEffect(() => {
    connect();
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 25000);
    return () => {
      clearInterval(interval);
      wsRef.current?.close();
    };
  }, [connect]);

  const joinSession = useCallback(
    (existingSessionId?: string) =>
      new Promise<{ sessionId: string; messages: ChatMessage[] }>((resolve, reject) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket not connected"));
          return;
        }

        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data as string) as
            | { type: "joined"; sessionId: string }
            | { type: "messages"; messages: ChatMessage[] };

          if (data.type === "joined") {
            const joinedId = data.sessionId;
            const onMessages = (ev: MessageEvent) => {
              const msg = JSON.parse(ev.data as string) as {
                type: string;
                messages?: ChatMessage[];
              };
              if (msg.type === "messages" && msg.messages) {
                ws.removeEventListener("message", onMessages);
                resolve({ sessionId: joinedId, messages: msg.messages });
              }
            };
            ws.addEventListener("message", onMessages);
          }
        };

        ws.addEventListener("message", handler);
        ws.send(JSON.stringify({ type: "join", sessionId: existingSessionId }));

        setTimeout(() => {
          ws.removeEventListener("message", handler);
          reject(new Error("Join session timed out"));
        }, 8000);
      }),
    []
  );

  const sendChat = useCallback(
    (content: string, confirmBooking?: boolean) =>
      new Promise<ChatResultPayload>((resolve, reject) => {
        const ws = wsRef.current;
        if (!sessionId || !ws || ws.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket not ready"));
          return;
        }
        const id = crypto.randomUUID();
        pendingRef.current.set(id, { resolve, reject });
        ws.send(
          JSON.stringify({
            type: "chat",
            sessionId,
            content,
            confirmBooking,
          })
        );
        setTimeout(() => {
          if (pendingRef.current.has(id)) {
            pendingRef.current.delete(id);
            reject(new Error("Chat response timed out"));
          }
        }, 45000);
      }),
    [sessionId]
  );

  return {
    status,
    sessionId,
    setSessionId,
    connect,
    joinSession,
    sendChat,
  };
}
