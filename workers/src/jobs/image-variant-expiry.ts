import { Worker } from "bullmq";
import fs from "fs";
import { prisma } from "../db.js";
import { redisConnection } from "../redis.js";
import { libraryMediaIds, type RefDb } from "../helpers/media-refs.js";
import { DAY_MS, IMAGE_RETENTION_DAYS } from "../helpers/retention.js";
import {
  emptyResult,
  formatResult,
  parseMeta,
  performReclaim,
  SurvivorMissingError,
  type FileSystemLike,
  type ReclaimResult,
} from "../helpers/reclaim.js";

/**
 * Age-based expiry of the full-size still-image variant (feature 011 US1).
 *
 * Unlike `media-reclaim`, this sweep REACHES MEDIA BEHIND LIVE CONTENT — that
 * is the point of the fourth reclamation ground added in Constitution v5.0.0.
 * What makes it permissible is that the attachment survives: `960.webp` stays,
 * so a post keeps its picture and loses only the resolution behind an explicit
 * full-size open.
 *
 * Three exemptions are absolute and none of them is an optimisation:
 *   - animated media never loses a file to age (it plays from original.gif);
 *   - personal-library media is exempt on EVERY ground;
 *   - media mid-original-quality-window is left to `original-downgrade`, whose
 *     survivor check reads the very 1600.webp this job would remove.
 */

const MEDIA_DIR = process.env.MEDIA_PATH || "/media";
const BATCH_SIZE = 500;

/**
 * `skipped` is the total; `retained` says why. Without the split a zero-expiry
 * run is indistinguishable from a broken one (FR-020).
 */
export interface ImageVariantExpiryResult extends ReclaimResult {
  retained: {
    /** Younger than the window — only reachable via an injected cutoff. */
    inWindow: number;
    animated: number;
    /** Saved in a personal GIF library — exempt at any age (FR-004a). */
    library: number;
    /** `orig` present and not yet converted; original-downgrade owns it. */
    pendingOriginal: number;
    alreadyExpired: number;
    alreadyReclaimed: number;
    /** 960.webp missing or empty — refuse to remove the last usable copy. */
    noSurvivor: number;
    raced: number;
    unreadableMeta: number;
  };
  strayFiles: number;
  retentionDays: number;
  cutoff: string;
}

/** Single formatting site — worker log, job log and Bull Board agree. */
export function summarize(r: ImageVariantExpiryResult): string {
  const t = r.retained;
  return (
    `${formatResult("image-variant-expiry", r)} ` +
    `retained(inWindow=${t.inWindow} animated=${t.animated} library=${t.library} ` +
    `pendingOriginal=${t.pendingOriginal} already=${t.alreadyExpired + t.alreadyReclaimed} ` +
    `noSurvivor=${t.noSurvivor} raced=${t.raced} unreadable=${t.unreadableMeta}) ` +
    `strays=${r.strayFiles} window=${r.retentionDays}d cutoff=${r.cutoff}`
  );
}

export interface ImageVariantExpiryDeps {
  db: Pick<typeof prisma, "media"> & Pick<RefDb, "userGif">;
  fileSystem: FileSystemLike;
  mediaDir: string;
  /**
   * Injectable so a test can drive a window without faking the clock. NOT a
   * configuration hook — the real value is a constant (FR-015).
   */
  retentionDays: number;
  batchSize: number;
  dryRun: boolean;
  now: number;
}

export async function runImageVariantExpiry(
  deps: Partial<ImageVariantExpiryDeps> = {}
): Promise<ImageVariantExpiryResult> {
  const {
    db = prisma,
    fileSystem = fs,
    mediaDir = MEDIA_DIR,
    retentionDays = IMAGE_RETENTION_DAYS,
    batchSize = BATCH_SIZE,
    dryRun = false,
    now = Date.now(),
  } = deps;

  const cutoff = new Date(now - retentionDays * DAY_MS).toISOString();
  const result: ImageVariantExpiryResult = {
    ...emptyResult(dryRun),
    retained: {
      inWindow: 0,
      animated: 0,
      library: 0,
      pendingOriginal: 0,
      alreadyExpired: 0,
      alreadyReclaimed: 0,
      noSurvivor: 0,
      raced: 0,
      unreadableMeta: 0,
    },
    strayFiles: 0,
    retentionDays,
    cutoff,
  };
  const nowDate = new Date(now);

  let cursor: string | undefined;
  for (;;) {
    const batch = await db.media.findMany({
      where: { media_type: "image", created_at: { lt: cutoff } },
      select: { id: true, media_url: true, media_meta: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    // One query per page, never per item.
    const library = await libraryMediaIds(db, batch.map((m) => m.id));

    for (const m of batch) {
      result.scanned++;

      const meta = parseMeta(m.media_meta);
      if (!meta) {
        result.failed++;
        result.retained.unreadableMeta++;
        console.error(`[image-variant-expiry] Unparseable media_meta for ${m.id}`);
        continue;
      }
      if (meta.reclaimed?.files) {
        result.skipped++;
        result.retained.alreadyReclaimed++;
        continue;
      }
      if (meta.animated) {
        result.skipped++;
        result.retained.animated++;
        continue;
      }
      // Before the animated check would be wrong AND after it is not enough: a
      // single-frame library GIF is stored media_type "image" with
      // animated:false and DOES carry a 1600.webp, so `animated` alone would
      // delete a file §III exempts absolutely.
      if (library.has(m.id)) {
        result.skipped++;
        result.retained.library++;
        continue;
      }
      if (meta.orig && meta.converted !== true) {
        result.skipped++;
        result.retained.pendingOriginal++;
        continue;
      }
      if (meta.reclaimed?.variants?.includes("1600")) {
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
            filesToRemove: ["1600.webp"],
            survivor: "960.webp",
            markerPatch: { variants: ["1600"] },
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
          console.error(`[image-variant-expiry] ${m.id}: could not remove ${strays.join(", ")}`);
        }
      } catch (e) {
        result.failed++;
        // Attributed only when it really was the survivor check: a DB error
        // throws out of performReclaim too, and counting that as a missing file
        // points the operator at the wrong system.
        if (e instanceof SurvivorMissingError) result.retained.noSurvivor++;
        console.error(`[image-variant-expiry] Failed for media ${m.id}:`, (e as Error).message);
      }
    }
  }

  // Unconditional: "it did nothing" must stay distinguishable from "it never ran".
  console.log(summarize(result));
  if (result.strayFiles > 0) {
    console.error(
      `[image-variant-expiry] ${result.strayFiles} file(s) survived removal — is ${mediaDir} writable?`
    );
  }
  return result;
}

export function createImageVariantExpiryWorker(): Worker {
  return new Worker(
    "image-variant-expiry",
    async (job) => {
      const result = await runImageVariantExpiry();
      // Bull Board's Logs and Return Value are separate panels; filling only
      // one leaves an operator staring at a blank tab.
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
