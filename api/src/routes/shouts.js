import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { broadcast, broadcastToUser } from "../sse.js";
import { extractMentionedUserIds, buildSnippet } from "../helpers/mentions.js";
import { asyncHandler, utcTimestamp } from "../helpers/common.js";
import { shoutSchema, editContentSchema, SHOUT_MAX_LENGTH, EDIT_WINDOW_MS } from "../helpers/validation.js";
import { extractYouTubeId, fetchYouTubeMeta, buildMedia, buildGallery } from "../helpers/media.js";
import { enrichFeed } from "../helpers/feed.js";
import { attachMedia, resolveMediaIds, isMultiItemEligible, attachmentLimitMessage } from "../helpers/attachments.js";

const router = Router();

/* get shouts */
router.get("/shouts", asyncHandler(async (req, res) => {
  const currentUserId = req.session?.user?.id ?? null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 50);
  const sortBy = req.query.sortBy || "new";

  let topRaw;
  if (sortBy === "popular") {
    const offset = parseInt(req.query.offset, 10) || 0;
    const popularSort = req.query.popularSort || "likes"; // "likes" | "comments"
    console.log(`[Shouts] Fetching popular shouts: limit=${limit}, offset=${offset}, sort=${popularSort}, user=${currentUserId || "anon"}`);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const orderBy = popularSort === "comments"
      ? [{ comments: { _count: "desc" } }, { created_at: "desc" }]
      : [{ likes: { _count: "desc" } }, { created_at: "desc" }];
    topRaw = await prisma.shout.findMany({
      where: {
        parent_id: null,
        is_deleted: 0,
        created_at: { gte: sevenDaysAgo },
      },
      include: {
        user: { select: { username: true, avatar: true, is_banned: true } },
      },
      orderBy,
      take: limit + 1,
      skip: offset,
    });
  } else {
    // Cursor-based pagination for "new" tab — stable under list mutations
    const cursor = req.query.cursor || null; // created_at of last seen shout
    console.log(`[Shouts] Fetching new shouts: limit=${limit}, cursor=${cursor || "none"}, user=${currentUserId || "anon"}`);
    // On first page (no cursor), fetch fixed shouts separately so they always appear at the top
    let fixedShouts = [];
    if (!cursor) {
      fixedShouts = await prisma.shout.findMany({
        where: { parent_id: null, is_deleted: 0, is_pinned: 1 },
        include: {
          user: { select: { username: true, avatar: true, is_banned: true } },
        },
        orderBy: { created_at: "desc" },
      });
    }
    const fixedIds = new Set(fixedShouts.map(s => s.id));

    topRaw = await prisma.shout.findMany({
      where: {
        parent_id: null,
        is_pinned: 0,
        NOT: { AND: [{ is_deleted: 1 }, { comments: { none: { is_deleted: 0 } } }] },
        ...(cursor ? { created_at: { lt: cursor } } : {}),
      },
      include: {
        user: { select: { username: true, avatar: true, is_banned: true } },
      },
      orderBy: { created_at: "desc" },
      take: limit + 1,
    });

    // Prepend fixed shouts on the first page only (they don't count toward pagination)
    if (!cursor && fixedShouts.length > 0) {
      topRaw = [...fixedShouts, ...topRaw.filter(s => !fixedIds.has(s.id))];
    }
  }

  const hasMore = topRaw.length > limit;
  const top = hasMore ? topRaw.slice(0, limit) : topRaw;
  const nextCursor = (sortBy !== "popular" && top.length > 0) ? top[top.length - 1].created_at : null;

  const dto = await enrichFeed(top, currentUserId);

  console.log(`[Shouts] Returning ${dto.length} shouts, hasMore=${hasMore}`);
  res.json({ shouts: dto, hasMore, nextCursor });
}));

/* get single shout by id */
router.get("/shouts/:id", asyncHandler(async (req, res) => {
  const currentUserId = req.session?.user?.id ?? null;
  const raw = await prisma.shout.findFirst({
    where: {
      id: req.params.id,
      parent_id: null,
      NOT: { AND: [{ is_deleted: 1 }, { comments: { none: { is_deleted: 0 } } }] },
    },
    include: {
      user: { select: { username: true, avatar: true, is_banned: true } },
    },
  });
  if (!raw) return res.status(404).json({ error: "Запись не найдена" });
  const [dto] = await enrichFeed([raw], currentUserId);
  res.json({ shout: dto });
}));

