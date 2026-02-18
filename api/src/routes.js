import { z } from "zod";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import sharp from "sharp";
import { prisma } from "./db.js";
import { hashPassword, verifyPassword, requireAuth } from "./auth.js";
import { sendVerificationEmail } from "./email.js";

const AVATAR_DIR = path.join(path.dirname(process.env.DATABASE_URL), "avatars");
const AVATAR_SIZES = [64, 128, 256];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const AVATAR_MIN_DIM = 256;
const IMAGE_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Допустимые форматы: JPG, PNG, WebP"));
    }
    cb(null, true);
  },
});

/* ---------- Media upload constants ---------- */

const MEDIA_DIR = process.env.MEDIA_PATH;
const MEDIA_TMP_DIR = path.join(MEDIA_DIR, ".tmp");
const MEDIA_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MEDIA_MAX_DIM = 4096;
const MEDIA_MAX_PIXELS = 16_000_000; // 16 MP
const MEDIA_VARIANTS = [320, 960, 1600];

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Допустимые форматы: JPG, PNG, WebP"));
    }
    cb(null, true);
  },
});

try {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.mkdirSync(MEDIA_TMP_DIR, { recursive: true });
} catch (e) {
  console.error("[Media] Could not create media directories:", e.message);
}

/* ---------- YouTube helpers ---------- */

const YOUTUBE_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
];

function extractYouTubeId(text) {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function fetchYouTubeMeta(videoId) {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { videoId };
    const data = await res.json();
    return { videoId, title: data.title || null, channel: data.author_name || null };
  } catch (e) {
    console.error("[YouTube] oEmbed fetch failed:", e.message);
    return { videoId };
  }
}

/* ---------- Media DTO helper ---------- */

function buildMedia(mediaObj) {
  if (!mediaObj) return undefined;
  if (mediaObj.media_type === "image") {
    const meta = JSON.parse(mediaObj.media_meta || "{}");
    return {
      type: "image",
      url: `/media/${mediaObj.media_url}/960.webp`,
      thumb: `/media/${mediaObj.media_url}/320.webp`,
      full: `/media/${mediaObj.media_url}/1600.webp`,
      width: meta.w || 0,
      height: meta.h || 0,
    };
  }
  if (mediaObj.media_type === "youtube") {
    const meta = JSON.parse(mediaObj.media_meta || "{}");
    return {
      type: "youtube",
      videoId: mediaObj.media_url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${mediaObj.media_url}`,
      title: meta.title || null,
      channel: meta.channel || null,
    };
  }
  return undefined;
}

/* ---------- helpers ---------- */

/** Convert SQLite datetime string (UTC, no suffix) to ISO 8601 with Z marker */
function utcTimestamp(sqliteDatetime) {
  if (!sqliteDatetime) return sqliteDatetime;
  const s = sqliteDatetime.replace(" ", "T");
  return s.endsWith("Z") ? s : s + "Z";
}

/** Convert a JS Date to SQLite datetime format "YYYY-MM-DD HH:MM:SS" */
function toSqliteDatetime(date = new Date()) {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function avatarFor(username) {
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(
    username
  )}`;
}

/** Wrap async Express handler to forward rejections to error middleware */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const ANNOUNCEMENTS_SECRET = process.env.ANNOUNCEMENTS_SECRET || "";

const SHOUT_MAX_LENGTH = 400;
const NEWLINE_CHAR_COST = 40;

function effectiveCharCount(text) {
  const newlines = (text.match(/\n/g) || []).length;
  return text.length + newlines * (NEWLINE_CHAR_COST - 1);
}

const registerSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(200),
  email: z.string().email().max(200),
});

