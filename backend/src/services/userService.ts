import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { AppError } from "../utils/errors.js";

export type UserRow = {
  id: string;
  email: string;
  full_name: string;
  business_id: string | null;
  created_at: Date;
};

const SALT_ROUNDS = 10;

export async function createUser(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<UserRow> {
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  try {
    const result = await pool.query<UserRow>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name, business_id, created_at`,
      [input.email.toLowerCase(), passwordHash, input.fullName]
    );
    return result.rows[0];
  } catch (err: unknown) {
    if (typeof err === "object" && err && "code" in err && err.code === "23505") {
      throw new AppError(409, "Email already registered");
    }
    throw err;
  }
}

export async function findUserByEmail(email: string): Promise<(UserRow & { password_hash: string }) | null> {
  const result = await pool.query<UserRow & { password_hash: string }>(
    `SELECT id, email, full_name, business_id, created_at, password_hash
     FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  return result.rows[0] ?? null;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, email, full_name, business_id, created_at FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function ensureDemoUser(): Promise<void> {
  const existing = await findUserByEmail("demo@example.com");
  if (existing) return;
  await createUser({
    email: "demo@example.com",
    password: "Password123!",
    fullName: "Demo User",
  });
  console.log("[seed] Created demo user demo@example.com / Password123!");
}
