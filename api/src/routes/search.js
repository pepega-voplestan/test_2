import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncHandler, utcTimestamp } from "../helpers/common.js";
import { z } from "zod";

const router = Router();

const searchSchema = z.object({
  q: z.string().min(1).max(100).trim(),
  type: z.enum(["users", "shouts"]).default("shouts"),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

async function searchUsers({ q, limit, offset }) {
  const pattern = `%${q}%`;
  const rows = await prisma.$queryRaw`
    SELECT id, username, avatar
    FROM users
    WHERE is_banned = 0
      AND username ILIKE ${pattern}
    ORDER BY similarity(username, ${q}) DESC, username ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return { users: rows.map(u => ({ id: u.id, name: u.username, avatar: u.avatar })) };
}

async function searchShouts({ q, limit, offset, userId, currentUserId }) {
  const pattern = `%${q}%`;
  const userFilter = userId ? Prisma.sql`AND s.user_id = ${userId}` : Prisma.empty;
  const ignoredFilter = currentUserId
    ? Prisma.sql`AND s.user_id NOT IN (SELECT target_user_id FROM ignored_users WHERE owner_user_id = ${currentUserId})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      s.id,
      s.user_id,
      s.content,
      s.visibility_tag,
      s.created_at,
      u.username,
      u.avatar,
      u.is_banned
    FROM shouts s
    JOIN users u ON u.id = s.user_id
    WHERE s.is_deleted = 0
      AND u.is_banned = 0
      AND s.visibility_tag IS DISTINCT FROM 'spoiler'
      AND s.content ILIKE ${pattern}
      ${userFilter}
      ${ignoredFilter}
    ORDER BY similarity(s.content, ${q}) DESC, s.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return {
    shouts: rows.map(s => ({
      id: s.id,
      content: s.content,
      visibilityTag: s.visibility_tag || "",
      timestamp: utcTimestamp(s.created_at),
      user: {
        id: s.user_id,
        name: s.username,
        avatar: s.avatar,
        isBanned: !!s.is_banned,
      },
    })),
  };
}

const searchHandlers = {
  users: searchUsers,
  shouts: searchShouts,
};

router.get("/search", asyncHandler(async (req, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const { q, type, userId, limit, offset } = parsed.data;
  const currentUserId = req.session?.user?.id ?? null;

  const result = await searchHandlers[type]({ q, userId, limit, offset, currentUserId });
  return res.json(result);
}));

export default router;
