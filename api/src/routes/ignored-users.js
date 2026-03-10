import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { asyncHandler, toSqliteDatetime } from "../helpers/common.js";

const router = Router();

const IGNORE_LIMIT = 3;

/* GET /me/ignored-users — list ignored user IDs */
router.get("/me/ignored-users", requireAuth, asyncHandler(async (req, res) => {
  const ownerId = req.session.user.id;

  const rows = await prisma.ignoredUser.findMany({
    where: { owner_user_id: ownerId },
    select: { target_user_id: true },
  });

  res.json({ userIds: rows.map(r => r.target_user_id) });
}));

/* POST /users/:id/ignore — add ignore */
router.post("/users/:id/ignore", requireAuth, asyncHandler(async (req, res) => {
  const ownerId = req.session.user.id;
  const targetId = req.params.id;

  if (ownerId === targetId) {
    return res.status(400).json({ error: "Нельзя игнорировать самого себя" });
  }

  // Check target exists
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) {
    return res.status(404).json({ error: "Пользователь не найден" });
  }

  // Check if already ignored
  const existing = await prisma.ignoredUser.findUnique({
    where: { owner_user_id_target_user_id: { owner_user_id: ownerId, target_user_id: targetId } },
  });
  if (existing) {
    return res.json({ ok: true });
  }

  // Check limit
  const count = await prisma.ignoredUser.count({ where: { owner_user_id: ownerId } });
  if (count >= IGNORE_LIMIT) {
    return res.status(400).json({ error: "Список игнора заполнен" });
  }

  const now = toSqliteDatetime();
  await prisma.ignoredUser.create({
    data: {
      id: crypto.randomUUID(),
      owner_user_id: ownerId,
      target_user_id: targetId,
      created_at: now,
      updated_at: now,
    },
  });

  res.json({ ok: true });
}));

/* DELETE /users/:id/ignore — remove ignore */
router.delete("/users/:id/ignore", requireAuth, asyncHandler(async (req, res) => {
  const ownerId = req.session.user.id;
  const targetId = req.params.id;

  await prisma.ignoredUser.deleteMany({
    where: { owner_user_id: ownerId, target_user_id: targetId },
  });

  res.json({ ok: true });
}));

export default router;
