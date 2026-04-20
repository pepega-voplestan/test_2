import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { requireAuth, hashPassword, verifyPassword } from "../auth.js";
import { sendVerificationEmail } from "../email.js";
import { asyncHandler, utcTimestamp, avatarFor } from "../helpers/common.js";
import {
  profileUpdateSchema, emailChangeSchema, verifyCodeSchema,
  generateCode, CODE_EXPIRY_MINUTES, CODE_MAX_ATTEMPTS,
} from "../helpers/validation.js";
import { enrichFeed } from "../helpers/feed.js";

const router = Router();

/* list users for mention autocomplete */
router.get("/users/mentions", asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { is_banned: 0 },
    select: { id: true, username: true, avatar: true },
    orderBy: { username: "asc" },
  });
  res.json({ users: users.map(u => ({ id: u.id, name: u.username, avatar: u.avatar })) });
}));

/* get user profile */
router.get("/users/:id", asyncHandler(async (req, res) => {
  const profileId = req.params.id;
  const currentUserId = req.session?.user?.id ?? null;
  const isOwner = currentUserId === profileId;

  console.log(`[Profile] Fetching profile ${profileId}, isOwner=${isOwner}`);

  const row = await prisma.user.findUnique({
    where: { id: profileId },
    select: { id: true, username: true, avatar: true, email: true, is_banned: true, created_at: true, show_nsfw: true, show_politics: true },
  });

  if (!row) return res.status(404).json({ error: "Пользователь не найден" });

  const shoutCount = await prisma.shout.count({
    where: { user_id: profileId, parent_id: null, is_deleted: 0 },
  });

  const profile = {
    id: row.id,
    name: row.username,
    avatar: row.avatar,
    isBanned: !!row.is_banned,
    createdAt: utcTimestamp(row.created_at),
    shoutCount,
    ...(isOwner ? { email: row.email || "", showNsfw: !!row.show_nsfw, showPolitics: !!row.show_politics } : {}),
    isOwner,
  };

  res.json({ profile });
}));

/* get user's shouts */
router.get("/users/:id/shouts", asyncHandler(async (req, res) => {
  const profileId = req.params.id;
  const currentUserId = req.session?.user?.id ?? null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  const offset = parseInt(req.query.offset, 10) || 0;

  console.log(`[Profile] Fetching shouts for user ${profileId}: limit=${limit}, offset=${offset}`);

  const topRaw = await prisma.shout.findMany({
    where: { user_id: profileId, parent_id: null, is_deleted: 0 },
    include: {
      user: { select: { username: true, avatar: true, is_banned: true } },
      media: true,
    },
    orderBy: { created_at: "desc" },
    take: limit + 1,
    skip: offset,
  });

  const hasMore = topRaw.length > limit;
  const top = hasMore ? topRaw.slice(0, limit) : topRaw;

  const dto = await enrichFeed(top, currentUserId);

  console.log(`[Profile] Returning ${dto.length} shouts for user ${profileId}, hasMore=${hasMore}`);
  res.json({ shouts: dto, hasMore });
}));

/* update user profile */
router.put("/users/:id", requireAuth, asyncHandler(async (req, res) => {
  const profileId = req.params.id;
  const currentUserId = req.session.user.id;

  if (profileId !== currentUserId) {
    return res.status(403).json({ error: "Нельзя редактировать чужой профиль" });
  }

  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const field = firstIssue?.path[0];
    if (field === "username") {
      return res.status(400).json({ error: firstIssue.message || "Имя пользователя: от 3 до 32 символов" });
    }
    return res.status(400).json({ error: "Некорректные данные" });
  }

  const { username, avatar, currentPassword, newPassword, showNsfw, showPolitics } = parsed.data;
  console.log(`[Profile] Update attempt for user ${currentUserId}`);

  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: "Введите текущий пароль" });
    }
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { password_hash: true },
    });
    const ok = await verifyPassword(currentPassword, user.password_hash);
    if (!ok) {
      console.log(`[Profile] Password change failed: wrong current password`);
      return res.status(400).json({ error: "Неверный текущий пароль" });
    }
    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: currentUserId },
      data: { password_hash: newHash },
    });
    console.log(`[Profile] Password updated for ${currentUserId}`);
  }

  if (username && username !== req.session.user.name) {
    const exists = await prisma.user.findFirst({
      where: { username, NOT: { id: currentUserId } },
      select: { id: true },
    });
    if (exists) {
      return res.status(409).json({ error: "Это имя пользователя уже занято" });
    }
    await prisma.user.update({
      where: { id: currentUserId },
      data: { username },
    });
    req.session.user.name = username;
    console.log(`[Profile] Username updated to "${username}"`);
  }

  if (avatar !== undefined) {
    const newAvatar = avatar.trim() || avatarFor(req.session.user.name);
    await prisma.user.update({
      where: { id: currentUserId },
      data: { avatar: newAvatar },
    });
    req.session.user.avatar = newAvatar;
    console.log(`[Profile] Avatar updated`);
  }

  if (showNsfw !== undefined || showPolitics !== undefined) {
    const prefsData = {};
    if (showNsfw !== undefined) prefsData.show_nsfw = showNsfw ? 1 : 0;
    if (showPolitics !== undefined) prefsData.show_politics = showPolitics ? 1 : 0;
    await prisma.user.update({
      where: { id: currentUserId },
      data: prefsData,
    });
    if (showNsfw !== undefined) req.session.user.showNsfw = showNsfw;
    if (showPolitics !== undefined) req.session.user.showPolitics = showPolitics;
    console.log(`[Profile] Content preferences updated`);
  }

  const updated = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { id: true, username: true, avatar: true, email: true, created_at: true, show_nsfw: true, show_politics: true },
  });

  res.json({
    ok: true,
    user: { id: updated.id, name: updated.username, avatar: updated.avatar },
    profile: {
      id: updated.id,
      name: updated.username,
      avatar: updated.avatar,
      email: updated.email || "",
      showNsfw: !!updated.show_nsfw,
      showPolitics: !!updated.show_politics,
      createdAt: utcTimestamp(updated.created_at),
      isOwner: true,
    },
  });
}));

