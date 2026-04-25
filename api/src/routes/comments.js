import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { broadcast, broadcastToUser } from "../sse.js";
import { asyncHandler, utcTimestamp, resolveQuoteText } from "../helpers/common.js";
import { extractMentionedUserIds, buildSnippet } from "../helpers/mentions.js";
import { commentSchema, editContentSchema, SHOUT_MAX_LENGTH, EDIT_WINDOW_MS } from "../helpers/validation.js";
import { extractYouTubeId, fetchYouTubeMeta, buildMedia } from "../helpers/media.js";

const router = Router();


/* reply (create comment) */
router.post("/shouts/:id/replies", requireAuth, asyncHandler(async (req, res) => {
  const banCheck = await prisma.user.findUnique({ where: { id: req.session.user.id }, select: { is_banned: true } });
  if (banCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });

  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.code === "custom" || issue?.code === "too_big") return res.status(400).json({ error: `Максимум ${SHOUT_MAX_LENGTH} символов` });
    return res.status(400).json({ error: "Ответ не может быть пустым" });
  }

  const shoutId = req.params.id;
  const parent = await prisma.shout.findFirst({
    where: { id: shoutId },
    select: { id: true, user_id: true, is_deleted: true, visibility_tag: true },
  });
  if (!parent)
    return res.status(404).json({ error: "Запись не найдена" });

  const { content, mediaId, youtubeUrl, replyToId } = parsed.data;

  // Must have content or media
  if (!content.trim() && !mediaId && !youtubeUrl) {
    return res.status(400).json({ error: "Нужен текст или медиа" });
  }

  if (mediaId && youtubeUrl) {
    return res.status(400).json({ error: "Можно прикрепить или изображение, или видео" });
  }

  // Validate reply_to if provided
  let referencedComment = null;
  if (replyToId) {
    referencedComment = await prisma.comment.findUnique({
      where: { id: replyToId },
      select: { id: true, shout_id: true, is_deleted: true, content: true, user: { select: { id: true, username: true } }, media: { select: { media_type: true } } },
    });
    if (!referencedComment || referencedComment.shout_id !== shoutId) {
      return res.status(400).json({ error: "Комментарий для цитирования не найден" });
    }
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
      reply_to: replyToId ?? null,
    },
    include: {
      user: { select: { username: true, avatar: true, is_banned: true } },
      media: true,
    },
  });

  const quote = referencedComment
    ? referencedComment.is_deleted > 0
      ? { text: "Комментарий удалён", deleted: true, author: null }
      : { ...resolveQuoteText(referencedComment.content, referencedComment.media), deleted: false, author: { id: referencedComment.user.id, name: referencedComment.user.username } }
    : null;

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
    replyToId: replyToId ?? null,
    quote,
    ...(comment.media ? { media: buildMedia(comment.media) } : {}),
  };

  console.log(`[Comments] Comment ${id} on shout ${shoutId} by ${req.session.user.name}, media=${finalMediaId || "none"}`);
  broadcast("new_comment", { shoutId, commentId: id, userId: req.session.user.id, comment: commentDto });

  const rawMentionedIds = extractMentionedUserIds(content, req.session.user.id);
  // If the shout is deleted, suppress all notifications to its author
  const shoutDeleted = !!parent.is_deleted;
  const mentionedIds = shoutDeleted
    ? rawMentionedIds.filter(uid => uid !== parent.user_id)
    : rawMentionedIds;
  const now = new Date();
  const actor = { id: req.session.user.id, name: req.session.user.name, avatar: req.session.user.avatar };
  // Only spoiler the snippet if the comment's own content has inline spoilers;
  // the parent shout's visibility_tag does NOT spoiler comment notifications
  const snippet = buildSnippet(content);

  // The author of the comment being directly replied to (via replyToId) — may be null
  const replyCommentAuthorId = (referencedComment && !referencedComment.is_deleted && referencedComment.user.id !== req.session.user.id)
    ? referencedComment.user.id
    : null;

  // Collect all potential notification recipients and filter out those who ignore the actor
  const allRecipientIds = [...new Set([
    ...mentionedIds,
    ...(!shoutDeleted && parent.user_id !== req.session.user.id ? [parent.user_id] : []),
    ...(replyCommentAuthorId ? [replyCommentAuthorId] : []),
  ])];
  const ignoreRows = allRecipientIds.length > 0
    ? await prisma.ignoredUser.findMany({
        where: { owner_user_id: { in: allRecipientIds }, target_user_id: req.session.user.id },
        select: { owner_user_id: true },
      })
    : [];
  const ignoringSet = new Set(ignoreRows.map(r => r.owner_user_id));

  const filteredMentionIds = mentionedIds.filter(uid => !ignoringSet.has(uid));

  if (filteredMentionIds.length > 0) {
    const notificationRows = filteredMentionIds.map(uid => ({
      id: crypto.randomUUID(),
      user_id: uid,
      actor_id: req.session.user.id,
      type: "mention",
      shout_id: shoutId,
      comment_id: id,
      created_at: now,
    }));
    await prisma.notification.createMany({ data: notificationRows });
    for (const n of notificationRows) {
      broadcastToUser(n.user_id, "notification", {
        id: n.id,
        type: "mention",
        actor,
        shoutId: n.shout_id,
        commentId: n.comment_id,
        isRead: false,
        timestamp: utcTimestamp(now),
        snippet,
      });
    }
    console.log(`[Comments] Sent mention notifications for comment ${id} to ${filteredMentionIds.length} user(s)`);
  }

  // Notify shout author of the reply (skip if deleted, commenter is author, already mentioned, or ignoring actor)
  const shoutAuthorId = parent.user_id;
  const shoutAuthorGetsReply = !shoutDeleted && shoutAuthorId !== req.session.user.id && !mentionedIds.includes(shoutAuthorId) && !ignoringSet.has(shoutAuthorId);
  if (shoutAuthorGetsReply) {
    const replyNotifId = crypto.randomUUID();
    await prisma.notification.create({
      data: {
        id: replyNotifId,
        user_id: shoutAuthorId,
        actor_id: req.session.user.id,
        type: "reply",
        shout_id: shoutId,
        comment_id: id,
        created_at: now,
      },
    });
    broadcastToUser(shoutAuthorId, "notification", {
      id: replyNotifId,
      type: "reply",
      actor,
      shoutId,
      commentId: id,
      isRead: false,
      timestamp: utcTimestamp(now),
      snippet,
    });
    console.log(`[Comments] Sent reply notification for comment ${id} to shout author ${shoutAuthorId}`);
  }

  // Notify the directly-quoted comment's author (always, regardless of @mention in text)
  // Skip if: they're the same as shout author (already notified above), already getting a mention, or ignoring actor
  if (replyCommentAuthorId && !mentionedIds.includes(replyCommentAuthorId) && !ignoringSet.has(replyCommentAuthorId) && !(replyCommentAuthorId === shoutAuthorId && shoutAuthorGetsReply)) {
    const replyCommentNotifId = crypto.randomUUID();
    await prisma.notification.create({
      data: {
        id: replyCommentNotifId,
        user_id: replyCommentAuthorId,
        actor_id: req.session.user.id,
        type: "reply",
        shout_id: shoutId,
        comment_id: id,
        created_at: now,
      },
    });
    broadcastToUser(replyCommentAuthorId, "notification", {
      id: replyCommentNotifId,
      type: "reply",
      actor,
      shoutId,
      commentId: id,
      isRead: false,
      timestamp: utcTimestamp(now),
      snippet,
    });
    console.log(`[Comments] Sent reply notification for comment ${id} to quoted comment author ${replyCommentAuthorId}`);
  }

  res.json({ ok: true, id, ...(mediaDto ? { media: mediaDto } : {}), ...(quote ? { quote } : {}) });
}));

/* edit comment content (author only, within 1 minute of creation) */
router.put("/comments/:id", requireAuth, asyncHandler(async (req, res) => {
  const commentId = req.params.id;
  const userId = req.session.user.id;

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, is_deleted: 0 },
    select: { id: true, user_id: true, shout_id: true, created_at: true },
  });
  if (!comment) return res.status(404).json({ error: "Комментарий не найден" });
  if (comment.user_id !== userId) return res.status(403).json({ error: "Можно редактировать только свои комментарии" });

  const ageMs = Date.now() - new Date(comment.created_at).getTime();
  if (ageMs > EDIT_WINDOW_MS) return res.status(403).json({ error: "Время редактирования истекло" });

  const parsed = editContentSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.code === "custom" || issue?.code === "too_big") return res.status(400).json({ error: `Максимум ${SHOUT_MAX_LENGTH} символов` });
    return res.status(400).json({ error: "Текст не может быть пустым" });
  }

  const { content } = parsed.data;
  await prisma.comment.update({ where: { id: commentId }, data: { content } });

  console.log(`[Comments] Edited comment ${commentId} by ${userId}`);
  broadcast("edit_comment", { shoutId: comment.shout_id, commentId, content });
  res.json({ ok: true });
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
