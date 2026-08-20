import { Worker } from "bullmq";
import fs from "fs";
import { prisma } from "../db.js";
import { redisConnection } from "../redis.js";
import { DAY_MS, VIDEO_RETENTION_DAYS } from "../helpers/retention.js";
import {
  emptyResult,
  formatResult,
  parseMeta,
  performReclaim,
  type FileSystemLike,
  type ReclaimResult,
} from "../helpers/reclaim.js";

/**
 * Age-based expiry of uploaded video files (feature 011 US2).
 *
 * The hardest of the two sweeps to justify and the easiest to implement: video
 * is the heaviest class on the volume and, unlike an image, NOTHING survives.
 * There is no reduced copy to fall back to, so `survivor` is null by design and
 * the loss is made visible instead — `buildMedia` marks the media expired and
 * the card renders a Russian tombstone (FR-013), while nginx answers stale
 * cached addresses with a `no-store` placeholder (FR-011/FR-012).
 *
 * Reaches live content. That is the deliberate consequence of the fourth
 * reclamation ground and is permanent: there is no restoration path.
 */

const MEDIA_DIR = process.env.MEDIA_PATH || "/media";
const BATCH_SIZE = 500;

export interface VideoExpiryResult extends ReclaimResult {
  retained: {
    /** Younger than the window — only reachable via an injected cutoff. */
    inWindow: number;
    alreadyExpired: number;
    alreadyReclaimed: number;
    raced: number;
    unreadableMeta: number;
  };
  strayFiles: number;
  retentionDays: number;
  cutoff: string;
}

/**
 * Deliberately narrower than the image sweep's breakdown: there is no
 * `animated`, `library`, `pendingOriginal` or `noSurvivor` reason here, because
 * nothing is meant to survive an expired video.
 */
export function summarize(r: VideoExpiryResult): string {
  const t = r.retained;
  return (
    `${formatResult("video-expiry", r)} ` +
    `retained(inWindow=${t.inWindow} alreadyExpired=${t.alreadyExpired} ` +
    `alreadyReclaimed=${t.alreadyReclaimed} raced=${t.raced} unreadable=${t.unreadableMeta}) ` +
    `strays=${r.strayFiles} window=${r.retentionDays}d cutoff=${r.cutoff}`
  );
}

export interface VideoExpiryDeps {
  db: Pick<typeof prisma, "media">;
  fileSystem: FileSystemLike;
  mediaDir: string;
  /** Injectable for tests. NOT a configuration hook — see helpers/retention.ts. */
  retentionDays: number;
  batchSize: number;
  dryRun: boolean;
  now: number;
}

export async function runVideoExpiry(deps: Partial<VideoExpiryDeps> = {}): Promise<VideoExpiryResult> {
  const {
    db = prisma,
    fileSystem = fs,
    mediaDir = MEDIA_DIR,
    retentionDays = VIDEO_RETENTION_DAYS,
    batchSize = BATCH_SIZE,
    dryRun = false,
    now = Date.now(),
  } = deps;

  const cutoff = new Date(now - retentionDays * DAY_MS).toISOString();
  const result: VideoExpiryResult = {
    ...emptyResult(dryRun),
    retained: { inWindow: 0, alreadyExpired: 0, alreadyReclaimed: 0, raced: 0, unreadableMeta: 0 },
    strayFiles: 0,
    retentionDays,
    cutoff,
  };
  const nowDate = new Date(now);

  let cursor: string | undefined;
  for (;;) {
    const batch = await db.media.findMany({
      where: { media_type: "video", created_at: { lt: cutoff } },
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
        result.retained.unreadableMeta++;
        console.error(`[video-expiry] Unparseable media_meta for ${m.id}`);
        continue;
      }
      if (meta.reclaimed?.files) {
        result.skipped++;
        result.retained.alreadyReclaimed++;
        continue;
      }
      if (meta.reclaimed?.video) {
        result.skipped++;
        result.retained.alreadyExpired++;
        continue;
      }

      try {
        const { bytesFreed, applied, strays } = await performReclaim(
          {
            mediaId: m.id,
            mediaUrl: m.media_url,
            meta,
            metaJson: m.media_meta,
            filesToRemove: ["original.mp4"],
            survivor: null,
            markerPatch: { video: true },
          },
          { db: db.media, fileSystem, mediaDir, dryRun, now: nowDate }
        );
        if (!applied) {
          result.skipped++;
          result.retained.raced++;
          continue;
        }
        result.bytesFreed += bytesFreed;
        result.reclaimed++;
        if (strays.length > 0) {
          result.strayFiles += strays.length;
          console.error(`[video-expiry] ${m.id}: could not remove ${strays.join(", ")}`);
        }
      } catch (e) {
        result.failed++;
        console.error(`[video-expiry] Failed for media ${m.id}:`, (e as Error).message);
      }
    }
  }

  console.log(summarize(result));
  if (result.strayFiles > 0) {
    console.error(`[video-expiry] ${result.strayFiles} file(s) survived removal — is ${mediaDir} writable?`);
  }
  return result;
}

export function createVideoExpiryWorker(): Worker {
  return new Worker(
    "video-expiry",
    async (job) => {
      const result = await runVideoExpiry();
      await job.log(summarize(result));
      if (result.strayFiles > 0) {
        await job.log(
          `WARNING: ${result.strayFiles} file(s) survived removal — is the media volume writable?`
        );
      }
      return result;
    },
    { connection: redisConnection }
  );
}
