import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createAppointment,
  getAppointment,
  listAppointments,
} from "../services/appointmentService.js";
import { AppError } from "../utils/errors.js";

const router = Router();

const createSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  source: z.enum(["form", "chat"]).optional(),
});

router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const appointments = await listAppointments(req.user!.sub);
    res.json({ appointments });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const appointment = await getAppointment(req.user!.sub, req.params.id);
    if (!appointment) throw new AppError(404, "Appointment not found");
    res.json({ appointment });
  } catch (err) {
    next(err);
  }
});

router.post("/", validate(createSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createSchema>;
    const appointment = await createAppointment({
      userId: req.user!.sub,
      title: body.title,
      description: body.description,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      source: body.source ?? "form",
    });
    res.status(201).json({ appointment });
  } catch (err) {
    next(err);
  }
});

export default router;
