import { prisma } from "../db.js";
import { buildMedia, buildGallery } from "./media.js";
import { utcTimestamp, resolveQuoteText } from "./common.js";


export async function enrichFeed(topShouts, currentUserId) {
  const topIds = topShouts.map((s) => s.id);

  // Fetch comments
  const comments = topIds.length
    ? await prisma.comment.findMany({
        where: { shout_id: { in: topIds }, is_deleted: 0 },
        include: {
          user: { select: { username: true, avatar: true, is_banned: true } },
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

  // Fetch polls for these shouts
  const polls = topIds.length
    ? await prisma.poll.findMany({
        where: { shout_id: { in: topIds } },
        include: { options: { orderBy: { position: "asc" } } },
      })
    : [];

  const pollsByShout = new Map();
  for (const p of polls) pollsByShout.set(p.shout_id, p);

  // Fetch current user's poll votes
  const userPollVotes = new Map(); // pollId → Set<optionId>
  if (currentUserId && polls.length) {
    const pollIds = polls.map(p => p.id);
    const votes = await prisma.pollVote.findMany({
      where: { user_id: currentUserId, option: { poll_id: { in: pollIds } } },
      select: { option_id: true, option: { select: { poll_id: true } } },
    });
    for (const v of votes) {
      if (!userPollVotes.has(v.option.poll_id)) userPollVotes.set(v.option.poll_id, new Set());
      userPollVotes.get(v.option.poll_id).add(v.option_id);
    }
  }

  // Count unique voters per poll
  const pollVoterCounts = new Map(); // pollId → number
  if (polls.length) {
    const pollIds = polls.map(p => p.id);
    for (const pid of pollIds) {
      const count = await prisma.pollVote.findMany({
        where: { option: { poll_id: pid } },
        select: { user_id: true },
      });
      const uniqueUsers = new Set(count.map(v => v.user_id));
      pollVoterCounts.set(pid, uniqueUsers.size);
    }
  }

  // Batch-fetch quoted comments (any is_deleted value — we show tombstone for deleted ones)
  const replyToIds = [...new Set(comments.map(c => c.reply_to).filter(Boolean))];
  const quotedComments = replyToIds.length
    ? await prisma.comment.findMany({
        where: { id: { in: replyToIds } },
        select: {
          id: true,
          content: true,
          is_deleted: true,
          user: { select: { id: true, username: true } },
          galleryItems: {
            where: { position: 0 },
            select: { media: { select: { media_type: true } } },
          },
        },
      })
    : [];
  const quoteMap = new Map();
  for (const qc of quotedComments) {
    quoteMap.set(qc.id, qc.is_deleted > 0
      ? { text: "Комментарий удалён", deleted: true, author: null }
      : { ...resolveQuoteText(qc.content, qc.galleryItems[0]?.media), deleted: false, author: { id: qc.user.id, name: qc.user.username } }
    );
  }

  // Group comments by shout
  const commentsByShout = new Map();
  for (const c of comments) {
    if (!commentsByShout.has(c.shout_id)) commentsByShout.set(c.shout_id, []);
    commentsByShout.get(c.shout_id).push(c);
  }

  // Batch-load galleries for the whole page (feature 006). One query per parent
  // type regardless of page size — never per-shout, which would be an N+1.
  const galleryByShout = new Map();
  if (topIds.length) {
    const rows = await prisma.shoutMedia.findMany({
      where: { shout_id: { in: topIds } },
      include: { media: true },
      orderBy: { position: "asc" },
    });
    for (const r of rows) {
      if (!galleryByShout.has(r.shout_id)) galleryByShout.set(r.shout_id, []);
      galleryByShout.get(r.shout_id).push(r);
    }
  }

  const galleryByComment = new Map();
  if (commentIds.length) {
    const rows = await prisma.commentMedia.findMany({
      where: { comment_id: { in: commentIds } },
      include: { media: true },
      orderBy: { position: "asc" },
    });
    for (const r of rows) {
      if (!galleryByComment.has(r.comment_id)) galleryByComment.set(r.comment_id, []);
      galleryByComment.get(r.comment_id).push(r);
    }
  }

  function mapComment(row) {
    const items = galleryByComment.get(row.id);
    const media = buildMedia(items?.[0]?.media);
    // Omitted entirely for 0/1 items, so single-media payloads stay byte-identical.
    const gallery = buildGallery(items);
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
      replyToId: row.reply_to ?? null,
      quote: row.reply_to ? (quoteMap.get(row.reply_to) ?? null) : null,
      ...(media ? { media } : {}),
      ...(gallery ? { gallery } : {}),
    };
  }

  function mapShout(row, children) {
    const isDeleted = !!row.is_deleted;
    const items = galleryByShout.get(row.id);
    const media = isDeleted ? undefined : buildMedia(items?.[0]?.media);
    // Suppressed for soft-deleted shouts alongside `media` (contract G6).
    const gallery = isDeleted ? undefined : buildGallery(items);
    const poll = pollsByShout.get(row.id);
    const pollDto = poll && !isDeleted
      ? {
          id: poll.id,
          multi: !!poll.multi,
          options: poll.options.map(o => ({ id: o.id, text: o.text, votes: o.votes })),
          userVotes: [...(userPollVotes.get(poll.id) || [])],
          totalVoters: pollVoterCounts.get(poll.id) || 0,
        }
      : undefined;
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
      ...(gallery ? { gallery } : {}),
      ...(pollDto ? { poll: pollDto } : {}),
      comments: children,
      visibilityTag: row.visibility_tag || "",
      isDeleted,
      isPinned: !!row.is_pinned,
    };
  }

  const dto = topShouts.map((t) => {
    const children = (commentsByShout.get(t.id) || []).map((c) => mapComment(c));
    return mapShout(t, children);
  });

  return dto;
}
