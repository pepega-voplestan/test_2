import { z } from "zod";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import sharp from "sharp";
import { db } from "./db.js";
import { hashPassword, verifyPassword, requireAuth } from "./auth.js";
import { sendVerificationEmail } from "./email.js";

const AVATAR_DIR = path.join(path.dirname(process.env.DATABASE_PATH || "/data/app.db"), "avatars");
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

const MEDIA_DIR = process.env.MEDIA_PATH || "/media";
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

function buildMedia(row) {
  if (row.m_type === "image") {
    const meta = JSON.parse(row.m_meta || "{}");
    return {
      type: "image",
      url: `/media/${row.m_url}/960.webp`,
      thumb: `/media/${row.m_url}/320.webp`,
      full: `/media/${row.m_url}/1600.webp`,
      width: meta.w || 0,
      height: meta.h || 0,
    };
  }
  if (row.m_type === "youtube") {
    const meta = JSON.parse(row.m_meta || "{}");
    return {
      type: "youtube",
      videoId: row.m_url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${row.m_url}`,
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

function avatarFor(username) {
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(
    username
  )}`;
}

const SHOUT_MAX_LENGTH = 280;

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
  content: z.string().max(SHOUT_MAX_LENGTH).default(""),
  mediaId: z.string().uuid().optional(),
  youtubeUrl: z.string().max(500).optional(),
});

