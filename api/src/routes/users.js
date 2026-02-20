import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, hashPassword, verifyPassword } from "../auth.js";
import { asyncHandler, utcTimestamp, avatarFor } from "../helpers/common.js";
import { profileUpdateSchema } from "../helpers/validation.js";
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
    select: { id: true, username: true, avatar: true, email: true, is_banned: true, created_at: true },
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
    ...(isOwner ? { email: row.email || "" } : {}),
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
    const field = parsed.error.issues[0]?.path[0];
    if (field === "email") return res.status(400).json({ error: "Введите корректный email" });
    if (field === "username") return res.status(400).json({ error: "Имя пользователя: от 3 до 32 символов" });
    return res.status(400).json({ error: "Некорректные данные" });
  }

  const { username, email, avatar, currentPassword, newPassword } = parsed.data;
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

  if (email !== undefined) {
    const trimmed = email.trim();
    if (trimmed) {
      const existsEmail = await prisma.user.findFirst({
        where: { email: trimmed, NOT: { id: currentUserId } },
        select: { id: true },
      });
      if (existsEmail) {
        return res.status(409).json({ error: "Этот email уже используется" });
      }
      await prisma.user.update({
        where: { id: currentUserId },
        data: { email: trimmed },
      });
    } else {
      await prisma.user.update({
        where: { id: currentUserId },
        data: { email: null },
      });
    }
    console.log(`[Profile] Email updated`);
  }

  const updated = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { id: true, username: true, avatar: true, email: true, created_at: true },
  });

  res.json({
    ok: true,
    user: { id: updated.id, name: updated.username, avatar: updated.avatar },
    profile: {
      id: updated.id,
      name: updated.username,
      avatar: updated.avatar,
      email: updated.email || "",
      createdAt: utcTimestamp(updated.created_at),
      isOwner: true,
    },
  });
}));

export default router;
