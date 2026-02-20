import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { broadcast } from "../sse.js";
import { asyncHandler, utcTimestamp, toSqliteDatetime } from "../helpers/common.js";
import { shoutSchema, SHOUT_MAX_LENGTH } from "../helpers/validation.js";
import { extractYouTubeId, fetchYouTubeMeta, buildMedia } from "../helpers/media.js";
import { enrichFeed } from "../helpers/feed.js";

const router = Router();

/* get shouts */
router.get("/shouts", asyncHandler(async (req, res) => {
  const currentUserId = req.session?.user?.id ?? null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  const offset = parseInt(req.query.offset, 10) || 0;
  const sortBy = req.query.sortBy || "new";
  console.log(`[Shouts] Fetching shouts: limit=${limit}, offset=${offset}, sort=${sortBy}, user=${currentUserId || "anon"}`);

  let topRaw;
  if (sortBy === "popular") {
    const sevenDaysAgo = toSqliteDatetime(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    topRaw = await prisma.shout.findMany({
      where: {
        parent_id: null,
        is_deleted: 0,
        created_at: { gte: sevenDaysAgo },
      },
      include: {
        user: { select: { username: true, avatar: true, is_banned: true } },
        media: true,
      },
      orderBy: [
        { likes: { _count: "desc" } },
        { created_at: "desc" },
      ],
      take: limit + 1,
      skip: offset,
    });
  } else {
    topRaw = await prisma.shout.findMany({
      where: { parent_id: null, is_deleted: 0 },
      include: {
        user: { select: { username: true, avatar: true, is_banned: true } },
        media: true,
      },
      orderBy: { created_at: "desc" },
      take: limit + 1,
      skip: offset,
    });
  }

  const hasMore = topRaw.length > limit;
  const top = hasMore ? topRaw.slice(0, limit) : topRaw;

  const dto = await enrichFeed(top, currentUserId);

  console.log(`[Shouts] Returning ${dto.length} shouts, hasMore=${hasMore}`);
  res.json({ shouts: dto, hasMore });
}));

/* delete shout (soft-delete, author only) */
router.delete("/shouts/:id", requireAuth, asyncHandler(async (req, res) => {
  const shoutId = req.params.id;
  const userId = req.session.user.id;

  const shout = await prisma.shout.findFirst({
    where: { id: shoutId, is_deleted: 0 },
    select: { id: true, user_id: true },
  });
  if (!shout) return res.status(404).json({ error: "Запись не найдена" });
  if (shout.user_id !== userId) return res.status(403).json({ error: "Можно удалять только свои записи" });

  // Soft-delete the shout and all its comments
  await prisma.shout.update({ where: { id: shoutId }, data: { is_deleted: 1 } });
  await prisma.comment.updateMany({ where: { shout_id: shoutId }, data: { is_deleted: 1 } });

  console.log(`[Shouts] Soft-deleted shout ${shoutId} (and comments) by ${userId}`);
  broadcast("delete_shout", { shoutId, userId });
  res.json({ ok: true });
}));

/* new shout */
router.post("/shouts", requireAuth, asyncHandler(async (req, res) => {
  const parsed = shoutSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.code === "too_big") return res.status(400).json({ error: `Максимум ${SHOUT_MAX_LENGTH} символов` });
    return res.status(400).json({ error: "Некорректные данные" });
  }

  const { content, mediaId, youtubeUrl } = parsed.data;

  // Must have content or media
  if (!content.trim() && !mediaId && !youtubeUrl) {
    return res.status(400).json({ error: "Нужен текст или медиа" });
  }

  // Cannot have both image and YouTube
  if (mediaId && youtubeUrl) {
    return res.status(400).json({ error: "Можно прикрепить или изображение, или видео" });
  }

  let finalMediaId = null;

  if (mediaId) {
    const mediaRow = await prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true },
    });
    if (!mediaRow) {
      return res.status(400).json({ error: "Медиа не найдено. Загрузите файл заново" });
    }
    finalMediaId = mediaId;
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
  } else if (content) {
    // Auto-detect YouTube URL in content
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
    }
  }

  const id = crypto.randomUUID();
  const shout = await prisma.shout.create({
    data: {
      id,
      user_id: req.session.user.id,
      parent_id: null,
      content,
      media_id: finalMediaId,
    },
    include: {
      user: { select: { username: true, avatar: true, is_banned: true } },
      media: true,
    },
  });

  const shoutDto = {
    id: shout.id,
    user: {
      id: shout.user_id,
      name: shout.user.username,
      avatar: shout.user.avatar,
      isBanned: !!shout.user.is_banned,
    },
    content: shout.content,
    timestamp: utcTimestamp(shout.created_at),
    likes: 0,
    likedBy: [],
    comments: [],
    ...(shout.media ? { media: buildMedia(shout.media) } : {}),
  };

  console.log(`[Shouts] New shout ${id} by ${req.session.user.name}, media=${finalMediaId || "none"}`);
  broadcast("new_shout", { shoutId: id, userId: req.session.user.id, shout: shoutDto });
  res.json({ ok: true, id, shout: shoutDto });
}));

export default router;