const loginSchema = z.object({
  login: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

const shoutSchema = z.object({
  content: z.string().default("").refine(
    (val) => effectiveCharCount(val) <= SHOUT_MAX_LENGTH,
    { message: `Текст слишком длинный (макс. ${SHOUT_MAX_LENGTH} символов)` }
  ),
  mediaId: z.string().uuid().optional(),
  youtubeUrl: z.string().max(500).optional(),
});

const commentSchema = z.object({
  content: z.string().default("").refine(
    (val) => effectiveCharCount(val) <= SHOUT_MAX_LENGTH,
    { message: `Текст слишком длинный (макс. ${SHOUT_MAX_LENGTH} символов)` }
  ),
  mediaId: z.string().uuid().optional(),
  youtubeUrl: z.string().max(500).optional(),
});

const announcementSchema = z.object({
  content: z.string().min(1).max(5000),
  secret_key: z.string().min(1),
});

const profileUpdateSchema = z.object({
  username: z.string().min(3).max(32).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
  avatar: z.string().max(500).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6).max(200).optional(),
});

const sendCodeSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(200),
  email: z.string().email().max(200),
});

const verifyCodeSchema = z.object({
  email: z.string().email().max(200),
  code: z.string().length(6),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(200),
});

const resetPasswordSchema = z.object({
  email: z.string().email().max(200),
  code: z.string().length(6),
  newPassword: z.string().min(6).max(200),
});

const CODE_EXPIRY_MINUTES = 10;
const CODE_MAX_ATTEMPTS = 5;

function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

/* ---------- shared feed helpers ---------- */

async function enrichFeed(topShouts, currentUserId) {
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
    const media = buildMedia(row.media);
    return {
      id: row.id,
      user: {
        id: row.user_id,
        name: row.user.username,
        avatar: row.user.avatar,
        isBanned: !!row.user.is_banned,
      },
      content: row.content,
      timestamp: utcTimestamp(row.created_at),
      likes: shoutLikesCount.get(row.id) || 0,
      likedBy: currentUserId && shoutLikedSet.has(row.id) ? [currentUserId] : [],
      ...(media ? { media } : {}),
      comments: children,
    };
  }

  const dto = topShouts.map((t) => {
    const children = (commentsByShout.get(t.id) || []).map((c) => mapComment(c));
    return mapShout(t, children);
  });

  return dto;
}

/* ---------- routes ---------- */