/* edit shout content (author only, within 1 minute of creation) */
router.put("/shouts/:id", requireAuth, asyncHandler(async (req, res) => {
  const shoutId = req.params.id;
  const userId = req.session.user.id;

  const shout = await prisma.shout.findFirst({
    where: { id: shoutId, is_deleted: 0 },
    select: { id: true, user_id: true, created_at: true },
  });
  if (!shout) return res.status(404).json({ error: "Запись не найдена" });
  if (shout.user_id !== userId) return res.status(403).json({ error: "Можно редактировать только свои записи" });

  const ageMs = Date.now() - new Date(shout.created_at).getTime();
  if (ageMs > EDIT_WINDOW_MS) return res.status(403).json({ error: "Время редактирования истекло" });

  const parsed = editContentSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.code === "custom" || issue?.code === "too_big") return res.status(400).json({ error: `Максимум ${SHOUT_MAX_LENGTH} символов` });
    return res.status(400).json({ error: "Текст не может быть пустым" });
  }

  const { content } = parsed.data;
  await prisma.shout.update({ where: { id: shoutId }, data: { content } });

  console.log(`[Shouts] Edited shout ${shoutId} by ${userId}`);
  broadcast("edit_shout", { shoutId, content });
  res.json({ ok: true });
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

  // Soft-delete the shout only — comments remain accessible
  const [, commentCount] = await prisma.$transaction([
    prisma.shout.update({ where: { id: shoutId }, data: { is_deleted: 1 } }),
    prisma.comment.count({ where: { shout_id: shoutId, is_deleted: 0 } }),
  ]);

  console.log(`[Shouts] Soft-deleted shout ${shoutId} by ${userId}`);
  if (commentCount === 0) {
    broadcast("remove_shout", { shoutId, userId });
  } else {
    broadcast("delete_shout", { shoutId, userId });
  }
  res.json({ ok: true });
}));

