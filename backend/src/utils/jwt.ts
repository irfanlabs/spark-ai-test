import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export type JwtPayload = {
  sub: string;
  email: string;
};

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: "7d" };
  if (env.jwtExpiresIn) {
    options.expiresIn = env.jwtExpiresIn as SignOptions["expiresIn"];
  }
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}
