/**
 * Media attachment persistence — feature 006-multi-media-gallery.
 *
 * This module is the SOLE permitted writer of the `shout_media` / `comment_media`
 * join tables. There is exactly one storage concept for "what media is attached
 * to this post": an ordered list of 1..MAX_ATTACHMENTS rows in these tables.
 * A single video, a single YouTube reference, and a five-photo gallery are the
 * SAME shape — a list of length 1, 1, and 5 respectively — not three different
 * mechanisms. "Gallery" is what a list looks like once it has more than one
 * item, not a separate storage path.
 *
 * There used to be a second, redundant storage location — `Shout.media_id` /
 * `Comment.media_id`, kept in sync by convention — but that mirror was removed
 * (see specs/006-multi-media-gallery/research.md D1 for why it existed, and the
 * follow-up migration for why it was dropped): this table is now the only
 * source of truth, so there is nothing left to keep in sync.
 */

export const MAX_ATTACHMENTS = 5;

/**
 * Media types allowed when a post has MORE THAN ONE attached item (invariant
 * I4). A lone attachment of any type is always valid — video, YouTube, and
 * Giphy references all still work exactly as single-item lists. This only
 * gates the transition from "one item" to "many".
 */
const MULTI_ITEM_ELIGIBLE_TYPES = new Set(["image"]);

export function isMultiItemEligible(mediaType) {
  return MULTI_ITEM_ELIGIBLE_TYPES.has(mediaType);
}

/**
 * Russian message for exceeding the attachment cap.
 *
 * Kept here so both create routes emit identical copy, and correctly declined:
 * 5 takes the genitive plural "файлов" (Constitution Principle II). The client
 * shows the same wording via web/utils/plural.ts.
 */
export function attachmentLimitMessage() {
  return `Можно прикрепить не более ${MAX_ATTACHMENTS} файлов`;
}

/**
 * Persist the attached media for a freshly created shout or comment.
 *
 * Writes join rows at positions 0..n-1. This is the ONLY write path for a
 * post's media — a single video/YouTube/Giphy attachment goes through here
 * exactly like a five-photo gallery does, just with a one-item array. Must run
 * inside the same transaction that created the parent, so a failure can never
 * leave a parent with a half-written attachment list.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx  Prisma transaction client
 * @param {"shout"|"comment"} parentType
 * @param {string} parentId
 * @param {string[]} mediaIds  Ordered, 1..MAX_ATTACHMENTS, already validated as existing + eligible
 * @returns {Promise<string>} the preview (position-0) media id
 */
export async function attachMedia(tx, parentType, parentId, mediaIds) {
  if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
    throw new Error("attachMedia: mediaIds must be a non-empty array");
  }
  if (mediaIds.length > MAX_ATTACHMENTS) {
    // Defence in depth — routes validate this via Zod before we get here.
    throw new Error(`attachMedia: at most ${MAX_ATTACHMENTS} items allowed`);
  }
  if (new Set(mediaIds).size !== mediaIds.length) {
    throw new Error("attachMedia: duplicate media ids");
  }

  const rows = mediaIds.map((mediaId, position) => ({ media_id: mediaId, position }));

  if (parentType === "shout") {
    await tx.shoutMedia.createMany({
      data: rows.map((r) => ({ ...r, shout_id: parentId })),
    });
  } else if (parentType === "comment") {
    await tx.commentMedia.createMany({
      data: rows.map((r) => ({ ...r, comment_id: parentId })),
    });
  } else {
    throw new Error(`attachMedia: unknown parentType "${parentType}"`);
  }

  return mediaIds[0];
}

/**
 * Normalise the two accepted request shapes into a single ordered id list.
 * `mediaId` (legacy, single) is equivalent to a one-item list.
 * Returns null when neither is present.
 */
export function resolveMediaIds({ mediaId, mediaIds }) {
  if (Array.isArray(mediaIds) && mediaIds.length > 0) return mediaIds;
  if (mediaId) return [mediaId];
  return null;
}