/* email change step 1: send verification code to new email */
router.post("/users/:id/email/send-code", requireAuth, asyncHandler(async (req, res) => {
  const profileId = req.params.id;
  const currentUserId = req.session.user.id;

  if (profileId !== currentUserId) {
    return res.status(403).json({ error: "Нельзя редактировать чужой профиль" });
  }

  const parsed = emailChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Введите корректный email" });
  }

  const { email } = parsed.data;
  console.log(`[Profile] Email change send-code for user ${currentUserId} → ${email}`);

  // Check if this email is already taken
  const existsEmail = await prisma.user.findFirst({
    where: { email, NOT: { id: currentUserId } },
    select: { id: true },
  });
  if (existsEmail) {
    return res.status(409).json({ error: "Этот email уже используется" });
  }

  // Invalidate any existing unused codes for this purpose
  await prisma.verificationCode.updateMany({
    where: { email, purpose: "email_change", used: 0 },
    data: { used: 1 },
  });

  const code = generateCode();
  const id = crypto.randomUUID();
  const expires_at = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
  const payload = JSON.stringify({ userId: currentUserId, newEmail: email });

  await prisma.verificationCode.create({
    data: { id, email, code, purpose: "email_change", payload, expires_at },
  });

  try {
    await sendVerificationEmail(email, code, "email_change");
  } catch (err) {
    console.error(`[Profile] Failed to send email change code to ${email}:`, err.message);
    return res.status(500).json({ error: err.message });
  }

  console.log(`[Profile] Email change code sent to ${email} for user ${currentUserId}`);
  res.json({ ok: true });
}));

/* email change step 2: verify code and update email */
router.post("/users/:id/email/verify", requireAuth, asyncHandler(async (req, res) => {
  const profileId = req.params.id;
  const currentUserId = req.session.user.id;

  if (profileId !== currentUserId) {
    return res.status(403).json({ error: "Нельзя редактировать чужой профиль" });
  }

  const parsed = verifyCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Введите 6-значный код из письма" });
  }

  const { email, code } = parsed.data;
  console.log(`[Profile] Email change verify for user ${currentUserId}, email=${email}`);

  const record = await prisma.verificationCode.findFirst({
    where: { email, purpose: "email_change", used: 0 },
    orderBy: { created_at: "desc" },
  });

  if (!record) {
    return res.status(400).json({ error: "Код не найден. Запросите новый код" });
  }

  // Verify the code belongs to this user
  const { userId } = JSON.parse(record.payload);
  if (userId !== currentUserId) {
    return res.status(403).json({ error: "Код не принадлежит вашему аккаунту" });
  }

  // Check expiry
  const now = new Date();
  const expiresAt = new Date(record.expires_at);
  if (now > expiresAt) {
    await prisma.verificationCode.update({ where: { id: record.id }, data: { used: 1 } });
    return res.status(400).json({ error: "Код истёк. Запросите новый код" });
  }

  // Check attempts
  if (record.attempts >= CODE_MAX_ATTEMPTS) {
    await prisma.verificationCode.update({ where: { id: record.id }, data: { used: 1 } });
    return res.status(400).json({ error: "Слишком много попыток. Запросите новый код" });
  }

  // Increment attempts
  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { attempts: { increment: 1 } },
  });

  if (record.code !== code) {
    const remaining = CODE_MAX_ATTEMPTS - record.attempts - 1;
    return res.status(400).json({
      error: remaining > 0
        ? `Неверный код. Осталось попыток: ${remaining}`
        : "Неверный код. Запросите новый код",
    });
  }

  // Mark code as used
  await prisma.verificationCode.update({ where: { id: record.id }, data: { used: 1 } });

  // Re-check uniqueness (race condition guard)
  const existsEmail = await prisma.user.findFirst({
    where: { email, NOT: { id: currentUserId } },
    select: { id: true },
  });
  if (existsEmail) {
    return res.status(409).json({ error: "Этот email уже используется" });
  }

  // Update email
  await prisma.user.update({
    where: { id: currentUserId },
    data: { email },
  });

  console.log(`[Profile] Email updated to "${email}" for user ${currentUserId}`);
  res.json({ ok: true, email });
}));

export default router;
