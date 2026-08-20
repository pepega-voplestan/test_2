/**
 * Preview either retention sweep without changing anything (feature 011 FR-021).
 *
 * Usage, from the workers container or the workers/ directory:
 *   npm run preview:expiry            # both sweeps
 *   npm run preview:expiry -- image   # just the image sweep
 *   npm run preview:expiry -- video   # just the video sweep
 *
 * `dryRun` is hardcoded, not a flag. This entry point exists so an operator can
 * size the first backlog run — by far the highest-risk run either sweep will
 * ever do — without editing code, and a flag that could turn it destructive
 * would defeat that. To run for real, trigger the job from Bull Board.
 *
 * The windows are the real constants: a preview that used a different window
 * would size a run nobody is going to perform.
 */
import { runImageVariantExpiry } from "../jobs/image-variant-expiry.js";
import { runVideoExpiry } from "../jobs/video-expiry.js";
import { prisma } from "../db.js";

const WHICH = new Set(process.argv.slice(2).filter((a) => !a.startsWith("-")));
const wants = (name: string) => WHICH.size === 0 || WHICH.has(name);

async function main() {
  if (!wants("image") && !wants("video")) {
    console.error("Usage: npm run preview:expiry -- [image|video]");
    process.exitCode = 1;
    return;
  }
  // Each run logs its own summarize() line, including the retained breakdown.
  if (wants("image")) await runImageVariantExpiry({ dryRun: true });
  if (wants("video")) await runVideoExpiry({ dryRun: true });
}

main()
  .catch((e) => {
    console.error("[preview-expiry] Failed:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
