import { pool } from "../db/pool.js";
import { AppError } from "../utils/errors.js";

export type ChatSession = {
  id: string;
  user_id: string;
  title: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export async function listSessions(userId: string): Promise<ChatSession[]> {
  const result = await pool.query<ChatSession>(
    `SELECT id, user_id, title, metadata, created_at, updated_at
     FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20`,
    [userId]
  );
  return result.rows.map((row) => ({
    ...row,
    metadata: row.metadata ?? {},
  }));
}

export async function createSession(userId: string, title?: string): Promise<ChatSession> {
  const result = await pool.query<ChatSession>(
    `INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2)
     RETURNING id, user_id, title, metadata, created_at, updated_at`,
    [userId, title ?? "Appointment booking"]
  );
  return { ...result.rows[0], metadata: result.rows[0].metadata ?? {} };
}

export async function getSession(userId: string, sessionId: string): Promise<ChatSession | null> {
  const result = await pool.query<ChatSession>(
    `SELECT id, user_id, title, metadata, created_at, updated_at
     FROM chat_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, metadata: row.metadata ?? {} };
}

export async function listMessages(sessionId: string, userId: string): Promise<ChatMessage[]> {
  const session = await getSession(userId, sessionId);
  if (!session) throw new AppError(404, "Chat session not found");

  const result = await pool.query<ChatMessage>(
    `SELECT id, session_id, role, content, metadata, created_at
     FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );
  return result.rows.map((row) => ({
    ...row,
    metadata: row.metadata ?? {},
  }));
}

export async function addMessage(input: {
  sessionId: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<ChatMessage> {
  const session = await getSession(input.userId, input.sessionId);
  if (!session) throw new AppError(404, "Chat session not found");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const msgResult = await client.query<ChatMessage>(
      `INSERT INTO chat_messages (session_id, role, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, session_id, role, content, metadata, created_at`,
      [input.sessionId, input.role, input.content, JSON.stringify(input.metadata ?? {})]
    );
    await client.query(
      `UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1`,
      [input.sessionId]
    );
    await client.query("COMMIT");
    const row = msgResult.rows[0];
    return { ...row, metadata: row.metadata ?? {} };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSessionMetadata(
  sessionId: string,
  userId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const session = await getSession(userId, sessionId);
  if (!session) throw new AppError(404, "Chat session not found");
  await pool.query(
    `UPDATE chat_sessions SET metadata = metadata || $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(metadata), sessionId]
  );
}
