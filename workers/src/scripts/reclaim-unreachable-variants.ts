import fs from "fs";
import path from "path";
import { prisma } from "../db.js";
import {
  emptyResult,
  formatResult,
  parseMeta,
  performReclaim,
  type FileSystemLike,
  type MediaUpdater,
  type ReclaimResult,
} from "../helpers/reclaim.js";
import { unreachableVariantPlan } from "../helpers/variant-rules.js";

/**
 * One-time operator script: remove WebP variants that were generated before
 * feature 008 and that no display surface can request.
 *
 * Deliberately NOT a scheduled job. Once upload stops producing the dead
 * variant there is no ongoing source, so a permanent sweep would walk the whole
 * volume forever to find nothing.
 *
 *   npx tsx src/scripts/reclaim-unreachable-variants.ts            # dry run
 *   npx tsx src/scripts/reclaim-unreachable-variants.ts --execute
 *   npx tsx src/scripts/reclaim-unreachable-variants.ts --execute --limit 100
 */

const BATCH = 500;

export interface ScriptDeps {
  db: {
    media: MediaUpdater & {
      findMany(args: unknown): Promise<{ id: string; media_url: string; media_meta: string | null; media_type: string }[]>;
    };
  };
  fileSystem: FileSystemLike;
  mediaDir: string;
  dryRun: boolean;
  limit: number | null;
  now: Date;
}

export async function runVariantReclaim(deps: ScriptDeps): Promise<ReclaimResult> {
  const { db, fileSystem, mediaDir, dryRun, limit, now } = deps;
  const result = emptyResult(dryRun);

  let cursor: string | undefined;
  for (;;) {
    if (limit !== null && result.scanned >= limit) break;

    // Cursor paging keeps worker memory bounded no matter how large the volume
    // is; the candidate set does not shrink during a dry run, so LIMIT alone
    // would loop forever over the same rows.
    const batch = await db.media.findMany({
      where: { media_type: "image" },
      select: { id: true, media_url: true, media_meta: true, media_type: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const m of batch) {
      if (limit !== null && result.scanned >= limit) break;

      const meta = parseMeta(m.media_meta);
      if (!meta) {
        result.failed++;
        console.error(`[variant-reclaim] Unparseable media_meta for ${m.id}`);
        continue;
      }

      // A personal-library GIF is the one kind with no dead variant, and only
      // the file on disk distinguishes a single-frame one from an ordinary
      // still — `media_meta` records `animated:false` for both.
      const hasGifSource = fileSystem.existsSync(path.join(mediaDir, m.media_url, "original.gif"));

      const plan = unreachableVariantPlan(m.media_type, meta, hasGifSource);
      if (!plan) {
        result.skipped++;
        continue;
      }

      result.scanned++;

      try {
        const { bytesFreed, applied } = await performReclaim(
          {
            mediaId: m.id,
            mediaUrl: m.media_url,
            meta,
            metaJson: m.media_meta,
            filesToRemove: plan.remove,
            survivor: plan.survivor,
            markerPatch: { variants: plan.widths },
          },
          { db: db.media, fileSystem, mediaDir, dryRun, now }
        );
        if (!applied) {
          // Another writer touched the row between our read and our write —
          // benign, and not a failure: nothing was deleted.
          result.skipped++;
          continue;
        }
        result.bytesFreed += bytesFreed;
        result.reclaimed++;
      } catch (e) {
        result.failed++;
        console.error(`[variant-reclaim] Failed for media ${m.id}:`, (e as Error).message);
      }
    }
  }

  return result;
}

function parseArgs(argv: string[]) {
  const dryRun = !argv.includes("--execute");
  const i = argv.indexOf("--limit");
  // A bare trailing `--limit` must not silently degrade to "no limit" — on a
  // --execute run that is the difference between 100 files and the whole volume.
  const limit = i >= 0 ? Number(argv[i + 1]) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit requires a positive integer");
  }
  return { dryRun, limit };
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  if (dryRun) {
    console.log("[variant-reclaim] DRY RUN — nothing will be deleted. Pass --execute to reclaim.");
  } else {
    console.log("[variant-reclaim] EXECUTING — files will be permanently deleted.");
  }

  const result = await runVariantReclaim({
    db: prisma as unknown as ScriptDeps["db"],
    fileSystem: fs,
    mediaDir: process.env.MEDIA_PATH || "/media",
    dryRun,
    limit,
    now: new Date(),
  });

  console.log(formatResult("variant-reclaim", result));
  await prisma.$disconnect();
  process.exit(result.failed > 0 ? 1 : 0);
}

// Only run when invoked directly, so tests can import runVariantReclaim freely.
if (process.argv[1]?.endsWith("reclaim-unreachable-variants.ts") ||
    process.argv[1]?.endsWith("reclaim-unreachable-variants.js")) {
  main().catch((e) => {
    console.error("[variant-reclaim] Fatal:", e);
    process.exit(1);
  });
}
