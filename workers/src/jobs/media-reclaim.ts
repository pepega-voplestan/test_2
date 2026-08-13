import { Worker } from "bullmq";
import fs from "fs";
import path from "path";
import { prisma } from "../db.js";
import { redisConnection } from "../redis.js";
import { classifyReferences, type RefDb } from "../helpers/media-refs.js";
import {
  emptyResult,
  formatResult,
  parseMeta,
  performReclaim,
  type FileSystemLike,
  type ReclaimResult,
} from "../helpers/reclaim.js";

/**
 * Recurring reclaim of media files no display surface can reach (feature 008).
 *
 * Two classes, each with its own grace period:
 *   - never published   — no reference of any kind (US2)
 *   - deleted content   — references exist, but none to live or banned content (US3)
 *
 * Both clocks run off `media.created_at`. For the deleted class the spec asks
 * for time-since-DELETION, but no schema records that: `is_deleted` is a bare
 * flag with no timestamp. Clocking off creation was chosen deliberately over
 * adding one (2026-08-13), and the consequence is real — deleting a post that
 * is already older than the grace period makes its media unrecoverable at once,
 * with no window in which restore is still media-complete.
 *
 * Files only, never rows: a deleted shout with live comments still renders a
 * tombstone from them (FR-009, constitution §III). Avatars (FR-021) need no
 * exclusion — they carry no `media` row and live on a separate volume.
 */

const UNPUBLISHED_GRACE_DAYS = Number(process.env.MEDIA_UNPUBLISHED_GRACE_DAYS) || 7;
const DELETED_GRACE_DAYS = Number(process.env.MEDIA_DELETED_GRACE_DAYS) || 7;
const MEDIA_DIR = process.env.MEDIA_PATH || "/media";
const BATCH_SIZE = 500;

/** Media kinds that own local files. `youtube`/`giphy` are remote references. */
const LOCAL_FILE_TYPES = ["image", "video"];

/** Left on disk so a reclaimed directory reads as deliberate, not as an accident. */
const META_MIRROR = "meta.json";

/**
 * `skipped` is the total; `retained` says why. Without the split a zero-reclaim
 * run is indistinguishable from a broken one.
 */
export interface MediaReclaimResult extends ReclaimResult {
  retained: {
    liveReference: number;
    /** Eligible class, but not yet past its grace period. */
    inGrace: number;
    alreadyReclaimed: number;
    raced: number;
    unreadableMeta: number;
  };
  /** Split so the storage win can be attributed per waste class (SC-004). */
  reclaimedUnpublished: number;
  reclaimedDeleted: number;
  /** Files the unlink could not remove. Non-zero means the volume is not writable. */
  strayFiles: number;
  /** Echoed so a zero-reclaim run explains itself without a second lookup. */
  graceDays: number;
  deletedGraceDays: number;
  cutoff: string;
}

/** Single formatting site — the worker log, the job log, and Bull Board agree. */
export function summarize(r: MediaReclaimResult): string {
  const { liveReference, inGrace, alreadyReclaimed, raced, unreadableMeta } = r.retained;
  return (
    `${formatResult("media-reclaim", r)} ` +
    `by-class(unpublished=${r.reclaimedUnpublished} deleted=${r.reclaimedDeleted}) ` +
    `retained(live=${liveReference} inGrace=${inGrace} already=${alreadyReclaimed} ` +
    `raced=${raced} unreadable=${unreadableMeta}) ` +
    `strays=${r.strayFiles} grace(unpublished=${r.graceDays} deleted=${r.deletedGraceDays}) cutoff=${r.cutoff}`
  );
}

export interface MediaReclaimDeps {
  db: Pick<typeof prisma, "media"> & RefDb;
  fileSystem: FileSystemLike;
  mediaDir: string;
  unpublishedGraceDays: number;
  deletedGraceDays: number;
  batchSize: number;
  dryRun: boolean;
  now: number;
}

/**
 * One sweep. Mirrors `runOriginalDowngrade`'s shape: every dependency is
 * injectable with a real default, so unit tests need neither a database nor
 * Redis.
 *
 * Paged with take/cursor because this candidate set never self-empties the way
 * the downgrade sweep's does: protected media stays a candidate forever.
 */
