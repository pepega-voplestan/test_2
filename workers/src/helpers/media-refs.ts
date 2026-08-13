import { prisma } from "../db.js";

/**
 * Reference-checking for media reclaim (feature 008, research D9).
 *
 * Three tables can reference a media row, and `user_gifs` is the one that bites:
 * a personal-library GIF is deliberately attached to no post, so any check that
 * consults only the two join tables classifies every user's saved library as
 * orphaned and deletes it. That is the single most destructive mistake available
 * in this feature, which is why the check lives here once rather than being
 * open-coded per caller.
 */

export type RefDb = Pick<typeof prisma, "shoutMedia" | "commentMedia" | "userGif">;

/**
 * Soft-delete states of a shout/comment that PROTECT its media.
 *
 * `2` (ban-removed) is protecting, not merely un-reclaimable: constitution §III
 * exempts it because unbanning restores that content wholesale. Expressing the
 * exemption as a protection rather than as a filter applied afterwards makes
 * retention the structural default — a missed protection retains data, whereas
 * a missed filter deletes it (research D10).
 */
const PROTECTING_STATES = [0, 2];

/**
 * True when some display surface can still reach this media: a live or
 * ban-removed shout, a live or ban-removed comment, or an active personal
 * library entry. Media failing all three is the only reclaim candidate.
 */
export async function hasLiveReference(db: RefDb, mediaId: string): Promise<boolean> {
  const [shout, comment, gif] = await Promise.all([
    db.shoutMedia.findFirst({
      where: { media_id: mediaId, shout: { is_deleted: { in: PROTECTING_STATES } } },
      select: { shout_id: true },
    }),
    db.commentMedia.findFirst({
      where: { media_id: mediaId, comment: { is_deleted: { in: PROTECTING_STATES } } },
      select: { comment_id: true },
    }),
    db.userGif.findFirst({
      where: { media_id: mediaId, is_deleted: 0 },
      select: { id: true },
    }),
  ]);
  return Boolean(shout || comment || gif);
}

/**
 * True when the media was ever attached to anything, regardless of that thing's
 * soft-delete state.
 *
 * This is what separates the two reclaim classes, and they are NOT the same
 * question as `hasLiveReference`. Media with no row here at all was never
 * published (US2). Media with a row here but no live one sits behind deleted
 * content (US3) and is governed by a different grace period measured from the
 * deletion rather than from the upload — so it must not be swept up by the
 * never-published pass.
 */
export async function hasAnyReference(db: RefDb, mediaId: string): Promise<boolean> {
  const [shout, comment, gif] = await Promise.all([
    db.shoutMedia.findFirst({ where: { media_id: mediaId }, select: { shout_id: true } }),
    db.commentMedia.findFirst({ where: { media_id: mediaId }, select: { comment_id: true } }),
    db.userGif.findFirst({ where: { media_id: mediaId }, select: { id: true } }),
  ]);
  return Boolean(shout || comment || gif);
}
