import { z } from "zod";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import sharp from "sharp";
import { db } from "./db.js";
import { hashPassword, verifyPassword, requireAuth } from "./auth.js";

const AVATAR_DIR = path.join(path.dirname(process.env.DATABASE_PATH || "/data/app.db"), "avatars");
const AVATAR_SIZES = [64, 128, 256];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const AVATAR_MIN_DIM = 256;
const AVATAR_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!AVATAR_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Допустимые форматы: JPG, PNG, WebP"));
    }
    cb(null, true);
  },
});

/* ---------- helpers ---------- */

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
  content: z.string().min(1).max(SHOUT_MAX_LENGTH),
});

const profileUpdateSchema = z.object({
  username: z.string().min(3).max(32).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
  avatar: z.string().max(500).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6).max(200).optional(),
});

/* ---------- routes ---------- */

export function mountRoutes(app) {
  /* health */
  app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));

  /* me */
  app.get("/api/v1/me", (req, res) => {
    res.json({ user: req.session?.user ?? null });
  });

  /* register */
  app.post("/api/v1/auth/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const field = firstIssue?.path[0];
      if (field === "email") return res.status(400).json({ error: "Введите корректный email" });
      if (field === "username") return res.status(400).json({ error: "Имя пользователя: от 3 до 32 символов" });
      if (field === "password") return res.status(400).json({ error: "Пароль: минимум 6 символов" });
      return res.status(400).json({ error: "Некорректные данные" });
    }

    const { username, password, email } = parsed.data;
    console.log(`[Auth] Register attempt: ${username} (${email})`);

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

    const id = crypto.randomUUID();
    const password_hash = await hashPassword(password);
    const avatar = avatarFor(username);

    db.prepare(
      "INSERT INTO users (id, username, password_hash, avatar, email) VALUES (?, ?, ?, ?, ?)"
    ).run(id, username, password_hash, avatar, email);

    req.session.user = { id, name: username, avatar };
    console.log(`[Auth] Registered new user: ${username} (${id})`);
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

  /* get shouts */
  app.get("/api/v1/shouts", (req, res) => {
    const currentUserId = req.session?.user?.id ?? null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const offset = parseInt(req.query.offset, 10) || 0;
    console.log(`[Shouts] Fetching shouts: limit=${limit}, offset=${offset}, user=${currentUserId || "anon"}`);

    const topRaw = db.prepare(`
      SELECT s.*, u.username, u.avatar, u.is_banned
      FROM shouts s
      JOIN users u ON u.id = s.user_id
      WHERE s.parent_id IS NULL
      ORDER BY datetime(s.created_at) DESC
      LIMIT ? OFFSET ?
    `).all(limit + 1, offset);

    const hasMore = topRaw.length > limit;
    const top = hasMore ? topRaw.slice(0, limit) : topRaw;
    const topIds = top.map((s) => s.id);

    const replies = topIds.length
      ? db
          .prepare(`
            SELECT s.*, u.username, u.avatar, u.is_banned
            FROM shouts s
            JOIN users u ON u.id = s.user_id
            WHERE s.parent_id IN (${topIds.map(() => "?").join(",")})
            ORDER BY datetime(s.created_at) ASC
          `)
          .all(...topIds)
      : [];

    const allIds = [...topIds, ...replies.map((r) => r.id)];

    const likesCount = new Map();
    if (allIds.length) {
      const rows = db
        .prepare(`
          SELECT shout_id, COUNT(*) c
          FROM shout_likes
          WHERE shout_id IN (${allIds.map(() => "?").join(",")})
          GROUP BY shout_id
        `)
        .all(...allIds);
      for (const r of rows) likesCount.set(r.shout_id, r.c);
    }

    const likedSet = new Set();
    if (currentUserId && allIds.length) {
      const rows = db
        .prepare(`
          SELECT shout_id
          FROM shout_likes
          WHERE user_id=? AND shout_id IN (${allIds.map(() => "?").join(",")})
        `)
        .all(currentUserId, ...allIds);
      for (const r of rows) likedSet.add(r.shout_id);
    }

    const repliesByParent = new Map();
    for (const r of replies) {
      if (!repliesByParent.has(r.parent_id)) repliesByParent.set(r.parent_id, []);
      repliesByParent.get(r.parent_id).push(r);
    }

    function mapRow(row, children) {
      return {
        id: row.id,
        user: {
          id: row.user_id,
          name: row.username,
          avatar: row.avatar,
          isBanned: !!row.is_banned,
        },
        content: row.content,
        timestamp: row.created_at,
        likes: likesCount.get(row.id) || 0,
        likedBy: currentUserId && likedSet.has(row.id) ? [currentUserId] : [],
        replies: children,
      };
    }

    const dto = top.map((t) => {
      const children = (repliesByParent.get(t.id) || []).map((r) => mapRow(r, []));
      return mapRow(t, children);
    });

    console.log(`[Shouts] Returning ${dto.length} shouts, hasMore=${hasMore}`);
    res.json({ shouts: dto, hasMore });
  });

  /* new shout */
  app.post("/api/v1/shouts", requireAuth, (req, res) => {
    const parsed = shoutSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.code === "too_big") return res.status(400).json({ error: `Максимум ${SHOUT_MAX_LENGTH} символов` });
      return res.status(400).json({ error: "Сообщение не может быть пустым" });
    }

    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO shouts (id, user_id, parent_id, content) VALUES (?, ?, NULL, ?)"
    ).run(id, req.session.user.id, parsed.data.content);

    console.log(`[Shouts] New shout ${id} by ${req.session.user.name}`);
    res.json({ ok: true, id });
  });

  /* reply */
  app.post("/api/v1/shouts/:id/replies", requireAuth, (req, res) => {
    const parsed = shoutSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.code === "too_big") return res.status(400).json({ error: `Максимум ${SHOUT_MAX_LENGTH} символов` });
      return res.status(400).json({ error: "Ответ не может быть пустым" });
    }

    const parentId = req.params.id;
    const parent = db
      .prepare("SELECT id FROM shouts WHERE id=?")
      .get(parentId);
    if (!parent)
      return res.status(404).json({ error: "Запись не найдена" });

    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO shouts (id, user_id, parent_id, content) VALUES (?, ?, ?, ?)"
    ).run(id, req.session.user.id, parentId, parsed.data.content);

    console.log(`[Shouts] Reply ${id} to ${parentId} by ${req.session.user.name}`);
    res.json({ ok: true, id });
  });

  /* like toggle */
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
      .prepare("SELECT COUNT(*) c FROM shouts WHERE user_id=? AND parent_id IS NULL")
      .get(profileId).c;

    const profile = {
      id: row.id,
      name: row.username,
      avatar: row.avatar,
      isBanned: !!row.is_banned,
      createdAt: row.created_at,
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
      SELECT s.*, u.username, u.avatar, u.is_banned
      FROM shouts s
      JOIN users u ON u.id = s.user_id
      WHERE s.user_id = ? AND s.parent_id IS NULL
      ORDER BY datetime(s.created_at) DESC
      LIMIT ? OFFSET ?
    `).all(profileId, limit + 1, offset);

    const hasMore = topRaw.length > limit;
    const top = hasMore ? topRaw.slice(0, limit) : topRaw;
    const topIds = top.map((s) => s.id);

    const replies = topIds.length
      ? db
          .prepare(`
            SELECT s.*, u.username, u.avatar, u.is_banned
            FROM shouts s
            JOIN users u ON u.id = s.user_id
            WHERE s.parent_id IN (${topIds.map(() => "?").join(",")})
            ORDER BY datetime(s.created_at) ASC
          `)
          .all(...topIds)
      : [];

    const allIds = [...topIds, ...replies.map((r) => r.id)];

    const likesCount = new Map();
    if (allIds.length) {
      const rows = db
        .prepare(`
          SELECT shout_id, COUNT(*) c FROM shout_likes
          WHERE shout_id IN (${allIds.map(() => "?").join(",")})
          GROUP BY shout_id
        `)
        .all(...allIds);
      for (const r of rows) likesCount.set(r.shout_id, r.c);
    }

    const likedSet = new Set();
    if (currentUserId && allIds.length) {
      const rows = db
        .prepare(`
          SELECT shout_id FROM shout_likes
          WHERE user_id=? AND shout_id IN (${allIds.map(() => "?").join(",")})
        `)
        .all(currentUserId, ...allIds);
      for (const r of rows) likedSet.add(r.shout_id);
    }

    const repliesByParent = new Map();
    for (const r of replies) {
      if (!repliesByParent.has(r.parent_id)) repliesByParent.set(r.parent_id, []);
      repliesByParent.get(r.parent_id).push(r);
    }

    function mapRow(row, children) {
      return {
        id: row.id,
        user: {
          id: row.user_id,
          name: row.username,
          avatar: row.avatar,
          isBanned: !!row.is_banned,
        },
        content: row.content,
        timestamp: row.created_at,
        likes: likesCount.get(row.id) || 0,
        likedBy: currentUserId && likedSet.has(row.id) ? [currentUserId] : [],
        replies: children,
      };
    }

    const dto = top.map((t) => {
      const children = (repliesByParent.get(t.id) || []).map((r) => mapRow(r, []));
      return mapRow(t, children);
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
        createdAt: updated.created_at,
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
