import { Worker } from "bullmq";
import fs from "fs";
import path from "path";
import { prisma } from "../db.js";
import { redisConnection } from "../redis.js";
import { hasAnyReference, type RefDb } from "../helpers/media-refs.js";
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
 * Currently handles ONE class: media that was uploaded but never published
 * (US2). Media sitting behind soft-deleted content (US3) is a separate class
 * with its own grace period measured from the deletion, and is deliberately not
 * swept here yet — `MEDIA_DELETED_GRACE_DAYS` is already wired through the
 * compose files for it, and is intentionally unread until that class ships.
 *
 * Files only. No row is ever deleted: the tombstone rendering for a deleted
 * shout that still carries live comments depends on the join rows surviving
 * (FR-009, constitution §III).
 *
 * Avatars (FR-021) need no exclusion here: they carry no `media` row and live
 * on a separate volume (`AVATAR_PATH`, default /data/avatars), so they are never
 * candidates. Stated because "we never delete avatars" is a requirement, and a
 * requirement satisfied by accident of structure should say so.
 */

const UNPUBLISHED_GRACE_DAYS = Number(process.env.MEDIA_UNPUBLISHED_GRACE_DAYS) || 7;
const MEDIA_DIR = process.env.MEDIA_PATH || "/media";
const BATCH_SIZE = 500;

/** Media kinds that own local files. `youtube`/`giphy` are remote references. */
const LOCAL_FILE_TYPES = ["image", "video"];

/**
 * The on-disk mirror of `media_meta`. Kept rather than reclaimed: it is a few
 * hundred bytes, and leaving it behind means an operator walking the volume can
 * still see that the directory was reclaimed deliberately instead of finding an
 * unexplained empty directory.
 */
const META_MIRROR = "meta.json";

export interface MediaReclaimDeps {
  db: Pick<typeof prisma, "media"> & RefDb;
  fileSystem: FileSystemLike;
  mediaDir: string;
  unpublishedGraceDays: number;
  batchSize: number;
  dryRun: boolean;
  now: number;
}

/**
 * One sweep. Mirrors `runOriginalDowngrade`'s shape: every dependency is
 * injectable with a real default, so unit tests need neither a database nor
 * Redis.
 *
 * Candidates are paged with take/cursor rather than loaded at once (research
 * D6). Unlike the downgrade sweep, this candidate set does not self-empty —
 * protected media stays a candidate forever, and in `dryRun` nothing is marked
 * at all — so an unbounded `findMany` would grow with the volume.
 */
export async function runMediaReclaim(deps: Partial<MediaReclaimDeps> = {}): Promise<ReclaimResult> {
  const {
    db = prisma,
    fileSystem = fs,
    mediaDir = MEDIA_DIR,
    unpublishedGraceDays = UNPUBLISHED_GRACE_DAYS,
    batchSize = BATCH_SIZE,
    dryRun = false,
    now = Date.now(),
  } = deps;

  const result = emptyResult(dryRun);
  const graceMs = unpublishedGraceDays * 24 * 60 * 60 * 1000;
  // Full ISO-8601, matching original-downgrade.ts: valid whether the generated
  // client types created_at as String or DateTime.
  const cutoff = new Date(now - graceMs).toISOString();
  const nowDate = new Date(now);

  let cursor: string | undefined;
  for (;;) {
    const batch = await db.media.findMany({
      where: { media_type: { in: LOCAL_FILE_TYPES }, created_at: { lt: cutoff } },
      select: { id: true, media_url: true, media_meta: true },
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
        console.error(`[media-reclaim] Unparseable media_meta for ${m.id}`);
        continue;
      }
      if (meta.reclaimed?.files) {
        result.skipped++;
        continue;
      }

      // Any reference at all — live, ban-removed, or soft-deleted — means this
      // was published, so it is not this class's business. The deleted-content
      // class (US3) will decide those on its own grace period.
      if (await hasAnyReference(db, m.id)) {
        result.skipped++;
        continue;
      }

      try {
        const dir = path.join(mediaDir, m.media_url);
        const filesToRemove = fileSystem.existsSync(dir)
          ? fileSystem.readdirSync(dir).filter((name) => name !== META_MIRROR)
          : [];

        const { bytesFreed, applied } = await performReclaim(
          {
            mediaId: m.id,
            mediaUrl: m.media_url,
            meta,
            metaJson: m.media_meta,
            filesToRemove,
            // Nothing is meant to survive — the media becomes unrenderable by
            // design, which is what `reclaimed.files` records.
            survivor: null,
            markerPatch: { files: true },
          },
          { db: db.media, fileSystem, mediaDir, dryRun, now: nowDate }
        );
        if (!applied) {
          // Another writer touched the row between our read and our write.
          // Nothing was deleted; the next sweep replans from fresh state.
          result.skipped++;
          continue;
        }
        result.bytesFreed += bytesFreed;
        result.reclaimed++;
      } catch (e) {
        result.failed++;
        console.error(`[media-reclaim] Failed for media ${m.id}:`, (e as Error).message);
      }
    }
  }

  if (result.scanned > 0) console.log(formatResult("media-reclaim", result));
  return result;
}

export function createMediaReclaimWorker(): Worker {
  return new Worker(
    "media-reclaim",
    async () => {
      await runMediaReclaim();
    },
    { connection: redisConnection }
  );
}
