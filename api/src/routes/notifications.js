import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { asyncHandler, utcTimestamp, toSqliteDatetime } from "../helpers/common.js";

const router = Router();

/* GET /notifications — unread notifications for the current user from the past 7 days */
router.get("/notifications", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  const sevenDaysAgo = toSqliteDatetime(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const rows = await prisma.notification.findMany({
    where: {
      user_id: userId,
      is_read: 0,
      created_at: { gte: sevenDaysAgo },
    },
    include: {
      actor: { select: { username: true, avatar: true } },
    },
    orderBy: { created_at: "desc" },
  });

  const notifications = rows.map(n => ({
    id: n.id,
    type: n.type,
    actor: { id: n.actor_id, name: n.actor.username, avatar: n.actor.avatar },
    shoutId: n.shout_id,
    commentId: n.comment_id,
    isRead: !!n.is_read,
    timestamp: utcTimestamp(n.created_at),
  }));

  console.log(`[Notifications] ${userId} fetched ${notifications.length} unread`);
  res.json({ notifications });
}));

/* PATCH /notifications/:id/read — mark a single notification as read */
router.patch("/notifications/:id/read", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const notif = await prisma.notification.findFirst({
    where: { id, user_id: userId },
    select: { id: true },
  });
  if (!notif) return res.status(404).json({ error: "Не найдено" });

  await prisma.notification.update({ where: { id }, data: { is_read: 1 } });
  res.json({ ok: true });
}));

export default router;
