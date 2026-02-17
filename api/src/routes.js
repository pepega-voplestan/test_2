import { z } from "zod";
import crypto from "crypto";
import { db } from "./db.js";
import { hashPassword, verifyPassword, requireAuth } from "./auth.js";

/* ---------- helpers ---------- */

function avatarFor(username) {
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(
    username
  )}`;
}

const authSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(200),
});

const shoutSchema = z.object({
  content: z.string().min(1).max(280),
});

/* ---------- routes ---------- */

export function mountRoutes(app) {
  /* health */
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  /* me */
  app.get("/api/me", (req, res) => {
    res.json({ user: req.session?.user ?? null });
  });

  /* register */
  app.post("/api/auth/register", async (req, res) => {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Bad input" });

    const { username, password } = parsed.data;
    console.log(`[Auth] Register attempt: ${username}`);

    const exists = db
      .prepare("SELECT id FROM users WHERE username=?")
      .get(username);
    if (exists) {
      console.log(`[Auth] Register failed: username "${username}" taken`);
      return res.status(409).json({ error: "Username taken" });
    }

    const id = crypto.randomUUID();
    const password_hash = await hashPassword(password);
    const avatar = avatarFor(username);

    db.prepare(
      "INSERT INTO users (id, username, password_hash, avatar) VALUES (?, ?, ?, ?)"
    ).run(id, username, password_hash, avatar);

    req.session.user = { id, name: username, avatar };
    console.log(`[Auth] Registered new user: ${username} (${id})`);
    res.json({ ok: true, user: req.session.user });
  });

  /* login */
  app.post("/api/auth/login", async (req, res) => {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Bad input" });

    const { username, password } = parsed.data;

    const user = db
      .prepare(
        "SELECT id, username, password_hash, avatar, is_banned FROM users WHERE username=?"
      )
      .get(username);

    if (!user) {
      console.log(`[Auth] Login failed: user "${username}" not found`);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (user.is_banned) {
      console.log(`[Auth] Login blocked: user "${username}" is banned`);
      return res.status(403).json({ error: "Banned" });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      console.log(`[Auth] Login failed: wrong password for "${username}"`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.user = {
      id: user.id,
      name: user.username,
      avatar: user.avatar,
    };

    console.log(`[Auth] Login success: ${username} (${user.id})`);
    res.json({ ok: true, user: req.session.user });
  });

  /* logout */
  app.post("/api/auth/logout", (req, res) => {
    const userName = req.session?.user?.name || "unknown";
    console.log(`[Auth] Logout: ${userName}`);
    req.session.destroy(() => res.json({ ok: true }));
  });

  /* get shouts */
  app.get("/api/shouts", (req, res) => {
    const currentUserId = req.session?.user?.id ?? null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const offset = parseInt(req.query.offset, 10) || 0;
    console.log(`[Shouts] Fetching shouts: limit=${limit}, offset=${offset}, user=${currentUserId || "anon"}`);

    // берём на 1 больше, чтобы понять есть ли следующая страница
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

    /* likes count */
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

    /* liked by current user */
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

    /* group replies */
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
  app.post("/api/shouts", requireAuth, (req, res) => {
    const parsed = shoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Bad input" });

    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO shouts (id, user_id, parent_id, content) VALUES (?, ?, NULL, ?)"
    ).run(id, req.session.user.id, parsed.data.content);

    console.log(`[Shouts] New shout ${id} by ${req.session.user.name}`);
    res.json({ ok: true, id });
  });

  /* reply */
  app.post("/api/shouts/:id/replies", requireAuth, (req, res) => {
    const parsed = shoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Bad input" });

    const parentId = req.params.id;
    const parent = db
      .prepare("SELECT id FROM shouts WHERE id=?")
      .get(parentId);
    if (!parent)
      return res.status(404).json({ error: "Parent not found" });

    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO shouts (id, user_id, parent_id, content) VALUES (?, ?, ?, ?)"
    ).run(id, req.session.user.id, parentId, parsed.data.content);

    console.log(`[Shouts] Reply ${id} to ${parentId} by ${req.session.user.name}`);
    res.json({ ok: true, id });
  });

  /* like toggle */
  app.post("/api/shouts/:id/like", requireAuth, (req, res) => {
    const shoutId = req.params.id;
    const userId = req.session.user.id;

    const exists = db
      .prepare(
        "SELECT 1 FROM shout_likes WHERE shout_id=? AND user_id=?"
      )
      .get(shoutId, userId);

    if (exists) {
      db.prepare(
        "DELETE FROM shout_likes WHERE shout_id=? AND user_id=?"
      ).run(shoutId, userId);
    } else {
      db.prepare(
        "INSERT OR IGNORE INTO shout_likes (shout_id, user_id) VALUES (?, ?)"
      ).run(shoutId, userId);
    }

    const likes = db
      .prepare("SELECT COUNT(*) c FROM shout_likes WHERE shout_id=?")
      .get(shoutId).c;

    console.log(`[Shouts] Like toggle on ${shoutId} by ${userId}: now ${likes} likes, isLiked=${!exists}`);
    res.json({ likes, isLiked: !exists });
  });
}
