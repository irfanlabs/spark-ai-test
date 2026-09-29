import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
dotenv.config({ path: path.join(rootDir, ".env") });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", "postgresql://spark:spark_dev_password@localhost:5432/spark_appointments"),
  jwtSecret: required("JWT_SECRET", "dev-only-jwt-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterModel: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
  openRouterAppTitle: process.env.OPENROUTER_APP_TITLE ?? "Spark Book",
  openRouterAppUrl: process.env.OPENROUTER_APP_URL ?? "http://localhost:3000",
};
