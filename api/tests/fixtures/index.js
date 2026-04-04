/**
 * Test fixture factories — create records directly via Prisma.
 * All functions return the created record. Users also include `_rawPassword`.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getTestPrisma } from "../helpers.js";

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");

const DEFAULT_PASSWORD = "testpass123";

/**
 * Create a user with a hashed password.
 * @returns {Promise<object>} User record + `_rawPassword`
 */
export async function createUser(overrides = {}) {
  const prisma = getTestPrisma();
  const id = overrides.id || uuid();
  const username = overrides.username || `user_${id.slice(0, 8)}`;
  const rawPassword = overrides.password || DEFAULT_PASSWORD;
  const passwordHash = await bcrypt.hash(rawPassword, 4); // low rounds for speed

  const user = await prisma.user.create({
    data: {
      id,
      username,
      password_hash: passwordHash,
      avatar: overrides.avatar || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(username)}`,
      email: overrides.email || `${username}@test.local`,
      is_banned: overrides.is_banned ?? 0,
      created_at: overrides.created_at || now(),
    },
  });

  return { ...user, _rawPassword: rawPassword };
}

/**
 * Create a shout.
 */
export async function createShout(overrides = {}) {
  const prisma = getTestPrisma();
  if (!overrides.userId) throw new Error("createShout requires userId");

  return prisma.shout.create({
    data: {
      id: overrides.id || uuid(),
      user_id: overrides.userId,
      content: overrides.content || "Test shout content",
      media_id: overrides.mediaId || null,
      is_deleted: overrides.is_deleted ?? 0,
      created_at: overrides.created_at || now(),
    },
  });
}

/**
 * Create a comment on a shout.
 */
export async function createComment(overrides = {}) {
  const prisma = getTestPrisma();
  if (!overrides.shoutId) throw new Error("createComment requires shoutId");
  if (!overrides.userId) throw new Error("createComment requires userId");

  return prisma.comment.create({
    data: {
      id: overrides.id || uuid(),
      shout_id: overrides.shoutId,
      user_id: overrides.userId,
      content: overrides.content || "Test comment content",
      media_id: overrides.mediaId || null,
      is_deleted: overrides.is_deleted ?? 0,
      created_at: overrides.created_at || now(),
    },
  });
}

/**
 * Create a media record.
 */
export async function createMedia(overrides = {}) {
  const prisma = getTestPrisma();
  if (!overrides.userId) throw new Error("createMedia requires userId");

  return prisma.media.create({
    data: {
      id: overrides.id || uuid(),
      user_id: overrides.userId,
      media_type: overrides.mediaType || "image",
      media_url: overrides.mediaUrl || "uploads/test/image.webp",
      media_meta: overrides.mediaMeta || JSON.stringify({ w: 320, h: 240, size: 1024, mime: "image/webp", animated: false }),
      created_at: overrides.created_at || now(),
    },
  });
}

/**
 * Create an announcement.
 */
export async function createAnnouncement(overrides = {}) {
  const prisma = getTestPrisma();

  return prisma.announcement.create({
    data: {
      id: overrides.id || uuid(),
      content: overrides.content || "Test announcement",
      is_deleted: overrides.is_deleted ?? 0,
      created_at: overrides.created_at || now(),
    },
  });
}

/**
 * Create a notification.
 */
export async function createNotification(overrides = {}) {
  const prisma = getTestPrisma();
  if (!overrides.userId) throw new Error("createNotification requires userId");
  if (!overrides.actorId) throw new Error("createNotification requires actorId");

  return prisma.notification.create({
    data: {
      id: overrides.id || uuid(),
      user_id: overrides.userId,
      actor_id: overrides.actorId,
      type: overrides.type || "mention",
      shout_id: overrides.shoutId || null,
      comment_id: overrides.commentId || null,
      is_read: overrides.is_read ?? 0,
      created_at: overrides.created_at || now(),
    },
  });
}

/**
 * Create a shout like.
 */
export async function createShoutLike(overrides = {}) {
  const prisma = getTestPrisma();
  if (!overrides.shoutId) throw new Error("createShoutLike requires shoutId");
  if (!overrides.userId) throw new Error("createShoutLike requires userId");

  return prisma.shoutLike.create({
    data: {
      shout_id: overrides.shoutId,
      user_id: overrides.userId,
    },
  });
}

/**
 * Create a comment like.
 */
export async function createCommentLike(overrides = {}) {
  const prisma = getTestPrisma();
  if (!overrides.commentId) throw new Error("createCommentLike requires commentId");
  if (!overrides.userId) throw new Error("createCommentLike requires userId");

  return prisma.commentLike.create({
    data: {
      comment_id: overrides.commentId,
      user_id: overrides.userId,
    },
  });
}

/**
 * Create an ignored user relationship.
 */
export async function createIgnoredUser(overrides = {}) {
  const prisma = getTestPrisma();
  if (!overrides.ownerUserId) throw new Error("createIgnoredUser requires ownerUserId");
  if (!overrides.targetUserId) throw new Error("createIgnoredUser requires targetUserId");

  return prisma.ignoredUser.create({
    data: {
      id: overrides.id || uuid(),
      owner_user_id: overrides.ownerUserId,
      target_user_id: overrides.targetUserId,
      created_at: overrides.created_at || now(),
      updated_at: overrides.updated_at || now(),
    },
  });
}

/**
 * Create a poll attached to a shout.
 */
export async function createPoll(overrides = {}) {
  const prisma = getTestPrisma();
  if (!overrides.shoutId) throw new Error("createPoll requires shoutId");

  const options = overrides.options || ["Option A", "Option B"];

  return prisma.poll.create({
    data: {
      id: overrides.id || uuid(),
      shout_id: overrides.shoutId,
      multi: overrides.multi ?? 0,
      options: {
        create: options.map(text => ({
          id: uuid(),
          text,
          votes: 0,
        })),
      },
    },
    include: { options: true },
  });
}

/**
 * Create a poll vote.
 */
export async function createPollVote(overrides = {}) {
  const prisma = getTestPrisma();
  if (!overrides.optionId) throw new Error("createPollVote requires optionId");
  if (!overrides.userId) throw new Error("createPollVote requires userId");

  const vote = await prisma.pollVote.create({
    data: {
      id: overrides.id || uuid(),
      option_id: overrides.optionId,
      user_id: overrides.userId,
    },
  });

  // Increment the option vote count
  await prisma.pollOption.update({
    where: { id: overrides.optionId },
    data: { votes: { increment: 1 } },
  });

  return vote;
}

/**
 * Create a social link for a user.
 */
export async function createSocial(overrides = {}) {
  const prisma = getTestPrisma();
  if (!overrides.userId) throw new Error("createSocial requires userId");

  return prisma.social.create({
    data: {
      id: overrides.id || uuid(),
      user_id: overrides.userId,
      type: overrides.type || "steam",
      url: overrides.url || "https://steamcommunity.com/id/testuser",
      display: overrides.display || "testuser",
      created_at: overrides.created_at || now(),
      updated_at: overrides.updated_at || now(),
    },
  });
}

/**
 * Create a verification code.
 */
export async function createVerificationCode(overrides = {}) {
  const prisma = getTestPrisma();

  return prisma.verificationCode.create({
    data: {
      id: overrides.id || uuid(),
      email: overrides.email || "test@test.local",
      code: overrides.code || "123456",
      purpose: overrides.purpose || "register",
      payload: overrides.payload || null,
      expires_at: overrides.expires_at || new Date(Date.now() + 10 * 60 * 1000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, ""),
      used: overrides.used ?? 0,
      attempts: overrides.attempts ?? 0,
      created_at: overrides.created_at || now(),
    },
  });
}
