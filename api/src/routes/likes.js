import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { broadcast } from "../sse.js";
import { asyncHandler } from "../helpers/common.js";

const router = Router();

/* like toggle (shout) */
router.post("/shouts/:id/like", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  const banCheck = await prisma.user.findUnique({ where: { id: userId }, select: { is_banned: true } });
  if (banCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });

  const shoutId = req.params.id;

  const exists = await prisma.shoutLike.findUnique({
    where: { shout_id_user_id: { shout_id: shoutId, user_id: userId } },
  });

  if (exists) {
    await prisma.shoutLike.delete({
      where: { shout_id_user_id: { shout_id: shoutId, user_id: userId } },
    });
  } else {
    await prisma.shoutLike.create({
      data: { shout_id: shoutId, user_id: userId },
    });
  }

  const likes = await prisma.shoutLike.count({ where: { shout_id: shoutId } });

  console.log(`[Shouts] Like toggle on ${shoutId} by ${userId}: now ${likes} likes, isLiked=${!exists}`);
  broadcast("shout_like", { shoutId, likes, userId });
  res.json({ likes, isLiked: !exists });
}));

/* like toggle (comment) */
router.post("/comments/:id/like", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  const banCheck = await prisma.user.findUnique({ where: { id: userId }, select: { is_banned: true } });
  if (banCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });

  const commentId = req.params.id;

  const exists = await prisma.commentLike.findUnique({
    where: { comment_id_user_id: { comment_id: commentId, user_id: userId } },
  });

  if (exists) {
    await prisma.commentLike.delete({
      where: { comment_id_user_id: { comment_id: commentId, user_id: userId } },
    });
  } else {
    await prisma.commentLike.create({
      data: { comment_id: commentId, user_id: userId },
    });
  }

  const likes = await prisma.commentLike.count({ where: { comment_id: commentId } });

  console.log(`[Comments] Like toggle on ${commentId} by ${userId}: now ${likes} likes, isLiked=${!exists}`);
  broadcast("comment_like", { commentId, likes, userId });
  res.json({ likes, isLiked: !exists });
}));

export default router;
