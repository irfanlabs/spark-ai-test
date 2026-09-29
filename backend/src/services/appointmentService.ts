import { pool } from "../db/pool.js";
import { AppError } from "../utils/errors.js";

export type Appointment = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  starts_at: Date;
  ends_at: Date;
  status: string;
  source: string;
  created_at: Date;
};

export async function listAppointments(userId: string): Promise<Appointment[]> {
  const result = await pool.query<Appointment>(
    `SELECT id, user_id, title, description, starts_at, ends_at, status, source, created_at
     FROM appointments
     WHERE user_id = $1
     ORDER BY starts_at ASC`,
    [userId]
  );
  return result.rows;
}

export async function createAppointment(input: {
  userId: string;
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  source?: string;
}): Promise<Appointment> {
  if (input.endsAt <= input.startsAt) {
    throw new AppError(400, "End time must be after start time");
  }

  const conflict = await pool.query(
    `SELECT id FROM appointments
     WHERE user_id = $1 AND status NOT IN ('cancelled')
       AND starts_at < $3 AND ends_at > $2`,
    [input.userId, input.startsAt, input.endsAt]
  );
  if (conflict.rowCount && conflict.rowCount > 0) {
    throw new AppError(409, "You already have an appointment in this time range");
  }

  const result = await pool.query<Appointment>(
    `INSERT INTO appointments (user_id, title, description, starts_at, ends_at, status, source)
     VALUES ($1, $2, $3, $4, $5, 'confirmed', $6)
     RETURNING id, user_id, title, description, starts_at, ends_at, status, source, created_at`,
    [
      input.userId,
      input.title,
      input.description ?? null,
      input.startsAt,
      input.endsAt,
      input.source ?? "form",
    ]
  );
  return result.rows[0];
}

export async function getAppointment(userId: string, id: string): Promise<Appointment | null> {
  const result = await pool.query<Appointment>(
    `SELECT id, user_id, title, description, starts_at, ends_at, status, source, created_at
     FROM appointments WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] ?? null;
}
