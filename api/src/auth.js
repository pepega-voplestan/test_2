import bcrypt from "bcryptjs";
import { prisma } from "./db.js";

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export const requireAuth = (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: "Unauthorized" });
  next();
};

/**
 * Authoritative realtime-eligibility check.
 * Returns the user id only when the session has a user AND that account is
 * still active (exists and is not banned). Otherwise returns null.
 *
 * Used to gate the SSE channel: anonymous, banned, or deleted accounts are not
 * eligible for realtime updates. The Prisma lookup makes this robust against a
 * stale session (e.g. a user banned after signing in).
 */
export const getRealtimeUserId = async (req) => {
  const userId = req.session?.user?.id;
  if (!userId) return null;

  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { is_banned: true },
  });
  if (!account || account.is_banned) return null;

  return userId;
};