/* new shout */
router.post("/shouts", requireAuth, asyncHandler(async (req, res) => {
  const authCheck = await prisma.user.findUnique({ where: { id: req.session.user.id }, select: { is_banned: true } });
  if (authCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });

  const parsed = shoutSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Check the gallery cap before the length check: a too_big on `mediaIds` is
    // about attachment count, not characters, and must not borrow that message.
    if (issue?.path?.[0] === "mediaIds") {
      return res.status(400).json({ error: attachmentLimitMessage() });
    }
    if (issue?.code === "custom" || issue?.code === "too_big") return res.status(400).json({ error: `Максимум ${SHOUT_MAX_LENGTH} символов` });
    return res.status(400).json({ error: "Некорректные данные" });
  }

  const { content, mediaId, mediaIds, youtubeUrl, visibilityTag: rawTag, poll: pollData } = parsed.data;
  const visibilityTag = rawTag || "";

  // R1: the two attachment shapes are mutually exclusive (contract shout-comment-create.md)
  if (mediaId && mediaIds) {
    return res.status(400).json({ error: "Некорректный запрос" });
  }

  // `mediaId` is equivalent to a one-item gallery. Null when neither is present.
  const galleryIds = resolveMediaIds({ mediaId, mediaIds });

  // Must have content or media
  if (!content.trim() && !galleryIds && !youtubeUrl) {
    return res.status(400).json({ error: "Нужен текст или медиа" });
  }

  // Poll requires text
  if (pollData && !content.trim()) {
    return res.status(400).json({ error: "Опрос должен содержать текст" });
  }

  // R3: cannot have both a gallery and YouTube
  if (galleryIds && youtubeUrl) {
    return res.status(400).json({ error: "Можно прикрепить или изображение, или видео" });
  }

  let finalMediaId = null;
  let attachedIds = null;

  if (galleryIds) {
    // R6: no duplicates within one gallery
    if (new Set(galleryIds).size !== galleryIds.length) {
      return res.status(400).json({ error: "Нельзя прикрепить один файл дважды" });
    }

    // R4/R5: every id must exist and be gallery-eligible.
    // Attaching an already-existing Media row is never gated by is_media_allowed —
    // only *creating* new physically-stored media is (upload.js, gifs.js's
    // personal-upload route). A restricted user may still reuse media they (or,
    // per existing behavior, anyone) uploaded before the restriction was applied.
    const rows = await prisma.media.findMany({
      where: { id: { in: galleryIds } },
      select: { id: true, media_type: true, media_meta: true },
    });
    if (rows.length !== galleryIds.length) {
      return res.status(400).json({ error: "Медиа не найдено. Загрузите файл заново" });
    }
    // A single non-gallery attachment (video / giphy / youtube reuse) keeps working
    // exactly as before; only multi-item galleries are restricted to images.
    if (galleryIds.length > 1 && !rows.every((r) => isMultiItemEligible(r.media_type, r.media_meta))) {
      return res.status(400).json({ error: "В галерею можно добавить только изображения" });
    }

    attachedIds = galleryIds;
    finalMediaId = galleryIds[0];
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
    attachedIds = [finalMediaId];
  } else if (content) {
    // Auto-detect YouTube URL in content — unaffected by is_media_allowed,
    // since YouTube is a reference, not media physically stored on our server.
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
      attachedIds = [finalMediaId];
    }
  }

  // NSFW and spoiler only apply when media is present (they blur the media)
  const effectiveTag = ((visibilityTag === "nsfw" || visibilityTag === "spoiler") && !finalMediaId) ? "" : visibilityTag;

  const id = crypto.randomUUID();
  // The attachment list is written in the same transaction as the shout, so a
  // failure can never leave a parent with a half-written list. Every case —
  // gallery, video, YouTube — goes through the same call; there is no
  // separate single-attachment write path.
  await prisma.$transaction(async (tx) => {
    await tx.shout.create({
      data: {
        id,
        user_id: req.session.user.id,
        parent_id: null,
        content,
        visibility_tag: effectiveTag,
      },
    });
    if (attachedIds) {
      await attachMedia(tx, "shout", id, attachedIds);
    }
  });

  const shout = await prisma.shout.findUnique({
    where: { id },
    include: {
      user: { select: { username: true, avatar: true, is_banned: true } },
      galleryItems: { include: { media: true }, orderBy: { position: "asc" } },
    },
  });

  // Create poll if provided
  let pollDto = null;
  if (pollData) {
    const pollId = crypto.randomUUID();
    await prisma.poll.create({
      data: {
        id: pollId,
        shout_id: id,
        multi: pollData.multi ? 1 : 0,
        options: {
          create: pollData.options.map((text, i) => ({
            id: crypto.randomUUID(),
            text,
            votes: 0,
            position: i,
          })),
        },
      },
      include: { options: true },
    });
    const createdPoll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });
    pollDto = {
      id: createdPoll.id,
      multi: !!createdPoll.multi,
      options: createdPoll.options.map(o => ({ id: o.id, text: o.text, votes: 0 })),
      userVotes: [],
      totalVoters: 0,
    };
  }

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
    visibilityTag: shout.visibility_tag || "",
    isDeleted: false,
    isPinned: false,
    ...(shout.galleryItems[0] ? { media: buildMedia(shout.galleryItems[0].media) } : {}),
    // Emitted here too, not just from enrichFeed — this DTO is what goes out over
    // SSE, so without it a live-appended shout would show no gallery (research D10).
    ...(buildGallery(shout.galleryItems) ? { gallery: buildGallery(shout.galleryItems) } : {}),
    ...(pollDto ? { poll: pollDto } : {}),
  };

  console.log(`[Shouts] New shout ${id} by ${req.session.user.name}, media=${finalMediaId || "none"}`);
  broadcast("new_shout", { shoutId: id, userId: req.session.user.id, shout: shoutDto });

  const mentionedIds = extractMentionedUserIds(content, req.session.user.id);
  if (mentionedIds.length > 0) {
    // Filter out users who have ignored the actor
    const ignoreRows = await prisma.ignoredUser.findMany({
      where: { owner_user_id: { in: mentionedIds }, target_user_id: req.session.user.id },
      select: { owner_user_id: true },
    });
    const ignoringSet = new Set(ignoreRows.map(r => r.owner_user_id));
    const filteredIds = mentionedIds.filter(uid => !ignoringSet.has(uid));

    if (filteredIds.length > 0) {
    const now = new Date();
    const notificationRows = filteredIds.map(uid => ({
      id: crypto.randomUUID(),
      user_id: uid,
      actor_id: req.session.user.id,
      type: "mention",
      shout_id: id,
      comment_id: null,
      created_at: now,
    }));
    await prisma.notification.createMany({ data: notificationRows });
    const actor = { id: req.session.user.id, name: req.session.user.name, avatar: req.session.user.avatar };
    const snippet = buildSnippet(content, { spoiler: effectiveTag || false });
    for (const n of notificationRows) {
      broadcastToUser(n.user_id, "notification", {
        id: n.id,
        type: "mention",
        actor,
        shoutId: n.shout_id,
        commentId: null,
        isRead: false,
        timestamp: utcTimestamp(now),
        snippet,
      });
    }
    console.log(`[Shouts] Sent mention notifications for shout ${id} to ${filteredIds.length} user(s)`);
    }
  }

  res.json({ ok: true, id, shout: shoutDto });
}));

export default router;
