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
 * Handles the never-published class only. Media behind soft-deleted content is
 * measured from the deletion instead, so `MEDIA_DELETED_GRACE_DAYS` is wired
 * through the compose files but stays unread until that class ships.
 *
 * Files only, never rows: a deleted shout with live comments still renders a
 * tombstone from them (FR-009, constitution §III). Avatars (FR-021) need no
 * exclusion — they carry no `media` row and live on a separate volume.
 */

const UNPUBLISHED_GRACE_DAYS = Number(process.env.MEDIA_UNPUBLISHED_GRACE_DAYS) || 7;
const MEDIA_DIR = process.env.MEDIA_PATH || "/media";
const BATCH_SIZE = 500;

/** Media kinds that own local files. `youtube`/`giphy` are remote references. */
const LOCAL_FILE_TYPES = ["image", "video"];

/** Left on disk so a reclaimed directory reads as deliberate, not as an accident. */
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
 * Paged with take/cursor because this candidate set never self-empties the way
 * the downgrade sweep's does: protected media stays a candidate forever.
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

      // Any reference at all means it was published, so it belongs to the
      // deleted-content class and its clock, not this one.
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
            survivor: null,
            markerPatch: { files: true },
          },
          { db: db.media, fileSystem, mediaDir, dryRun, now: nowDate }
        );
        if (!applied) {
          // Row moved under us; nothing was deleted. Not a failure — replanned next sweep.
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
