import fs from "fs";
import path from "path";

/**
 * Shared reclaim mechanism for feature 008-reclaim-unused-media.
 *
 * Both reclaim capabilities — the one-time unreachable-variant script and the
 * recurring no-live-reference job — route every deletion through
 * `performReclaim` so the crash-safety ordering exists in exactly one place.
 */

export interface ReclaimedMarker {
  /** Variant widths whose .webp files were removed, e.g. ["320"]. */
  variants?: string[];
  /** True once EVERY file is gone — the media is permanently unrenderable. */
  files?: boolean;
  /**
   * True once the uploaded `original.mp4` has been reclaimed by age (feature
   * 011). Kept out of `variants`, which is keyed by width strings.
   */
  video?: boolean;
  at: string;
}

export interface MediaMeta {
  w?: number;
  h?: number;
  size?: number;
  mime?: string;
  animated?: boolean;
  orig?: string;
  uploaded_at?: string;
  converted?: boolean;
  orientation?: number;
  reclaimed?: ReclaimedMarker;
  [k: string]: unknown;
}

export interface ReclaimResult {
  scanned: number;
  reclaimed: number;
  skipped: number;
  failed: number;
  bytesFreed: number;
  dryRun: boolean;
}

export function emptyResult(dryRun: boolean): ReclaimResult {
  return { scanned: 0, reclaimed: 0, skipped: 0, failed: 0, bytesFreed: 0, dryRun };
}

export type FileSystemLike = Pick<
  typeof fs,
  "existsSync" | "statSync" | "unlinkSync" | "writeFileSync" | "readdirSync"
>;

export interface MediaUpdater {
  updateMany(args: {
    where: { id: string; media_meta: string | null };
    data: { media_meta: string };
  }): Promise<{ count: number }>;
}

export function parseMeta(json: string | null | undefined): MediaMeta | null {
  try {
    return JSON.parse(json || "{}") as MediaMeta;
  } catch {
    return null;
  }
}

/**
 * Merge a reclaim marker into existing meta. `variants` accumulates across runs
 * so a second pass never forgets what a first pass removed.
 */
export function mergeReclaimed(
  meta: MediaMeta,
  patch: { variants?: string[]; files?: boolean; video?: boolean },
  now: Date
): MediaMeta {
  const prior = meta.reclaimed;
  const variants = [...new Set([...(prior?.variants ?? []), ...(patch.variants ?? [])])];
  return {
    ...meta,
    reclaimed: {
      ...(variants.length > 0 ? { variants } : {}),
      ...(patch.files || prior?.files ? { files: true } : {}),
      ...(patch.video || prior?.video ? { video: true } : {}),
      at: now.toISOString(),
    },
  };
}

/**
 * The survivor check refused the removal — the last usable copy is missing or
 * empty. Typed rather than a bare Error so a caller can attribute it to that
 * cause specifically: a database outage also throws out of `performReclaim`,
 * and reporting one as the other sends an operator to the wrong system.
 */
export class SurvivorMissingError extends Error {
  constructor(survivor: string, mediaId: string) {
    super(`survivor ${survivor} missing or empty for media ${mediaId}`);
    this.name = "SurvivorMissingError";
  }
}

export interface RemovalPlan {
  mediaId: string;
  /** Media directory name — joined onto mediaDir. */
  mediaUrl: string;
  meta: MediaMeta;
  /**
   * The exact `media_meta` string this plan was built from. The write is
   * conditional on it, so a row another writer has touched since is left alone
   * instead of being clobbered — see `performReclaim`.
   */
  metaJson: string | null;
  /** Basenames to unlink, e.g. ["320.webp"]. */
  filesToRemove: string[];
  /**
   * Basename that MUST exist and be non-empty before anything is removed.
   * Null when the whole item is being reclaimed and nothing is meant to survive.
   */
  survivor: string | null;
  markerPatch: { variants?: string[]; files?: boolean; video?: boolean };
}