const commentSchema = z.object({
  content: z.string().max(SHOUT_MAX_LENGTH).default(""),
  mediaId: z.string().uuid().optional(),
  youtubeUrl: z.string().max(500).optional(),
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

/* ---------- routes ---------- */

export function mountRoutes(app) {
  /* health */
  app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));

  /* me */
  app.get("/api/v1/me", (req, res) => {
    res.json({ user: req.session?.user ?? null });
  });

  /* register step 1: send verification code */
  app.post("/api/v1/auth/register/send-code", async (req, res) => {
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

    const existsUser = db
      .prepare("SELECT id FROM users WHERE username=?")
      .get(username);
    if (existsUser) {
      console.log(`[Auth] Register failed: username "${username}" taken`);
      return res.status(409).json({ error: "Это имя пользователя уже занято" });
    }

    const existsEmail = db
      .prepare("SELECT id FROM users WHERE email=?")
      .get(email);
    if (existsEmail) {
      console.log(`[Auth] Register failed: email "${email}" taken`);
      return res.status(409).json({ error: "Этот email уже используется" });
    }

    // Invalidate any existing unused codes for this email + purpose
    db.prepare(
      "UPDATE verification_codes SET used=1 WHERE email=? AND purpose='register' AND used=0"
    ).run(email);

    const code = generateCode();
    const id = crypto.randomUUID();
    const password_hash = await hashPassword(password);
    const avatar = avatarFor(username);
    const payload = JSON.stringify({ username, password_hash, avatar });

    db.prepare(
      `INSERT INTO verification_codes (id, email, code, purpose, payload, expires_at)
       VALUES (?, ?, ?, 'register', ?, datetime('now', '+${CODE_EXPIRY_MINUTES} minutes'))`
    ).run(id, email, code, payload);

    try {
      await sendVerificationEmail(email, code, "register");
    } catch (err) {
      console.error(`[Auth] Failed to send registration code to ${email}:`, err.message);
      return res.status(500).json({ error: err.message });
    }

    console.log(`[Auth] Registration code sent to ${email} for user "${username}"`);
    res.json({ ok: true });
  });

  /* register step 2: verify code and create account */
  app.post("/api/v1/auth/register/verify", async (req, res) => {
    const parsed = verifyCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Введите 6-значный код из письма" });
    }

    const { email, code } = parsed.data;
    console.log(`[Auth] Register verify attempt for ${email}`);

    const record = db.prepare(
      `SELECT * FROM verification_codes
       WHERE email=? AND purpose='register' AND used=0
       ORDER BY created_at DESC LIMIT 1`
    ).get(email);

    if (!record) {
      return res.status(400).json({ error: "Код не найден. Запросите новый код" });
    }

    // Check expiry
    const now = new Date();
    const expiresAt = new Date(record.expires_at + "Z");
    if (now > expiresAt) {
      db.prepare("UPDATE verification_codes SET used=1 WHERE id=?").run(record.id);
      return res.status(400).json({ error: "Код истёк. Запросите новый код" });
    }

    // Check attempts
    if (record.attempts >= CODE_MAX_ATTEMPTS) {
      db.prepare("UPDATE verification_codes SET used=1 WHERE id=?").run(record.id);
      return res.status(400).json({ error: "Слишком много попыток. Запросите новый код" });
    }

    // Increment attempts
    db.prepare("UPDATE verification_codes SET attempts=attempts+1 WHERE id=?").run(record.id);

    if (record.code !== code) {
      const remaining = CODE_MAX_ATTEMPTS - record.attempts - 1;
      return res.status(400).json({
        error: remaining > 0
          ? `Неверный код. Осталось попыток: ${remaining}`
          : "Неверный код. Запросите новый код"
      });
    }

    // Mark code as used
    db.prepare("UPDATE verification_codes SET used=1 WHERE id=?").run(record.id);

    // Create user from stored payload
    const { username, password_hash, avatar } = JSON.parse(record.payload);

    // Re-check uniqueness (race condition guard)
    const existsUser = db.prepare("SELECT id FROM users WHERE username=?").get(username);
    if (existsUser) {
      return res.status(409).json({ error: "Это имя пользователя уже занято" });
    }
    const existsEmail = db.prepare("SELECT id FROM users WHERE email=?").get(email);
    if (existsEmail) {
      return res.status(409).json({ error: "Этот email уже используется" });
    }

    const userId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO users (id, username, password_hash, avatar, email) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, username, password_hash, avatar, email);

    req.session.user = { id: userId, name: username, avatar };
    console.log(`[Auth] Registered new user: ${username} (${userId})`);
    res.json({ ok: true, user: req.session.user });
  });

  /* login — accepts username or email in the "login" field */
  app.post("/api/v1/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Некорректные данные" });

    const { login, password } = parsed.data;

    const user = db
      .prepare(
        "SELECT id, username, password_hash, avatar, is_banned FROM users WHERE username=? OR email=?"
      )
      .get(login, login);

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
  });

  /* logout */
  app.post("/api/v1/auth/logout", (req, res) => {
    const userName = req.session?.user?.name || "unknown";
    console.log(`[Auth] Logout: ${userName}`);
    req.session.destroy(() => res.json({ ok: true }));
  });

  /* forgot password step 1: send reset code */
  app.post("/api/v1/auth/forgot-password/send-code", async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Введите корректный email" });
    }

    const { email } = parsed.data;
    console.log(`[Auth] Forgot-password send-code for ${email}`);

    const user = db.prepare("SELECT id, username FROM users WHERE email=?").get(email);
    if (!user) {
      // Don't reveal whether email exists — still return ok
      console.log(`[Auth] Forgot-password: email "${email}" not found (silent ok)`);
      return res.json({ ok: true });
    }

    // Invalidate any existing unused codes for this email + purpose
    db.prepare(
      "UPDATE verification_codes SET used=1 WHERE email=? AND purpose='reset' AND used=0"
    ).run(email);

    const code = generateCode();
    const id = crypto.randomUUID();

    db.prepare(
      `INSERT INTO verification_codes (id, email, code, purpose, payload, expires_at)
       VALUES (?, ?, ?, 'reset', ?, datetime('now', '+${CODE_EXPIRY_MINUTES} minutes'))`
    ).run(id, email, code, JSON.stringify({ userId: user.id, username: user.username }));

    try {
      await sendVerificationEmail(email, code, "reset");
    } catch (err) {
      console.error(`[Auth] Failed to send reset code to ${email}:`, err.message);
      return res.status(500).json({ error: err.message });
    }

    console.log(`[Auth] Reset code sent to ${email}`);
    res.json({ ok: true });
  });

  /* forgot password step 2: verify code and set new password */
  app.post("/api/v1/auth/forgot-password/reset", async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      if (field === "newPassword") return res.status(400).json({ error: "Пароль: минимум 6 символов" });
      if (field === "code") return res.status(400).json({ error: "Введите 6-значный код из письма" });
      return res.status(400).json({ error: "Некорректные данные" });
    }

    const { email, code, newPassword } = parsed.data;
    console.log(`[Auth] Forgot-password reset attempt for ${email}`);

    const record = db.prepare(
      `SELECT * FROM verification_codes
       WHERE email=? AND purpose='reset' AND used=0
       ORDER BY created_at DESC LIMIT 1`
    ).get(email);

    if (!record) {
      return res.status(400).json({ error: "Код не найден. Запросите новый код" });
    }

    // Check expiry
    const now = new Date();
    const expiresAt = new Date(record.expires_at + "Z");
    if (now > expiresAt) {
      db.prepare("UPDATE verification_codes SET used=1 WHERE id=?").run(record.id);
      return res.status(400).json({ error: "Код истёк. Запросите новый код" });
    }

    // Check attempts
    if (record.attempts >= CODE_MAX_ATTEMPTS) {
      db.prepare("UPDATE verification_codes SET used=1 WHERE id=?").run(record.id);
      return res.status(400).json({ error: "Слишком много попыток. Запросите новый код" });
    }

    // Increment attempts
    db.prepare("UPDATE verification_codes SET attempts=attempts+1 WHERE id=?").run(record.id);

    if (record.code !== code) {
      const remaining = CODE_MAX_ATTEMPTS - record.attempts - 1;
      return res.status(400).json({
        error: remaining > 0
          ? `Неверный код. Осталось попыток: ${remaining}`
          : "Неверный код. Запросите новый код"
      });
    }

    // Mark code as used
    db.prepare("UPDATE verification_codes SET used=1 WHERE id=?").run(record.id);

    // Get user and update password
    const { userId, username } = JSON.parse(record.payload);
    const user = db.prepare("SELECT id, username, avatar, is_banned FROM users WHERE id=?").get(userId);
    if (!user) {
      return res.status(400).json({ error: "Пользователь не найден" });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: "Аккаунт заблокирован" });
    }

    const newHash = await hashPassword(newPassword);
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(newHash, userId);

    // Auto-login
    req.session.user = { id: user.id, name: user.username, avatar: user.avatar };
    console.log(`[Auth] Password reset and auto-login: ${user.username} (${user.id})`);
    res.json({ ok: true, user: req.session.user });
  });

  /* get shouts */
  app.get("/api/v1/shouts", (req, res) => {
    const currentUserId = req.session?.user?.id ?? null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const offset = parseInt(req.query.offset, 10) || 0;
    const sortBy = req.query.sortBy || "new";
    console.log(`[Shouts] Fetching shouts: limit=${limit}, offset=${offset}, sort=${sortBy}, user=${currentUserId || "anon"}`);

    let topRaw;
    if (sortBy === "popular") {
      // Popular: shouts from last 7 days, ordered by like count descending
      topRaw = db.prepare(`
        SELECT s.*, u.username, u.avatar, u.is_banned,
               m.media_type AS m_type, m.media_url AS m_url, m.media_meta AS m_meta,
               COALESCE(lc.cnt, 0) AS like_count
        FROM shouts s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN media m ON m.id = s.media_id
        LEFT JOIN (
          SELECT shout_id, COUNT(*) AS cnt FROM shout_likes GROUP BY shout_id
        ) lc ON lc.shout_id = s.id
        WHERE s.parent_id IS NULL
          AND s.is_deleted = 0
          AND datetime(s.created_at) >= datetime('now', '-7 days')
        ORDER BY like_count DESC, datetime(s.created_at) DESC
        LIMIT ? OFFSET ?
      `).all(limit + 1, offset);
    } else {
      topRaw = db.prepare(`
        SELECT s.*, u.username, u.avatar, u.is_banned,
               m.media_type AS m_type, m.media_url AS m_url, m.media_meta AS m_meta
        FROM shouts s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN media m ON m.id = s.media_id
        WHERE s.parent_id IS NULL AND s.is_deleted = 0
        ORDER BY datetime(s.created_at) DESC
        LIMIT ? OFFSET ?
      `).all(limit + 1, offset);
    }

    const hasMore = topRaw.length > limit;
    const top = hasMore ? topRaw.slice(0, limit) : topRaw;
    const topIds = top.map((s) => s.id);

    // Fetch comments from the separate comments table
    const comments = topIds.length
      ? db
          .prepare(`
            SELECT c.*, u.username, u.avatar, u.is_banned,
                   m.media_type AS m_type, m.media_url AS m_url, m.media_meta AS m_meta
            FROM comments c
            JOIN users u ON u.id = c.user_id
            LEFT JOIN media m ON m.id = c.media_id
            WHERE c.shout_id IN (${topIds.map(() => "?").join(",")})
              AND c.is_deleted = 0
            ORDER BY datetime(c.created_at) ASC
          `)
          .all(...topIds)
      : [];

    const commentIds = comments.map((c) => c.id);

    // Shout likes
    const shoutLikesCount = new Map();
    if (topIds.length) {
      const rows = db
        .prepare(`
          SELECT shout_id, COUNT(*) c
          FROM shout_likes
          WHERE shout_id IN (${topIds.map(() => "?").join(",")})
          GROUP BY shout_id
        `)
        .all(...topIds);
      for (const r of rows) shoutLikesCount.set(r.shout_id, r.c);
    }

    const shoutLikedSet = new Set();
    if (currentUserId && topIds.length) {
      const rows = db
        .prepare(`
          SELECT shout_id
          FROM shout_likes
          WHERE user_id=? AND shout_id IN (${topIds.map(() => "?").join(",")})
        `)
        .all(currentUserId, ...topIds);
      for (const r of rows) shoutLikedSet.add(r.shout_id);
    }

    // Comment likes
    const commentLikesCount = new Map();
    if (commentIds.length) {
      const rows = db
        .prepare(`
          SELECT comment_id, COUNT(*) c
          FROM comment_likes
          WHERE comment_id IN (${commentIds.map(() => "?").join(",")})
          GROUP BY comment_id
        `)
        .all(...commentIds);
      for (const r of rows) commentLikesCount.set(r.comment_id, r.c);
    }

    const commentLikedSet = new Set();
    if (currentUserId && commentIds.length) {
      const rows = db
        .prepare(`
          SELECT comment_id
          FROM comment_likes
          WHERE user_id=? AND comment_id IN (${commentIds.map(() => "?").join(",")})
        `)
        .all(currentUserId, ...commentIds);
      for (const r of rows) commentLikedSet.add(r.comment_id);
    }

    const commentsByShout = new Map();
    for (const c of comments) {
      if (!commentsByShout.has(c.shout_id)) commentsByShout.set(c.shout_id, []);
      commentsByShout.get(c.shout_id).push(c);
    }

    function mapComment(row) {
      const media = buildMedia(row);
      return {
        id: row.id,
        shoutId: row.shout_id,
        user: {
          id: row.user_id,
          name: row.username,
          avatar: row.avatar,
          isBanned: !!row.is_banned,
        },
        content: row.content,
        timestamp: utcTimestamp(row.created_at),
        likes: commentLikesCount.get(row.id) || 0,
        likedBy: currentUserId && commentLikedSet.has(row.id) ? [currentUserId] : [],
        ...(media ? { media } : {}),
      };
    }

    function mapShout(row, children) {
      const media = buildMedia(row);
      return {
        id: row.id,
        user: {
          id: row.user_id,
          name: row.username,
          avatar: row.avatar,
          isBanned: !!row.is_banned,
        },
        content: row.content,
        timestamp: utcTimestamp(row.created_at),
        likes: shoutLikesCount.get(row.id) || 0,
        likedBy: currentUserId && shoutLikedSet.has(row.id) ? [currentUserId] : [],
        ...(media ? { media } : {}),
        comments: children,
      };
    }

    const dto = top.map((t) => {
      const children = (commentsByShout.get(t.id) || []).map((c) => mapComment(c));
      return mapShout(t, children);
    });

    console.log(`[Shouts] Returning ${dto.length} shouts, hasMore=${hasMore}`);
    res.json({ shouts: dto, hasMore });
  });

  /* delete shout (soft-delete, author only) */
  app.delete("/api/v1/shouts/:id", requireAuth, (req, res) => {
    const shoutId = req.params.id;
    const userId = req.session.user.id;

    const shout = db.prepare("SELECT id, user_id FROM shouts WHERE id=? AND is_deleted=0").get(shoutId);
    if (!shout) return res.status(404).json({ error: "Запись не найдена" });
    if (shout.user_id !== userId) return res.status(403).json({ error: "Можно удалять только свои записи" });

    // Soft-delete the shout and all its comments
    db.prepare("UPDATE shouts SET is_deleted=1 WHERE id=?").run(shoutId);
    db.prepare("UPDATE comments SET is_deleted=1 WHERE shout_id=?").run(shoutId);

    console.log(`[Shouts] Soft-deleted shout ${shoutId} (and comments) by ${userId}`);
    res.json({ ok: true });
  });

  /* new shout */
  app.post("/api/v1/shouts", requireAuth, async (req, res) => {
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
      // Validate media exists in DB (created during upload)
      const mediaRow = db.prepare("SELECT id FROM media WHERE id = ?").get(mediaId);
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
      db.prepare(
        "INSERT INTO media (id, user_id, media_type, media_url, media_meta) VALUES (?, ?, ?, ?, ?)"
      ).run(finalMediaId, req.session.user.id, "youtube", videoId, JSON.stringify(ytMeta));
    } else if (content) {
      // Auto-detect YouTube URL in content
      const videoId = extractYouTubeId(content);
      if (videoId) {
        const ytMeta = await fetchYouTubeMeta(videoId);
        finalMediaId = crypto.randomUUID();
        db.prepare(
          "INSERT INTO media (id, user_id, media_type, media_url, media_meta) VALUES (?, ?, ?, ?, ?)"
        ).run(finalMediaId, req.session.user.id, "youtube", videoId, JSON.stringify(ytMeta));
      }
    }

    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO shouts (id, user_id, parent_id, content, media_id) VALUES (?, ?, NULL, ?, ?)"
    ).run(id, req.session.user.id, content, finalMediaId);

    console.log(`[Shouts] New shout ${id} by ${req.session.user.name}, media=${finalMediaId || "none"}`);
    res.json({ ok: true, id });
  });

  /* reply (create comment) */
  app.post("/api/v1/shouts/:id/replies", requireAuth, async (req, res) => {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.code === "too_big") return res.status(400).json({ error: `Максимум ${SHOUT_MAX_LENGTH} символов` });
      return res.status(400).json({ error: "Ответ не может быть пустым" });
    }

    const shoutId = req.params.id;
    const parent = db
      .prepare("SELECT id FROM shouts WHERE id=? AND is_deleted=0")
      .get(shoutId);
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
      const mediaRow = db.prepare("SELECT id, media_type AS m_type, media_url AS m_url, media_meta AS m_meta FROM media WHERE id = ?").get(mediaId);
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
      db.prepare(
        "INSERT INTO media (id, user_id, media_type, media_url, media_meta) VALUES (?, ?, ?, ?, ?)"
      ).run(finalMediaId, req.session.user.id, "youtube", videoId, JSON.stringify(ytMeta));
      mediaDto = buildMedia({ m_type: "youtube", m_url: videoId, m_meta: JSON.stringify(ytMeta) });
    } else if (content) {
      const videoId = extractYouTubeId(content);
      if (videoId) {
        const ytMeta = await fetchYouTubeMeta(videoId);
        finalMediaId = crypto.randomUUID();
        db.prepare(
          "INSERT INTO media (id, user_id, media_type, media_url, media_meta) VALUES (?, ?, ?, ?, ?)"
        ).run(finalMediaId, req.session.user.id, "youtube", videoId, JSON.stringify(ytMeta));
        mediaDto = buildMedia({ m_type: "youtube", m_url: videoId, m_meta: JSON.stringify(ytMeta) });
      }
    }

    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO comments (id, shout_id, user_id, content, media_id) VALUES (?, ?, ?, ?, ?)"
    ).run(id, shoutId, req.session.user.id, content, finalMediaId);

    console.log(`[Comments] Comment ${id} on shout ${shoutId} by ${req.session.user.name}, media=${finalMediaId || "none"}`);
    res.json({ ok: true, id, ...(mediaDto ? { media: mediaDto } : {}) });
  });

  /* delete comment (soft-delete, author only) */
  app.delete("/api/v1/comments/:id", requireAuth, (req, res) => {
    const commentId = req.params.id;
    const userId = req.session.user.id;

    const comment = db.prepare("SELECT id, user_id, shout_id FROM comments WHERE id=? AND is_deleted=0").get(commentId);
    if (!comment) return res.status(404).json({ error: "Комментарий не найден" });
    if (comment.user_id !== userId) return res.status(403).json({ error: "Можно удалять только свои комментарии" });

    db.prepare("UPDATE comments SET is_deleted=1 WHERE id=?").run(commentId);

    console.log(`[Comments] Soft-deleted comment ${commentId} by ${userId}`);
    res.json({ ok: true });
  });

  /* like toggle (shout) */
  app.post("/api/v1/shouts/:id/like", requireAuth, (req, res) => {
    const shoutId = req.params.id;
    const userId = req.session.user.id;

    const exists = db
      .prepare("SELECT 1 FROM shout_likes WHERE shout_id=? AND user_id=?")
      .get(shoutId, userId);

    if (exists) {
      db.prepare("DELETE FROM shout_likes WHERE shout_id=? AND user_id=?").run(shoutId, userId);
    } else {
      db.prepare("INSERT OR IGNORE INTO shout_likes (shout_id, user_id) VALUES (?, ?)").run(shoutId, userId);
    }

    const likes = db
      .prepare("SELECT COUNT(*) c FROM shout_likes WHERE shout_id=?")
      .get(shoutId).c;

    console.log(`[Shouts] Like toggle on ${shoutId} by ${userId}: now ${likes} likes, isLiked=${!exists}`);
    res.json({ likes, isLiked: !exists });
  });

  /* like toggle (comment) */
  app.post("/api/v1/comments/:id/like", requireAuth, (req, res) => {
    const commentId = req.params.id;
    const userId = req.session.user.id;

    const exists = db
      .prepare("SELECT 1 FROM comment_likes WHERE comment_id=? AND user_id=?")
      .get(commentId, userId);

    if (exists) {
      db.prepare("DELETE FROM comment_likes WHERE comment_id=? AND user_id=?").run(commentId, userId);
    } else {
      db.prepare("INSERT OR IGNORE INTO comment_likes (comment_id, user_id) VALUES (?, ?)").run(commentId, userId);
    }

    const likes = db
      .prepare("SELECT COUNT(*) c FROM comment_likes WHERE comment_id=?")
      .get(commentId).c;

    console.log(`[Comments] Like toggle on ${commentId} by ${userId}: now ${likes} likes, isLiked=${!exists}`);
    res.json({ likes, isLiked: !exists });
  });

  /* ---- Profile endpoints ---- */

  app.get("/api/v1/users/:id", (req, res) => {
    const profileId = req.params.id;
    const currentUserId = req.session?.user?.id ?? null;
    const isOwner = currentUserId === profileId;

    console.log(`[Profile] Fetching profile ${profileId}, isOwner=${isOwner}`);

    const row = db
      .prepare("SELECT id, username, avatar, email, is_banned, created_at FROM users WHERE id=?")
      .get(profileId);

    if (!row) return res.status(404).json({ error: "Пользователь не найден" });

    const shoutCount = db
      .prepare("SELECT COUNT(*) c FROM shouts WHERE user_id=? AND parent_id IS NULL AND is_deleted=0")
      .get(profileId).c;

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
  });

  app.get("/api/v1/users/:id/shouts", (req, res) => {
    const profileId = req.params.id;
    const currentUserId = req.session?.user?.id ?? null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const offset = parseInt(req.query.offset, 10) || 0;

    console.log(`[Profile] Fetching shouts for user ${profileId}: limit=${limit}, offset=${offset}`);

    const topRaw = db.prepare(`
      SELECT s.*, u.username, u.avatar, u.is_banned,
             m.media_type AS m_type, m.media_url AS m_url, m.media_meta AS m_meta
      FROM shouts s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN media m ON m.id = s.media_id
      WHERE s.user_id = ? AND s.parent_id IS NULL AND s.is_deleted = 0
      ORDER BY datetime(s.created_at) DESC
      LIMIT ? OFFSET ?
    `).all(profileId, limit + 1, offset);

    const hasMore = topRaw.length > limit;
    const top = hasMore ? topRaw.slice(0, limit) : topRaw;
    const topIds = top.map((s) => s.id);

    // Fetch comments from the separate comments table
    const comments = topIds.length
      ? db
          .prepare(`
            SELECT c.*, u.username, u.avatar, u.is_banned,
                   m.media_type AS m_type, m.media_url AS m_url, m.media_meta AS m_meta
            FROM comments c
            JOIN users u ON u.id = c.user_id
            LEFT JOIN media m ON m.id = c.media_id
            WHERE c.shout_id IN (${topIds.map(() => "?").join(",")})
              AND c.is_deleted = 0
            ORDER BY datetime(c.created_at) ASC
          `)
          .all(...topIds)
      : [];

    const commentIds = comments.map((c) => c.id);

    // Shout likes
    const shoutLikesCount = new Map();
    if (topIds.length) {
      const rows = db
        .prepare(`
          SELECT shout_id, COUNT(*) c FROM shout_likes
          WHERE shout_id IN (${topIds.map(() => "?").join(",")})
          GROUP BY shout_id
        `)
        .all(...topIds);
      for (const r of rows) shoutLikesCount.set(r.shout_id, r.c);
    }

    const shoutLikedSet = new Set();
    if (currentUserId && topIds.length) {
      const rows = db
        .prepare(`
          SELECT shout_id FROM shout_likes
          WHERE user_id=? AND shout_id IN (${topIds.map(() => "?").join(",")})
        `)
        .all(currentUserId, ...topIds);
      for (const r of rows) shoutLikedSet.add(r.shout_id);
    }

    // Comment likes
    const commentLikesCount = new Map();
    if (commentIds.length) {
      const rows = db
        .prepare(`
          SELECT comment_id, COUNT(*) c FROM comment_likes
          WHERE comment_id IN (${commentIds.map(() => "?").join(",")})
          GROUP BY comment_id
        `)
        .all(...commentIds);
      for (const r of rows) commentLikesCount.set(r.comment_id, r.c);
    }

    const commentLikedSet = new Set();
    if (currentUserId && commentIds.length) {
      const rows = db
        .prepare(`
          SELECT comment_id FROM comment_likes
          WHERE user_id=? AND comment_id IN (${commentIds.map(() => "?").join(",")})
        `)
        .all(currentUserId, ...commentIds);
      for (const r of rows) commentLikedSet.add(r.comment_id);
    }

    const commentsByShout = new Map();
    for (const c of comments) {
      if (!commentsByShout.has(c.shout_id)) commentsByShout.set(c.shout_id, []);
      commentsByShout.get(c.shout_id).push(c);
    }

    function mapComment(row) {
      const media = buildMedia(row);
      return {
        id: row.id,
        shoutId: row.shout_id,
        user: {
          id: row.user_id,
          name: row.username,
          avatar: row.avatar,
          isBanned: !!row.is_banned,
        },
        content: row.content,
        timestamp: utcTimestamp(row.created_at),
        likes: commentLikesCount.get(row.id) || 0,
        likedBy: currentUserId && commentLikedSet.has(row.id) ? [currentUserId] : [],
        ...(media ? { media } : {}),
      };
    }

    function mapShout(row, children) {
      const media = buildMedia(row);
      return {
        id: row.id,
        user: {
          id: row.user_id,
          name: row.username,
          avatar: row.avatar,
          isBanned: !!row.is_banned,
        },
        content: row.content,
        timestamp: utcTimestamp(row.created_at),
        likes: shoutLikesCount.get(row.id) || 0,
        likedBy: currentUserId && shoutLikedSet.has(row.id) ? [currentUserId] : [],
        ...(media ? { media } : {}),
        comments: children,
      };
    }

    const dto = top.map((t) => {
      const children = (commentsByShout.get(t.id) || []).map((c) => mapComment(c));
      return mapShout(t, children);
    });

    console.log(`[Profile] Returning ${dto.length} shouts for user ${profileId}, hasMore=${hasMore}`);
    res.json({ shouts: dto, hasMore });
  });

  app.put("/api/v1/users/:id", requireAuth, async (req, res) => {
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
      const user = db.prepare("SELECT password_hash FROM users WHERE id=?").get(currentUserId);
      const ok = await verifyPassword(currentPassword, user.password_hash);
      if (!ok) {
        console.log(`[Profile] Password change failed: wrong current password`);
        return res.status(400).json({ error: "Неверный текущий пароль" });
      }
      const newHash = await hashPassword(newPassword);
      db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(newHash, currentUserId);
      console.log(`[Profile] Password updated for ${currentUserId}`);
    }

    if (username && username !== req.session.user.name) {
      const exists = db.prepare("SELECT id FROM users WHERE username=? AND id!=?").get(username, currentUserId);
      if (exists) {
        return res.status(409).json({ error: "Это имя пользователя уже занято" });
      }
      db.prepare("UPDATE users SET username=? WHERE id=?").run(username, currentUserId);
      req.session.user.name = username;
      console.log(`[Profile] Username updated to "${username}"`);
    }

    if (avatar !== undefined) {
      const newAvatar = avatar.trim() || avatarFor(req.session.user.name);
      db.prepare("UPDATE users SET avatar=? WHERE id=?").run(newAvatar, currentUserId);
      req.session.user.avatar = newAvatar;
      console.log(`[Profile] Avatar updated`);
    }

    if (email !== undefined) {
      const trimmed = email.trim();
      if (trimmed) {
        const existsEmail = db.prepare("SELECT id FROM users WHERE email=? AND id!=?").get(trimmed, currentUserId);
        if (existsEmail) {
          return res.status(409).json({ error: "Этот email уже используется" });
        }
        db.prepare("UPDATE users SET email=? WHERE id=?").run(trimmed, currentUserId);
      } else {
        db.prepare("UPDATE users SET email=NULL WHERE id=?").run(currentUserId);
      }
      console.log(`[Profile] Email updated`);
    }

    const updated = db
      .prepare("SELECT id, username, avatar, email, created_at FROM users WHERE id=?")
      .get(currentUserId);

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
  });

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
        db.prepare(
          "INSERT INTO media (id, user_id, media_type, media_url, media_meta) VALUES (?, ?, ?, ?, ?)"
        ).run(mediaId, userId, "image", mediaId, metaJson);

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
        db.prepare("UPDATE users SET avatar=? WHERE id=?").run(avatarUrl, userId);
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
