import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { asyncHandler, utcTimestamp, toSqliteDatetime } from "../helpers/common.js";
import { buildSnippet, hasInlineSpoiler } from "../helpers/mentions.js";

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
      shout: { select: { content: true, visibility_tag: true } },
      comment: { select: { content: true } },
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
    snippet: n.comment
      ? buildSnippet(n.comment.content)
      : buildSnippet(n.shout?.content ?? "", { spoiler: n.shout?.visibility_tag || false }),
  }));

  console.log(`[Notifications] ${userId} fetched ${notifications.length} unread`);
  res.json({ notifications });
}));

/* PATCH /notifications/read-batch — mark a batch of notifications as read */
router.patch("/notifications/read-batch", requireAuth, asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }
  const capped = ids.slice(0, 50); // safety cap

  await prisma.notification.updateMany({
    where: { id: { in: capped }, user_id: req.session.user.id },
    data: { is_read: 1 },
  });
  res.json({ ok: true });
}));

/* PATCH /notifications/read-all — mark all unread notifications as read */
router.patch("/notifications/read-all", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  await prisma.notification.updateMany({
    where: { user_id: userId, is_read: 0 },
    data: { is_read: 1 },
  });
  res.json({ ok: true });
}));

export default router;
