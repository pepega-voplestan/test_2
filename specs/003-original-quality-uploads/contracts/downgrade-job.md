# Contract: `original-downgrade` worker sweep

New background job in `workers/`, following the `notification-cleanup` pattern
(`queues.ts` + `scheduler.ts` + `jobs/*.ts` + `index.ts`).

## Registration

- **Queue**: `originalDowngradeQueue = new Queue("original-downgrade", { connection,
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50, attempts: 3, backoff: {
  type: "exponential", delay: 30000 } } })` in `queues.ts`.
- **Schedule**: `upsertJobScheduler("original-downgrade-sweep", { pattern: "*/5 * * * *" },
  { name: "run", data: {} })` in `scheduler.ts` (every 5 minutes; upsert = safe on every
  startup).
- **Worker**: `createOriginalDowngradeWorker()` started in `index.ts` and added to the
  Bull Board adapters list.

## Input

No per-invocation input. The sweep derives its work set from the database each run.

## Selection query (per run)

Select `media` where:
- `media_type = "image"`, AND
- `media_meta` marks an unconverted original: `orig` present AND `converted !== true`, AND
- `uploaded_at < now − ORIGINAL_QUALITY_WINDOW_HOURS` (env, default 24), AND
- the row is still referenced by at least one **non-soft-deleted** shout or comment.

Rows whose owning content is soft-deleted (`is_deleted` set) are **skipped** (FR-008); no
error, no conversion, no orphaned work. (The original file for deleted content is reclaimed
by normal media/content cleanup, out of scope here.)

## Per-asset processing (must be crash-safe)

1. Re-read the row; re-confirm still-pending and past deadline (guards concurrent runs).
2. Ensure `1600.webp` exists (it should from upload). If missing, regenerate it from the
   original via the standard `sharp(...).webp({ quality: 82 })` pipeline into a temp file,
   then rename into place.
3. Confirm `1600.webp` is present and non-empty on disk.
4. Update `media_meta`: set `converted = true`, remove the `orig` key. Persist via Prisma
   (and mirror to `meta.json`).
5. **Only after** step 4 succeeds, `unlink` the original file (`original.<ext>`) to reclaim
   storage (FR-007).

## Guarantees

- **Never loses an image (FR-009, SC-005)**: the original is deleted only after the WebP
  is confirmed and the DB flag is flipped. Any failure before step 4 leaves the asset
  PENDING with the original intact; the next sweep retries.
- **Idempotent**: re-running on an already-converted row is a no-op (fails the `orig`
  present / `converted !== true` filter).
- **Restart-safe**: no in-memory state; a restart resumes on the next 5-minute tick.
- **Cancellable**: implicit — deleted content is filtered out.

## Output / observability

- Log per run: number scanned, converted, skipped-deleted, failed (mirrors
  `notification-cleanup` logging style).
- Visible in Bull Board under the `original-downgrade` queue.

## Timing (SC-002)

A 5-minute cadence means an eligible image is converted within ≤5 min of its deadline in
the common case, comfortably inside the 15-minute target for ≥99% of images.