export interface PerformDeps {
  db: MediaUpdater;
  fileSystem: FileSystemLike;
  mediaDir: string;
  dryRun: boolean;
  now: Date;
}

/**
 * Execute one item's reclaim.
 *
 * Ordering is the whole point and is mandated by FR-016/FR-017:
 *   1. verify the survivor, so we never remove the last usable copy;
 *   2. size the doomed files while they still exist;
 *   3. persist the marker BEFORE unlinking, so a crash between the two leaves a
 *      stray file (harmless, skipped next run) rather than a record pointing at
 *      a file that is gone;
 *   4. unlink, treating an already-missing file as success.
 *
 * Step 3 is a compare-and-set on the whole `media_meta` blob, because
 * `original-downgrade` rewrites the same column from another process on its own
 * hourly schedule. A blind write here could restore that job's dropped `orig`
 * key after it had already unlinked the original, leaving `full` pointing at a
 * file that no longer exists — and no `.webp` fallback covers that path. When
 * the row has moved under us the update matches nothing and we return
 * `applied: false`, having deleted nothing; the next run replans from fresh
 * state.
 *
 * Throws if the survivor check fails; the caller counts that as `failed` and
 * leaves the item untouched for a later run.
 */
export async function performReclaim(
  plan: RemovalPlan,
  deps: PerformDeps
): Promise<{ bytesFreed: number; applied: boolean; strays: string[] }> {
  const { db, fileSystem, mediaDir, dryRun, now } = deps;
  const dir = path.join(mediaDir, plan.mediaUrl);

  if (plan.survivor) {
    const survivorPath = path.join(dir, plan.survivor);
    if (!fileSystem.existsSync(survivorPath) || fileSystem.statSync(survivorPath).size === 0) {
      throw new SurvivorMissingError(plan.survivor, plan.mediaId);
    }
  }

  const doomed: { name: string; size: number }[] = [];
  for (const name of plan.filesToRemove) {
    const p = path.join(dir, name);
    if (!fileSystem.existsSync(p)) continue;
    doomed.push({ name, size: fileSystem.statSync(p).size });
  }
  const plannedBytes = doomed.reduce((n, f) => n + f.size, 0);

  if (dryRun) return { bytesFreed: plannedBytes, applied: true, strays: [] };

  const newMeta = mergeReclaimed(plan.meta, plan.markerPatch, now);
  const newMetaJson = JSON.stringify(newMeta);

  const { count } = await db.updateMany({
    where: { id: plan.mediaId, media_meta: plan.metaJson },
    data: { media_meta: newMetaJson },
  });
  if (count === 0) return { bytesFreed: 0, applied: false, strays: [] };

  try {
    fileSystem.writeFileSync(path.join(dir, "meta.json"), newMetaJson);
  } catch {
    /* on-disk mirror is best-effort; the DB is authoritative */
  }

  // Counted AFTER the unlink, not before: a read-only mount or a permission
  // problem makes every removal throw, and summing up front would report a
  // healthy `bytesFreed` for a run that freed nothing.
  let bytesFreed = 0;
  const strays: string[] = [];
  for (const { name, size } of doomed) {
    const p = path.join(dir, name);
    try {
      fileSystem.unlinkSync(p);
      bytesFreed += size;
    } catch {
      // Gone by any means is the goal state; only a file that survived is a stray.
      if (!fileSystem.existsSync(p)) bytesFreed += size;
      else strays.push(name);
    }
  }

  return { bytesFreed, applied: true, strays };
}

export function formatResult(label: string, r: ReclaimResult): string {
  const mb = (r.bytesFreed / 1048576).toFixed(1);
  return (
    `[${label}]${r.dryRun ? " DRY RUN" : ""} scanned=${r.scanned} reclaimed=${r.reclaimed} ` +
    `skipped=${r.skipped} failed=${r.failed} freed=${mb}MB`
  );
}
