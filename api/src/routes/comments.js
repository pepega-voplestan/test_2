import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { broadcast } from "../sse.js";
import { asyncHandler, utcTimestamp } from "../helpers/common.js";
import { commentSchema, SHOUT_MAX_LENGTH } from "../helpers/validation.js";
import { extractYouTubeId, fetchYouTubeMeta, buildMedia } from "../helpers/media.js";

const router = Router();

/* reply (create comment) */
router.post("/shouts/:id/replies", requireAuth, asyncHandler(async (req, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.code === "custom" || issue?.code === "too_big") return res.status(400).json({ error: `Максимум ${SHOUT_MAX_LENGTH} символов` });
    return res.status(400).json({ error: "Ответ не может быть пустым" });
  }

  const shoutId = req.params.id;
  const parent = await prisma.shout.findFirst({
    where: { id: shoutId, is_deleted: 0 },
    select: { id: true },
  });
  if (!parent)
    return res.status(404).json({ error: "Запись не найдена" });

  const { content, mediaId, youtubeUrl } = parsed.data;

  // Must have content or media
  if (!content.trim() && !mediaId && !youtubeUrl) {
    return res.status(400).json({ error: "Нужен текст или медиа" });
  }

  if (mediaId && youtubeUrl) {
    return res.status(400).json({ error: "Можно прикрепить или изображение, или видео" });
  }

  let finalMediaId = null;
  let mediaDto = undefined;

  if (mediaId) {
    const mediaRow = await prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, media_type: true, media_url: true, media_meta: true },
    });
    if (!mediaRow) {
      return res.status(400).json({ error: "Медиа не найдено. Загрузите файл заново" });
    }
    finalMediaId = mediaId;
    mediaDto = buildMedia(mediaRow);
  } else if (youtubeUrl) {
    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
      return res.status(400).json({ error: "Некорректная YouTube ссылка" });
    }
    const ytMeta = await fetchYouTubeMeta(videoId);
    finalMediaId = crypto.randomUUID();
    await prisma.media.create({
      data: {
        id: finalMediaId,
        user_id: req.session.user.id,
        media_type: "youtube",
        media_url: videoId,
        media_meta: JSON.stringify(ytMeta),
      },
    });
    mediaDto = buildMedia({ media_type: "youtube", media_url: videoId, media_meta: JSON.stringify(ytMeta) });
  } else if (content) {
    const videoId = extractYouTubeId(content);
    if (videoId) {
      const ytMeta = await fetchYouTubeMeta(videoId);
      finalMediaId = crypto.randomUUID();
      await prisma.media.create({
        data: {
          id: finalMediaId,
          user_id: req.session.user.id,
          media_type: "youtube",
          media_url: videoId,
          media_meta: JSON.stringify(ytMeta),
        },
      });
      mediaDto = buildMedia({ media_type: "youtube", media_url: videoId, media_meta: JSON.stringify(ytMeta) });
    }
  }

  const id = crypto.randomUUID();
  const comment = await prisma.comment.create({
    data: {
      id,
      shout_id: shoutId,
      user_id: req.session.user.id,
      content,
      media_id: finalMediaId,
    },
    include: {
      user: { select: { username: true, avatar: true, is_banned: true } },
      media: true,
    },
  });

  const commentDto = {
    id: comment.id,
    shoutId: comment.shout_id,
    user: {
      id: comment.user_id,
      name: comment.user.username,
      avatar: comment.user.avatar,
      isBanned: !!comment.user.is_banned,
    },
    content: comment.content,
    timestamp: utcTimestamp(comment.created_at),
    likes: 0,
    likedBy: [],
    ...(comment.media ? { media: buildMedia(comment.media) } : {}),
  };

  console.log(`[Comments] Comment ${id} on shout ${shoutId} by ${req.session.user.name}, media=${finalMediaId || "none"}`);
  broadcast("new_comment", { shoutId, commentId: id, userId: req.session.user.id, comment: commentDto });
  res.json({ ok: true, id, ...(mediaDto ? { media: mediaDto } : {}) });
}));

/* delete comment (soft-delete, author only) */
router.delete("/comments/:id", requireAuth, asyncHandler(async (req, res) => {
  const commentId = req.params.id;
  const userId = req.session.user.id;

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, is_deleted: 0 },
    select: { id: true, user_id: true, shout_id: true },
  });
  if (!comment) return res.status(404).json({ error: "Комментарий не найден" });
  if (comment.user_id !== userId) return res.status(403).json({ error: "Можно удалять только свои комментарии" });

  await prisma.comment.update({ where: { id: commentId }, data: { is_deleted: 1 } });

  console.log(`[Comments] Soft-deleted comment ${commentId} by ${userId}`);
  broadcast("delete_comment", { shoutId: comment.shout_id, commentId, userId });
  res.json({ ok: true });
}));

export default router;
