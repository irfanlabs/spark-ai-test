const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.error ?? "Request failed", res.status, data.details);
  }
  return data as T;
}

export type User = { id: string; email: string; fullName: string };

export type AuthResponse = { token: string; user: User };

export type Appointment = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  source: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export const api = {
  signup: (body: { email: string; password: string; fullName: string }) =>
    request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: (token: string) => request<User>("/api/auth/me", {}, token),

  listAppointments: (token: string) =>
    request<{ appointments: Appointment[] }>("/api/appointments", {}, token),

  createAppointment: (
    token: string,
    body: {
      title: string;
      description?: string;
      startsAt: string;
      endsAt: string;
      source?: "form" | "chat";
    }
  ) =>
    request<{ appointment: Appointment }>(
      "/api/appointments",
      { method: "POST", body: JSON.stringify(body) },
      token
    ),

  createChatSession: (token: string) =>
    request<{ session: { id: string } }>(
      "/api/chat/sessions",
      { method: "POST", body: "{}" },
      token
    ),

  listChatMessages: (token: string, sessionId: string) =>
    request<{ messages: ChatMessage[] }>(
      `/api/chat/sessions/${sessionId}/messages`,
      {},
      token
    ),

  sendChatMessage: (
    token: string,
    sessionId: string,
    body: { content: string; confirmBooking?: boolean }
  ) =>
    request<{
      userMessage: ChatMessage;
      assistantMessage: ChatMessage;
      needsConfirmation: boolean;
      appointment: Appointment | null;
    }>(
      `/api/chat/sessions/${sessionId}/messages`,
      { method: "POST", body: JSON.stringify(body) },
      token
    ),
};
