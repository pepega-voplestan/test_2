import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { asyncHandler, utcTimestamp, ANNOUNCEMENTS_SECRET } from "../helpers/common.js";
import { announcementSchema } from "../helpers/validation.js";

const router = Router();

/* GET all active announcement items, newest first */
router.get("/announcements", asyncHandler(async (_req, res) => {
  const items = await prisma.announcement.findMany({
    where: { is_deleted: 0 },
    orderBy: { created_at: "desc" },
  });

  res.json({
    items: items.map(a => ({
      id: a.id,
      title: a.title,
      content: a.content,
      createdAt: utcTimestamp(a.created_at),
    })),
  });
}));

/* POST create a new announcement item */
router.post("/announcements", asyncHandler(async (req, res) => {
  const parsed = announcementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Некорректные данные" });
  }

  const { title, content, secret_key } = parsed.data;

  if (!ANNOUNCEMENTS_SECRET || secret_key !== ANNOUNCEMENTS_SECRET) {
    return res.status(403).json({ error: "Неверный ключ" });
  }

  const id = crypto.randomUUID();
  await prisma.announcement.create({
    data: { id, title, content },
  });

  console.log(`[Announcements] New item ${id}: "${title}"`);
  res.json({ ok: true, id });
}));

/* DELETE soft-delete an item by id */
router.delete("/announcements/:id", asyncHandler(async (req, res) => {
  const { secret_key } = req.body ?? {};
  if (!ANNOUNCEMENTS_SECRET || secret_key !== ANNOUNCEMENTS_SECRET) {
    return res.status(403).json({ error: "Неверный ключ" });
  }

  await prisma.announcement.update({
    where: { id: req.params.id },
    data: { is_deleted: 1 },
  });

  res.json({ ok: true });
}));

export default router;