export async function runMediaReclaim(deps: Partial<MediaReclaimDeps> = {}): Promise<MediaReclaimResult> {
  const {
    db = prisma,
    fileSystem = fs,
    mediaDir = MEDIA_DIR,
    unpublishedGraceDays = UNPUBLISHED_GRACE_DAYS,
    deletedGraceDays = DELETED_GRACE_DAYS,
    batchSize = BATCH_SIZE,
    dryRun = false,
    now = Date.now(),
  } = deps;

  const result: MediaReclaimResult = {
    ...emptyResult(dryRun),
    retained: { liveReference: 0, inGrace: 0, alreadyReclaimed: 0, raced: 0, unreadableMeta: 0 },
    strayFiles: 0,
    reclaimedUnpublished: 0,
    reclaimedDeleted: 0,
    graceDays: unpublishedGraceDays,
    deletedGraceDays,
    cutoff: "",
  };
  const DAY_MS = 24 * 60 * 60 * 1000;
  const unpublishedBefore = now - unpublishedGraceDays * DAY_MS;
  const deletedBefore = now - deletedGraceDays * DAY_MS;
  // Prefilter on whichever window is more permissive, then apply the exact one
  // per class below — otherwise the shorter grace silently caps the longer.
  const cutoff = new Date(Math.max(unpublishedBefore, deletedBefore)).toISOString();
  result.cutoff = cutoff;
  const nowDate = new Date(now);

  let cursor: string | undefined;
  for (;;) {
    const batch = await db.media.findMany({
      where: { media_type: { in: LOCAL_FILE_TYPES }, created_at: { lt: cutoff } },
      select: { id: true, media_url: true, media_meta: true, created_at: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const m of batch) {
      result.scanned++;

      const meta = parseMeta(m.media_meta);
      if (!meta) {
        result.failed++;
        result.retained.unreadableMeta++;
        console.error(`[media-reclaim] Unparseable media_meta for ${m.id}`);
        continue;
      }
      if (meta.reclaimed?.files) {
        result.skipped++;
        result.retained.alreadyReclaimed++;
        continue;
      }

      const refs = await classifyReferences(db, m.id);
      if (refs === "live") {
        result.skipped++;
        result.retained.liveReference++;
        continue;
      }

      const createdAt =
        typeof m.created_at === "string" ? Date.parse(m.created_at) : m.created_at.getTime();
      const eligibleAfter = refs === "none" ? unpublishedBefore : deletedBefore;
      if (!(createdAt < eligibleAfter)) {
        result.skipped++;
        result.retained.inGrace++;
        continue;
      }

      try {
        const dir = path.join(mediaDir, m.media_url);
        const filesToRemove = fileSystem.existsSync(dir)
          ? fileSystem.readdirSync(dir).filter((name) => name !== META_MIRROR)
          : [];

        const { bytesFreed, applied, strays } = await performReclaim(
          {
            mediaId: m.id,
            mediaUrl: m.media_url,
            meta,
            metaJson: m.media_meta,
            filesToRemove,
            survivor: null,
            markerPatch: { files: true },
          },
          { db: db.media, fileSystem, mediaDir, dryRun, now: nowDate }
        );
        if (!applied) {
          // Row moved under us; nothing was deleted. Not a failure — replanned next sweep.
          result.skipped++;
          result.retained.raced++;
          continue;
        }
        result.bytesFreed += bytesFreed;
        result.reclaimed++;
        if (refs === "none") result.reclaimedUnpublished++;
        else result.reclaimedDeleted++;
        if (strays.length > 0) {
          result.strayFiles += strays.length;
          console.error(`[media-reclaim] ${m.id}: could not remove ${strays.join(", ")}`);
        }
      } catch (e) {
        result.failed++;
        console.error(`[media-reclaim] Failed for media ${m.id}:`, (e as Error).message);
      }
    }
  }

  // Logged unconditionally: this job is triggered by hand as often as by cron,
  // and "it did nothing" must be distinguishable from "it never ran".
  console.log(summarize(result));
  if (result.strayFiles > 0) {
    console.error(
      `[media-reclaim] ${result.strayFiles} file(s) survived removal — is ${mediaDir} writable?`
    );
  }
  return result;
}

export function createMediaReclaimWorker(): Worker {
  return new Worker(
    "media-reclaim",
    async (job) => {
      const result = await runMediaReclaim();
      // Two different Bull Board panels: `job.log` fills the Logs tab, the
      // return value fills the Return Value tab. Discarding either leaves an
      // operator staring at a blank panel after a manual run.
      await job.log(summarize(result));
      if (result.strayFiles > 0) {
        await job.log(`WARNING: ${result.strayFiles} file(s) survived removal — is the media volume writable?`);
      }
      return result;
    },
    { connection: redisConnection }
  );
}
