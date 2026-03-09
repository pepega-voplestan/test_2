import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { asyncHandler, utcTimestamp, toSqliteDatetime } from "../helpers/common.js";
import { buildSnippet } from "../helpers/mentions.js";

const router = Router();

/* GET /notifications — notifications for the current user from the past 14 days, paginated
 *   Query params:
 *     cursor  — ISO timestamp; fetch items older than this (for next-page requests)
 *     limit   — page size, default 20, max 50
 *   Response: { notifications: [...], nextCursor: string | null }
 */
router.get("/notifications", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  const fourteenDaysAgo = toSqliteDatetime(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);

  // Convert ISO cursor to SQLite datetime format for comparison
  const cursor = req.query.cursor ? toSqliteDatetime(new Date(req.query.cursor)) : null;

  const where = {
    user_id: userId,
    created_at: { gte: fourteenDaysAgo },
  };
  if (cursor) {
    where.created_at = { gte: fourteenDaysAgo, lt: cursor };
  }

  const rows = await prisma.notification.findMany({
    where,
    include: {
      actor: { select: { username: true, avatar: true } },
      shout: { select: { content: true, visibility_tag: true } },
      comment: { select: { content: true } },
    },
    orderBy: { created_at: "desc" },
    take: limit,
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

  // If we got a full page, there may be more — return the cursor for the next request
  const nextCursor = rows.length === limit ? utcTimestamp(rows[rows.length - 1].created_at) : null;

  console.log(`[Notifications] ${userId} fetched ${notifications.length} (cursor=${cursor ?? "none"})`);
  res.json({ notifications, nextCursor });
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
