import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { asyncHandler, utcTimestamp, ANNOUNCEMENTS_SECRET } from "../helpers/common.js";
import { announcementSchema } from "../helpers/validation.js";

const router = Router();

/* get latest announcement */
router.get("/announcements", asyncHandler(async (_req, res) => {
  const announcement = await prisma.announcement.findFirst({
    where: { is_deleted: 0 },
    orderBy: { created_at: "desc" },
  });

  res.json({ announcement: announcement ? { id: announcement.id, content: announcement.content, createdAt: utcTimestamp(announcement.created_at) } : null });
}));

/* create announcement */
router.post("/announcements", asyncHandler(async (req, res) => {
  const parsed = announcementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Некорректные данные" });
  }

  const { content, secret_key } = parsed.data;

  if (!ANNOUNCEMENTS_SECRET || secret_key !== ANNOUNCEMENTS_SECRET) {
    return res.status(403).json({ error: "Неверный ключ" });
  }

  // Soft-delete all currently active announcements
  await prisma.announcement.updateMany({
    where: { is_deleted: 0 },
    data: { is_deleted: 1 },
  });

  const id = crypto.randomUUID();
  await prisma.announcement.create({
    data: { id, content },
  });

  console.log(`[Announcements] New announcement ${id}`);
  res.json({ ok: true, id });
}));

export default router;