export function mountRoutes(app) {
  /* health */
  app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));

  /* me */
  app.get("/api/v1/me", (req, res) => {
    res.json({ user: req.session?.user ?? null });
  });

  /* register step 1: send verification code */
  app.post("/api/v1/auth/register/send-code", asyncHandler(async (req, res) => {
    const parsed = sendCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const field = firstIssue?.path[0];
      if (field === "email") return res.status(400).json({ error: "Введите корректный email" });
      if (field === "username") return res.status(400).json({ error: "Имя пользователя: от 3 до 32 символов" });
      if (field === "password") return res.status(400).json({ error: "Пароль: минимум 6 символов" });
      return res.status(400).json({ error: "Некорректные данные" });
    }

    const { username, password, email } = parsed.data;
    console.log(`[Auth] Register send-code attempt: ${username} (${email})`);

    const existsUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (existsUser) {
      console.log(`[Auth] Register failed: username "${username}" taken`);
      return res.status(409).json({ error: "Это имя пользователя уже занято" });
    }

    const existsEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existsEmail) {
      console.log(`[Auth] Register failed: email "${email}" taken`);
      return res.status(409).json({ error: "Этот email уже используется" });
    }

    // Invalidate any existing unused codes for this email + purpose
    await prisma.verificationCode.updateMany({
      where: { email, purpose: "register", used: 0 },
      data: { used: 1 },
    });

    const code = generateCode();
    const id = crypto.randomUUID();
    const password_hash = await hashPassword(password);
    const avatar = avatarFor(username);
    const payload = JSON.stringify({ username, password_hash, avatar });
    const expires_at = toSqliteDatetime(new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000));

    await prisma.verificationCode.create({
      data: { id, email, code, purpose: "register", payload, expires_at },
    });

    try {
      await sendVerificationEmail(email, code, "register");
    } catch (err) {
      console.error(`[Auth] Failed to send registration code to ${email}:`, err.message);
      return res.status(500).json({ error: err.message });
    }

    console.log(`[Auth] Registration code sent to ${email} for user "${username}"`);
    res.json({ ok: true });
  }));

  /* register step 2: verify code and create account */
  app.post("/api/v1/auth/register/verify", asyncHandler(async (req, res) => {
    const parsed = verifyCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Введите 6-значный код из письма" });
    }

    const { email, code } = parsed.data;
    console.log(`[Auth] Register verify attempt for ${email}`);

    const record = await prisma.verificationCode.findFirst({
      where: { email, purpose: "register", used: 0 },
      orderBy: { created_at: "desc" },
    });

    if (!record) {
      return res.status(400).json({ error: "Код не найден. Запросите новый код" });
    }

    // Check expiry
    const now = new Date();
    const expiresAt = new Date(record.expires_at + "Z");
    if (now > expiresAt) {
      await prisma.verificationCode.update({
        where: { id: record.id },
        data: { used: 1 },
      });
      return res.status(400).json({ error: "Код истёк. Запросите новый код" });
    }

    // Check attempts
    if (record.attempts >= CODE_MAX_ATTEMPTS) {
      await prisma.verificationCode.update({
        where: { id: record.id },
        data: { used: 1 },
      });
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
          : "Неверный код. Запросите новый код"
      });
    }

    // Mark code as used
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { used: 1 },
    });

    // Create user from stored payload
    const { username, password_hash, avatar } = JSON.parse(record.payload);

    // Re-check uniqueness (race condition guard)
    const existsUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (existsUser) {
      return res.status(409).json({ error: "Это имя пользователя уже занято" });
    }
    const existsEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existsEmail) {
      return res.status(409).json({ error: "Этот email уже используется" });
    }

    const userId = crypto.randomUUID();
    await prisma.user.create({
      data: { id: userId, username, password_hash, avatar, email },
    });

    req.session.user = { id: userId, name: username, avatar };
    console.log(`[Auth] Registered new user: ${username} (${userId})`);
    res.json({ ok: true, user: req.session.user });
  }));

  /* login — accepts username or email in the "login" field */
  app.post("/api/v1/auth/login", asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Некорректные данные" });

    const { login, password } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { OR: [{ username: login }, { email: login }] },
      select: { id: true, username: true, password_hash: true, avatar: true, is_banned: true },
    });

    if (!user) {
      console.log(`[Auth] Login failed: "${login}" not found`);
      return res.status(401).json({ error: "Неверное имя пользователя или пароль" });
    }
    if (user.is_banned) {
      console.log(`[Auth] Login blocked: user "${user.username}" is banned`);
      return res.status(403).json({ error: "Аккаунт заблокирован" });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      console.log(`[Auth] Login failed: wrong password for "${user.username}"`);
      return res.status(401).json({ error: "Неверное имя пользователя или пароль" });
    }

    req.session.user = {
      id: user.id,
      name: user.username,
      avatar: user.avatar,
    };

    console.log(`[Auth] Login success: ${user.username} (${user.id})`);
    res.json({ ok: true, user: req.session.user });
  }));

  /* logout */
  app.post("/api/v1/auth/logout", (req, res) => {
    const userName = req.session?.user?.name || "unknown";
    console.log(`[Auth] Logout: ${userName}`);
    req.session.destroy(() => res.json({ ok: true }));
  });

  /* forgot password step 1: send reset code */
  app.post("/api/v1/auth/forgot-password/send-code", asyncHandler(async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Введите корректный email" });
    }

    const { email } = parsed.data;
    console.log(`[Auth] Forgot-password send-code for ${email}`);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, username: true },
    });
    if (!user) {
      // Don't reveal whether email exists — still return ok
      console.log(`[Auth] Forgot-password: email "${email}" not found (silent ok)`);
      return res.json({ ok: true });
    }

    // Invalidate any existing unused codes for this email + purpose
    await prisma.verificationCode.updateMany({
      where: { email, purpose: "reset", used: 0 },
      data: { used: 1 },
    });

    const code = generateCode();
    const id = crypto.randomUUID();
    const expires_at = toSqliteDatetime(new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000));

    await prisma.verificationCode.create({
      data: {
        id, email, code, purpose: "reset",
        payload: JSON.stringify({ userId: user.id, username: user.username }),
        expires_at,
      },
    });

    try {
      await sendVerificationEmail(email, code, "reset");
    } catch (err) {
      console.error(`[Auth] Failed to send reset code to ${email}:`, err.message);
      return res.status(500).json({ error: err.message });
    }

    console.log(`[Auth] Reset code sent to ${email}`);
    res.json({ ok: true });
  }));

  /* forgot password step 2: verify code and set new password */
  app.post("/api/v1/auth/forgot-password/reset", asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      if (field === "newPassword") return res.status(400).json({ error: "Пароль: минимум 6 символов" });
      if (field === "code") return res.status(400).json({ error: "Введите 6-значный код из письма" });
      return res.status(400).json({ error: "Некорректные данные" });
    }

    const { email, code, newPassword } = parsed.data;
    console.log(`[Auth] Forgot-password reset attempt for ${email}`);

    const record = await prisma.verificationCode.findFirst({
      where: { email, purpose: "reset", used: 0 },
      orderBy: { created_at: "desc" },
    });

    if (!record) {
      return res.status(400).json({ error: "Код не найден. Запросите новый код" });
    }

    // Check expiry
    const now = new Date();
    const expiresAt = new Date(record.expires_at + "Z");
    if (now > expiresAt) {
      await prisma.verificationCode.update({
        where: { id: record.id },
        data: { used: 1 },
      });
      return res.status(400).json({ error: "Код истёк. Запросите новый код" });
    }

    // Check attempts
    if (record.attempts >= CODE_MAX_ATTEMPTS) {
      await prisma.verificationCode.update({
        where: { id: record.id },
        data: { used: 1 },
      });
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
          : "Неверный код. Запросите новый код"
      });
    }

    // Mark code as used
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { used: 1 },
    });

    // Get user and update password
    const { userId } = JSON.parse(record.payload);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, avatar: true, is_banned: true },
    });
    if (!user) {
      return res.status(400).json({ error: "Пользователь не найден" });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: "Аккаунт заблокирован" });
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { password_hash: newHash },
    });

    // Auto-login
    req.session.user = { id: user.id, name: user.username, avatar: user.avatar };
    console.log(`[Auth] Password reset and auto-login: ${user.username} (${user.id})`);
    res.json({ ok: true, user: req.session.user });
  }));

  /* get shouts */
  app.get("/api/v1/shouts", asyncHandler(async (req, res) => {
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
  app.delete("/api/v1/shouts/:id", requireAuth, asyncHandler(async (req, res) => {
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
    res.json({ ok: true });
  }));

  /* new shout */
  app.post("/api/v1/shouts", requireAuth, asyncHandler(async (req, res) => {
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
    await prisma.shout.create({
      data: {
        id,
        user_id: req.session.user.id,
        parent_id: null,
        content,
        media_id: finalMediaId,
      },
    });

    console.log(`[Shouts] New shout ${id} by ${req.session.user.name}, media=${finalMediaId || "none"}`);
    res.json({ ok: true, id });
  }));

  /* reply (create comment) */
  app.post("/api/v1/shouts/:id/replies", requireAuth, asyncHandler(async (req, res) => {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.code === "too_big") return res.status(400).json({ error: `Максимум ${SHOUT_MAX_LENGTH} символов` });
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
    await prisma.comment.create({
      data: {
        id,
        shout_id: shoutId,
        user_id: req.session.user.id,
        content,
        media_id: finalMediaId,
      },
    });

    console.log(`[Comments] Comment ${id} on shout ${shoutId} by ${req.session.user.name}, media=${finalMediaId || "none"}`);
    res.json({ ok: true, id, ...(mediaDto ? { media: mediaDto } : {}) });
  }));

  /* delete comment (soft-delete, author only) */
  app.delete("/api/v1/comments/:id", requireAuth, asyncHandler(async (req, res) => {
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
    res.json({ ok: true });
  }));

  /* like toggle (shout) */
  app.post("/api/v1/shouts/:id/like", requireAuth, asyncHandler(async (req, res) => {
    const shoutId = req.params.id;
    const userId = req.session.user.id;

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
    res.json({ likes, isLiked: !exists });
  }));

  /* like toggle (comment) */
  app.post("/api/v1/comments/:id/like", requireAuth, asyncHandler(async (req, res) => {
    const commentId = req.params.id;
    const userId = req.session.user.id;

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
    res.json({ likes, isLiked: !exists });
  }));

  /* ---- Announcements ---- */

  app.get("/api/v1/announcements", asyncHandler(async (_req, res) => {
    const announcement = await prisma.announcement.findFirst({
      where: { is_deleted: 0 },
      orderBy: { created_at: "desc" },
    });

    res.json({ announcement: announcement ? { id: announcement.id, content: announcement.content, createdAt: utcTimestamp(announcement.created_at) } : null });
  }));

  app.post("/api/v1/announcements", asyncHandler(async (req, res) => {
    const parsed = announcementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Некорректные данные" });
    }

    const { content, secret_key } = parsed.data;

    if (!ANNOUNCEMENTS_SECRET || secret_key !== ANNOUNCEMENTS_SECRET) {
      return res.status(403).json({ error: "Неверный ключ" });
    }

    // Soft-delete all currently active announcements
    await prisma.announcement.updateMany({
      where: { is_deleted: 0 },
      data: { is_deleted: 1 },
    });

    const id = crypto.randomUUID();
    await prisma.announcement.create({
      data: { id, content },
    });

    console.log(`[Announcements] New announcement ${id}`);
    res.json({ ok: true, id });
  }));

  /* ---- Profile endpoints ---- */

  app.get("/api/v1/users/:id", asyncHandler(async (req, res) => {
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

  app.get("/api/v1/users/:id/shouts", asyncHandler(async (req, res) => {
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

  app.put("/api/v1/users/:id", requireAuth, asyncHandler(async (req, res) => {
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

  /* ---- Avatar upload ---- */

  app.get("/api/v1/avatars/:userId/:file", (req, res) => {
    const { userId, file } = req.params;
    const filePath = path.join(AVATAR_DIR, userId, file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Avatar not found" });
    }
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    fs.createReadStream(filePath).pipe(res);
  });

  /* ---- Media upload ---- */

  app.post("/api/v1/upload/media", requireAuth, (req, res) => {
    mediaUpload.single("file")(req, res, async (multerErr) => {
      if (multerErr) {
        const msg = multerErr.code === "LIMIT_FILE_SIZE"
          ? "Файл слишком большой (макс. 5 МБ)"
          : multerErr.message || "Ошибка загрузки";
        console.log(`[Media] Upload rejected: ${msg}`);
        return res.status(400).json({ error: msg });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Файл не выбран" });
      }

      const userId = req.session.user.id;
      console.log(`[Media] Processing upload for ${userId}, ${req.file.size} bytes, ${req.file.mimetype}`);

      try {
        const image = sharp(req.file.buffer);
        const meta = await image.metadata();

        // Validate via sharp metadata (magic bytes check — sharp rejects invalid images)
        if (!IMAGE_ALLOWED_MIME.has(`image/${meta.format === "jpeg" ? "jpeg" : meta.format}`)) {
          return res.status(400).json({ error: "Недопустимый формат изображения" });
        }

        if (meta.pages && meta.pages > 1) {
          return res.status(400).json({ error: "Анимированные изображения не поддерживаются" });
        }

        if (!meta.width || !meta.height) {
          return res.status(400).json({ error: "Не удалось определить размер изображения" });
        }

        if (meta.width > MEDIA_MAX_DIM || meta.height > MEDIA_MAX_DIM) {
          return res.status(400).json({ error: `Максимальный размер: ${MEDIA_MAX_DIM}×${MEDIA_MAX_DIM} пикселей` });
        }

        if (meta.width * meta.height > MEDIA_MAX_PIXELS) {
          return res.status(400).json({ error: "Изображение слишком большое (макс. 16 МП)" });
        }

        const mediaId = crypto.randomUUID();
        const tmpDir = path.join(MEDIA_TMP_DIR, mediaId);
        fs.mkdirSync(tmpDir, { recursive: true });

        // Strip EXIF by re-encoding, generate width-capped variants
        const rotated = image.rotate(); // auto-rotate by EXIF, then EXIF is stripped
        const urls = {};

        for (const w of MEDIA_VARIANTS) {
          const resized = rotated.clone().resize(w, null, { withoutEnlargement: true });
          const outPath = path.join(tmpDir, `${w}.webp`);
          await resized.webp({ quality: 82 }).toFile(outPath);
          urls[w] = `/media/${mediaId}/${w}.webp`;
        }

        // Write meta.json as on-disk backup
        const metaJson = JSON.stringify({ w: meta.width, h: meta.height, size: req.file.size, mime: req.file.mimetype });
        fs.writeFileSync(path.join(tmpDir, "meta.json"), metaJson);

        // Atomic move: tmp → permanent
        const permanentDir = path.join(MEDIA_DIR, mediaId);
        fs.renameSync(tmpDir, permanentDir);

        // Create media record in DB
        await prisma.media.create({
          data: {
            id: mediaId,
            user_id: userId,
            media_type: "image",
            media_url: mediaId,
            media_meta: metaJson,
          },
        });

        console.log(`[Media] Upload complete: ${mediaId}, ${MEDIA_VARIANTS.join("/")}w`);
        res.json({
          ok: true,
          mediaId,
          urls: {
            thumb: urls[320],
            medium: urls[960],
            full: urls[1600],
          },
        });
      } catch (err) {
        console.error("[Media] Processing error:", err);
        res.status(500).json({ error: "Ошибка обработки изображения" });
      }
    });
  });

  /* ---- Avatar upload ---- */

  app.post("/api/v1/upload/avatar", requireAuth, (req, res) => {
    upload.single("avatar")(req, res, async (multerErr) => {
      if (multerErr) {
        const msg = multerErr.code === "LIMIT_FILE_SIZE"
          ? "Файл слишком большой (макс. 2 МБ)"
          : multerErr.message || "Ошибка загрузки";
        console.log(`[Avatar] Upload rejected: ${msg}`);
        return res.status(400).json({ error: msg });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Файл не выбран" });
      }

      const userId = req.session.user.id;
      console.log(`[Avatar] Processing upload for ${userId}, ${req.file.size} bytes, ${req.file.mimetype}`);

      try {
        const image = sharp(req.file.buffer);
        const meta = await image.metadata();

        if (meta.pages && meta.pages > 1) {
          return res.status(400).json({ error: "Анимированные изображения не поддерживаются" });
        }

        if (!meta.width || !meta.height || meta.width < AVATAR_MIN_DIM || meta.height < AVATAR_MIN_DIM) {
          return res.status(400).json({ error: `Минимальное разрешение: ${AVATAR_MIN_DIM}×${AVATAR_MIN_DIM}` });
        }

        const size = Math.min(meta.width, meta.height);
        const cropped = image
          .extract({
            left: Math.floor((meta.width - size) / 2),
            top: Math.floor((meta.height - size) / 2),
            width: size,
            height: size,
          })
          .rotate();

        const userDir = path.join(AVATAR_DIR, userId);
        fs.mkdirSync(userDir, { recursive: true });

        const version = Date.now();
        for (const s of AVATAR_SIZES) {
          await cropped
            .clone()
            .resize(s, s)
            .webp({ quality: 85 })
            .toFile(path.join(userDir, `${s}.webp`));
        }

        const avatarUrl = `/api/v1/avatars/${userId}/256.webp?v=${version}`;
        await prisma.user.update({
          where: { id: userId },
          data: { avatar: avatarUrl },
        });
        req.session.user.avatar = avatarUrl;

        console.log(`[Avatar] Upload complete for ${userId}: ${AVATAR_SIZES.join(", ")}px`);
        res.json({
          ok: true,
          avatar: avatarUrl,
          sizes: Object.fromEntries(
            AVATAR_SIZES.map((s) => [s, `/api/v1/avatars/${userId}/${s}.webp?v=${version}`])
          ),
        });
      } catch (err) {
        console.error("[Avatar] Processing error:", err);
        res.status(500).json({ error: "Ошибка обработки изображения" });
      }
    });
  });
}
