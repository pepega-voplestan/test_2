import { Worker } from "bullmq";
import fs from "fs";
import path from "path";
import { prisma } from "../db.js";
import { redisConnection } from "../redis.js";

const WINDOW_HOURS = Number(process.env.ORIGINAL_QUALITY_WINDOW_HOURS) || 24;
const MEDIA_DIR = process.env.MEDIA_PATH || "/media";

interface MediaMeta {
  orig?: string;
  converted?: boolean;
  uploaded_at?: string;
  orientation?: number;
  [k: string]: unknown;
}

export interface DowngradeResult {
  scanned: number;
  converted: number;
  skipped: number;
  failed: number;
}

// Injectable dependencies — real ones by default, fakes in tests (no DB/Redis needed).
export interface DowngradeDeps {
  db: Pick<typeof prisma, "media" | "shoutMedia" | "commentMedia">;
  fileSystem: Pick<typeof fs, "existsSync" | "statSync" | "writeFileSync" | "unlinkSync">;
  mediaDir: string;
  windowHours: number;
  now: number;
}

/**
 * One sweep of the original-quality downgrade.
 *
 * The compressed WebP variants (320/960/1600) are already generated at upload
 * time, so "downgrading" an original-quality image is simply: stop serving the
 * lossless original and reclaim its storage. We therefore need no image
 * processing here — just flip the DB flag (readers switch to the WebP via
 * buildMedia) and unlink the original file.
 *
 * Safety (FR-009 / SC-005): the original is never unlinked unless the 1600.webp
 * is confirmed present, and the DB flag is flipped BEFORE the unlink so a crash
 * between the two can only leave a harmless stray file (skipped next run), never
 * a missing image.
 */
export async function runOriginalDowngrade(deps: Partial<DowngradeDeps> = {}): Promise<DowngradeResult> {
  const {
    db = prisma,
    fileSystem = fs,
    mediaDir = MEDIA_DIR,
    windowHours = WINDOW_HOURS,
    now = Date.now(),
  } = deps;

  const windowMs = windowHours * 60 * 60 * 1000;
  // Full ISO-8601 (RFC3339) cutoff: valid whether the generated Prisma client
  // types created_at as String (SQLite-era) or DateTime (which validates ISO and
  // rejects a space-separated "YYYY-MM-DD HH:MM:SS"); Postgres casts it to the
  // timestamp column either way.
  const cutoff = new Date(now - windowMs).toISOString();

  // Coarse DB prefilter: only image media old enough to possibly be due.
  const candidates = await db.media.findMany({
    where: { media_type: "image", created_at: { lt: cutoff } },
    select: { id: true, media_url: true, media_meta: true },
  });

  const result: DowngradeResult = { scanned: 0, converted: 0, skipped: 0, failed: 0 };

  for (const m of candidates) {
    let meta: MediaMeta;
    try {
      meta = JSON.parse(m.media_meta || "{}") as MediaMeta;
    } catch {
      continue;
    }
    // Only unconverted originals are eligible.
    if (!meta.orig || meta.converted === true) continue;
    // Precise deadline check against the recorded upload time.
    const uploadedAt = meta.uploaded_at ? Date.parse(meta.uploaded_at) : NaN;
    if (!Number.isNaN(uploadedAt) && now - uploadedAt < windowMs) continue;

    result.scanned++;

    // FR-008: if the owning shout/comment was removed before the deadline, cancel
    // the pending conversion — but still finalize the asset (mark converted + reclaim
    // the original) so it reaches a terminal state and isn't re-scanned every sweep.
    //
    // shout_media/comment_media is the only place a post's attached media is
    // recorded (feature 006) — a single video/YouTube attachment is a one-row
    // list there just like a five-photo gallery, so checking these two tables
    // covers every attachment shape; there is no separate column to also check.
    const [liveShoutGallery, liveCommentGallery] = await Promise.all([
      db.shoutMedia.findFirst({
        where: { media_id: m.id, shout: { is_deleted: 0 } },
        select: { shout_id: true },
      }),
      db.commentMedia.findFirst({
        where: { media_id: m.id, comment: { is_deleted: 0 } },
        select: { comment_id: true },
      }),
    ]);
    const orphaned = !liveShoutGallery && !liveCommentGallery;

    try {
      const dir = path.join(mediaDir, m.media_url);
      const webpPath = path.join(dir, "1600.webp");
      // Never reclaim the original unless the compressed WebP is confirmed.
      if (!fileSystem.existsSync(webpPath) || fileSystem.statSync(webpPath).size === 0) {
        throw new Error(`1600.webp missing or empty for media ${m.id}`);
      }

      const origName = meta.orig;
      delete meta.orig;
      delete meta.orientation;
      meta.converted = true;
      const newMetaJson = JSON.stringify(meta);

      // Flip state first — readers now resolve `full` to the WebP variant.
      //
      // Conditional on the row being untouched since the read: the 008 reclaim
      // script rewrites this same column from a separate process, and a blind
      // write in either direction is a lost update. Losing this one would drop
      // that script's `reclaimed` marker; losing the other would restore an
      // `orig` key for a file this sweep is about to unlink. A row that moved
      // under us is left entirely alone and retried next sweep.
      const { count } = await db.media.updateMany({
        where: { id: m.id, media_meta: m.media_meta },
        data: { media_meta: newMetaJson },
      });
      if (count === 0) {
        result.skipped++;
        continue;
      }
      try {
        fileSystem.writeFileSync(path.join(dir, "meta.json"), newMetaJson);
      } catch {
        /* on-disk mirror is best-effort */
      }
      // Reclaim the original's storage (FR-007).
      try {
        fileSystem.unlinkSync(path.join(dir, origName));
      } catch {
        /* already gone — still converted */
      }

      if (orphaned) result.skipped++;
      else result.converted++;
    } catch (e) {
      result.failed++;
      // Leave converted=false and the original intact; the next sweep retries (FR-009).
      console.error(`[original-downgrade] Failed for media ${m.id}:`, (e as Error).message);
    }
  }

  if (result.scanned > 0) {
    console.log(
      `[original-downgrade] scanned=${result.scanned} converted=${result.converted} skipped=${result.skipped} failed=${result.failed}`
    );
  }
  return result;
}

export function createOriginalDowngradeWorker(): Worker {
  return new Worker(
    "original-downgrade",
    async () => {
      await runOriginalDowngrade();
    },
    { connection: redisConnection }
  );
}
