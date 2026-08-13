import type { MediaMeta } from "./reclaim.js";

/**
 * Which generated WebP variant no display surface can request, per media kind.
 *
 * The rule is asymmetric, and inverting it breaks visible images:
 *   - still image: 320 is dead (nothing reads the DTO's `thumb`), 1600 is LIVE
 *     (the lightbox reads `full`);
 *   - animated GIF: 1600 is dead (animated media plays from original.gif), 320
 *     is LIVE (the personal GIF-library picker grid requests it directly);
 *   - single-frame GIF in the personal library: NOTHING is dead. It is reachable
 *     from both ends — the picker grid reads its 320 like any library item
 *     (`buildMyGifItem`), while `buildMedia` sees `animated:false` and serves it
 *     as a still, so the lightbox reads its 1600. Keying this case off
 *     `meta.animated` alone would delete a thumbnail the picker still renders.
 *
 * 960 is reachable for every kind and is never removable — the nginx fallback
 * added for this feature degrades to it, so removing it would turn a graceful
 * degradation back into a 404.
 */

export interface VariantPlan {
  /** Basenames to unlink. */
  remove: string[];
  /** Must exist and be non-empty before anything is removed. */
  survivor: string;
  /** Widths recorded in the reclaim marker. */
  widths: string[];
}

const STILL: VariantPlan = { remove: ["320.webp"], survivor: "960.webp", widths: ["320"] };
const ANIMATED: VariantPlan = { remove: ["1600.webp"], survivor: "960.webp", widths: ["1600"] };

/**
 * @param hasGifSource whether an `original.gif` is present for this media — the
 *   marker of a personal-library item, which the caller reads from disk because
 *   nothing in `media_meta` records it for rows written before this feature.
 */
export function unreachableVariantPlan(
  mediaType: string,
  meta: MediaMeta,
  hasGifSource: boolean
): VariantPlan | null {
  if (mediaType !== "image") return null;
  if (meta.reclaimed?.files) return null;

  // Order matters: `animated` is tested first so an item whose original.gif has
  // already been reclaimed still gets the animated rule rather than falling
  // through to STILL and losing the 320 its picker tile reads.
  let plan: VariantPlan | null;
  if (meta.animated) plan = ANIMATED;
  else if (hasGifSource) plan = null;
  else plan = STILL;
  if (!plan) return null;

  const already = meta.reclaimed?.variants ?? [];
  if (plan.widths.every((w) => already.includes(w))) return null;

  return plan;
}
