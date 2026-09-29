import type { Request, Response, NextFunction } from "express";
import { AppError, isAppError } from "../utils/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (isAppError(err)) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
    return;
  }

  console.error("[error]", err);
  res.status(500).json({ error: "Internal server error" });
}
