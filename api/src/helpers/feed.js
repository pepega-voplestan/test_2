import { prisma } from "../db.js";
import { buildMedia } from "./media.js";
import { utcTimestamp } from "./common.js";

export async function enrichFeed(topShouts, currentUserId) {
  const topIds = topShouts.map((s) => s.id);

  // Fetch comments
  const comments = topIds.length
    ? await prisma.comment.findMany({
        where: { shout_id: { in: topIds }, is_deleted: 0 },
        include: {
          user: { select: { username: true, avatar: true, is_banned: true } },
          media: true,
        },
        orderBy: { created_at: "asc" },
      })
    : [];

  const commentIds = comments.map((c) => c.id);

  // Shout like counts
  const shoutLikesCount = new Map();
  if (topIds.length) {
    const rows = await prisma.shoutLike.groupBy({
      by: ["shout_id"],
      where: { shout_id: { in: topIds } },
      _count: { shout_id: true },
    });
    for (const r of rows) shoutLikesCount.set(r.shout_id, r._count.shout_id);
  }

  // Shouts liked by current user
  const shoutLikedSet = new Set();
  if (currentUserId && topIds.length) {
    const rows = await prisma.shoutLike.findMany({
      where: { user_id: currentUserId, shout_id: { in: topIds } },
      select: { shout_id: true },
    });
    for (const r of rows) shoutLikedSet.add(r.shout_id);
  }

  // Comment like counts
  const commentLikesCount = new Map();
  if (commentIds.length) {
    const rows = await prisma.commentLike.groupBy({
      by: ["comment_id"],
      where: { comment_id: { in: commentIds } },
      _count: { comment_id: true },
    });
    for (const r of rows) commentLikesCount.set(r.comment_id, r._count.comment_id);
  }

  // Comments liked by current user
  const commentLikedSet = new Set();
  if (currentUserId && commentIds.length) {
    const rows = await prisma.commentLike.findMany({
      where: { user_id: currentUserId, comment_id: { in: commentIds } },
      select: { comment_id: true },
    });
    for (const r of rows) commentLikedSet.add(r.comment_id);
  }

  // Group comments by shout
  const commentsByShout = new Map();
  for (const c of comments) {
    if (!commentsByShout.has(c.shout_id)) commentsByShout.set(c.shout_id, []);
    commentsByShout.get(c.shout_id).push(c);
  }

  function mapComment(row) {
    const media = buildMedia(row.media);
    return {
      id: row.id,
      shoutId: row.shout_id,
      user: {
        id: row.user_id,
        name: row.user.username,
        avatar: row.user.avatar,
        isBanned: !!row.user.is_banned,
      },
      content: row.content,
      timestamp: utcTimestamp(row.created_at),
      likes: commentLikesCount.get(row.id) || 0,
      likedBy: currentUserId && commentLikedSet.has(row.id) ? [currentUserId] : [],
      ...(media ? { media } : {}),
    };
  }

  function mapShout(row, children) {
    const isDeleted = !!row.is_deleted;
    const media = isDeleted ? undefined : buildMedia(row.media);
    return {
      id: row.id,
      user: isDeleted
        ? null
        : {
            id: row.user_id,
            name: row.user.username,
            avatar: row.user.avatar,
            isBanned: !!row.user.is_banned,
          },
      content: isDeleted ? "" : row.content,
      timestamp: utcTimestamp(row.created_at),
      likes: shoutLikesCount.get(row.id) || 0,
      likedBy: currentUserId && shoutLikedSet.has(row.id) ? [currentUserId] : [],
      ...(media ? { media } : {}),
      comments: children,
      visibilityTag: row.visibility_tag || "",
      isDeleted,
      isFixed: !!row.is_fixed,
    };
  }

  const dto = topShouts.map((t) => {
    const children = (commentsByShout.get(t.id) || []).map((c) => mapComment(c));
    return mapShout(t, children);
  });

  return dto;
}
