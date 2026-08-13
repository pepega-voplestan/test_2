import { prisma } from "../db.js";

export type RefDb = Pick<typeof prisma, "shoutMedia" | "commentMedia" | "userGif">;

/**
 * States that PROTECT referenced media. `2` (ban-removed) is expressed as a
 * protection rather than a filter applied later so retention is the structural
 * default: a missed protection retains data, a missed filter destroys it.
 */
const PROTECTING_STATES = [0, 2];

/** Some display surface can still reach this media. */
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
    // A personal-library GIF is attached to no post. Omitting this table
    // classifies every user's saved library as orphaned and deletes it.
    db.userGif.findFirst({ where: { media_id: mediaId, is_deleted: 0 }, select: { id: true } }),
  ]);
  return Boolean(shout || comment || gif);
}

/**
 * The media was attached to something once, whatever state that thing is in
 * now. Distinct from `hasLiveReference`, and the distinction picks the clock:
 * no row at all means never published (grace measured from upload), whereas a
 * row pointing at deleted content is measured from the deletion instead.
 */
export async function hasAnyReference(db: RefDb, mediaId: string): Promise<boolean> {
  const [shout, comment, gif] = await Promise.all([
    db.shoutMedia.findFirst({ where: { media_id: mediaId }, select: { shout_id: true } }),
    db.commentMedia.findFirst({ where: { media_id: mediaId }, select: { comment_id: true } }),
    db.userGif.findFirst({ where: { media_id: mediaId }, select: { id: true } }),
  ]);
  return Boolean(shout || comment || gif);
}
