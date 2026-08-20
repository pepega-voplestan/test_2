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
 * Which reclaim class a media item falls into.
 *
 * `deletedContent` is the trap: soft-delete leaves the join rows in place, so
 * media behind a deleted shout still HAS a reference and is not "never
 * published". It runs on a deletion-based clock instead (US3).
 */
export type RefState = "live" | "deletedContent" | "none";

export async function classifyReferences(db: RefDb, mediaId: string): Promise<RefState> {
  if (await hasLiveReference(db, mediaId)) return "live";
  return (await hasAnyReference(db, mediaId)) ? "deletedContent" : "none";
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

/**
 * Which of `mediaIds` are saved in someone's personal GIF library.
 *
 * Batch-shaped on purpose: the age-based image sweep (feature 011) calls this
 * once per page, never once per item.
 *
 * Deliberately NOT `hasLiveReference`/`hasAnyReference`. Both also match
 * `shout_media`/`comment_media`, and the age sweep's target population IS media
 * attached to live posts — reusing either would skip every candidate and reduce
 * the sweep to a no-op that still reports success.
 *
 * No `is_deleted` filter, for the same reason the constant above lists `2` as a
 * protecting state: a missed protection retains data, a missed filter destroys
 * it. Constitution §III exempts personal-library media from losing a file on
 * ANY ground, so library membership protects regardless of the row's state.
 */
export async function libraryMediaIds(
  db: Pick<RefDb, "userGif">,
  mediaIds: string[]
): Promise<Set<string>> {
  if (mediaIds.length === 0) return new Set();
  const rows = await db.userGif.findMany({
    where: { media_id: { in: mediaIds } },
    select: { media_id: true },
  });
  return new Set(rows.map((r) => r.media_id));
}
