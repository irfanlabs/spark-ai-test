import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { authRateLimiter } from "../middleware/rateLimit.js";
import { authenticate } from "../middleware/auth.js";
import {
  createUser,
  findUserByEmail,
  getUserById,
  verifyPassword,
} from "../services/userService.js";
import { signToken } from "../utils/jwt.js";
import { AppError } from "../utils/errors.js";

const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(255),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/signup", authRateLimiter, validate(signupSchema), async (req, res, next) => {
  try {
    const { email, password, fullName } = req.body as z.infer<typeof signupSchema>;
    const user = await createUser({ email, password, fullName });
    const token = signToken({ sub: user.id, email: user.email });
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/login", authRateLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new AppError(401, "Invalid email or password");
    }
    const token = signToken({ sub: user.id, email: user.email });
    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await getUserById(req.user!.sub);
    if (!user) throw new AppError(404, "User not found");
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
