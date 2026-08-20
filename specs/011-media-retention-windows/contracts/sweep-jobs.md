# Contract: Sweep Jobs

**Surface**: two BullMQ queues, each with a Bull Board panel and a manual-trigger path. Operators are the consumers (US3).

Both follow `runMediaReclaim`'s established shape: every dependency injectable with a real default, so unit tests need neither a database nor Redis (constitution VI — a seam that already exists, not one added for tests).

---

## `image-variant-expiry`

```ts
export interface ImageVariantExpiryDeps {
  db: Pick<typeof prisma, "media">;
  fileSystem: FileSystemLike;
  mediaDir: string;
  retentionDays: number;
  batchSize: number;
  dryRun: boolean;
  now: number;
}

export async function runImageVariantExpiry(
  deps?: Partial<ImageVariantExpiryDeps>
): Promise<ImageVariantExpiryResult>;
```

`retentionDays` defaults to the `IMAGE_RETENTION_DAYS` constant; it stays injectable so tests can drive a window without touching the clock, not because it is configurable.

**Candidate query**: `media_type: "image"`, `created_at < now - retentionDays`, cursor-paged by `id`, `take: batchSize`.

**Per item, in order** — first match wins, each incrementing its own `retained` counter:

1. `media_meta` unparseable → `failed`, `unreadableMeta`
2. `reclaimed.files` → `alreadyReclaimed`
3. `meta.animated` → `animated`
4. id present in the batch's library set → `library` *(FR-004a)*
5. `meta.orig && meta.converted !== true` → `pendingOriginal` *(research R2)*
6. `reclaimed.variants` includes `"1600"` → `alreadyExpired`
7. otherwise → `performReclaim({ filesToRemove: ["1600.webp"], survivor: "960.webp", markerPatch: { variants: ["1600"] } })`

Step 4's library set is fetched **once per batch** via `libraryMediaIds(db, batchIds)` from `workers/src/helpers/media-refs.ts`, never per item. It must not use `hasLiveReference` or `hasAnyReference`: both also match `shout_media`/`comment_media`, which would skip every image attached to a live post and reduce the sweep to a no-op that still reports success.

A thrown survivor check counts as `failed` + `noSurvivor`, leaving the item for a later run.

## `video-expiry`

```ts
export async function runVideoExpiry(
  deps?: Partial<VideoExpiryDeps>
): Promise<VideoExpiryResult>;
```

**Candidate query**: `media_type: "video"`, `created_at < now - retentionDays`, cursor-paged.

**Per item**: unparseable → `failed`; `reclaimed.files` → `alreadyReclaimed`; `reclaimed.video` → `alreadyExpired`; otherwise `performReclaim({ filesToRemove: ["original.mp4"], survivor: null, markerPatch: { video: true } })`.

`survivor: null` is correct and deliberate — unlike an image, nothing is meant to survive; the tombstone is generated, not stored.

---

## Window source (FR-015, FR-015a)

Both jobs import their window from `retention.ts` as a constant — `IMAGE_RETENTION_DAYS = 7`, `VIDEO_RETENTION_DAYS = 30`. There is no resolution step, no parsing, and no environment read, so there is no startup validation to perform: FR-015a's fail-closed guarantee holds because a bad window cannot reach runtime.

This is the one place the codebase must *not* follow the `Number(env) || DEFAULT` convention (research R7). Under that convention `Number("-1") || 7` yields `-1`, the age cutoff lands in the future, and every file including same-day uploads becomes eligible for irreversible removal. Making these windows environment-driven later requires a strict fail-closed resolver to come with them.

## Idempotence & crash safety

- Re-running a completed sweep: every candidate hits `alreadyExpired`; `reclaimed` and `bytesFreed` are zero (FR-017, SC-006).
- Interruption: the marker is persisted before the unlink, so the worst outcome is a stray file, skipped as `alreadyExpired` next run (FR-018, SC-008).
- Concurrency: the CAS on `media_meta` means a run overlapping `original-downgrade` or `media-reclaim` yields rather than clobbers, counting `raced`.

## Reporting (FR-020)

One `summarize()` per job, formatted through the shared `formatResult`, written to **both** the console and `job.log` — Bull Board's Logs tab and Return Value tab are separate panels, and discarding either leaves an operator staring at a blank one. Logged unconditionally, including zero-expiry runs, so "it did nothing" stays distinguishable from "it never ran".

```
[image-variant-expiry] scanned=1204 reclaimed=1179 skipped=25 failed=0 freed=812.4MB
  retained(inWindow=12 animated=6 library=1 pendingOriginal=2 already=3 noSurvivor=1 raced=0 unreadable=0)
  window=7d cutoff=2026-08-12T04:00:00.000Z

[video-expiry] scanned=88 reclaimed=81 skipped=7 failed=0 freed=6.2GB
  retained(inWindow=0 alreadyExpired=5 alreadyReclaimed=2 raced=0 unreadable=0)
  window=30d cutoff=2026-07-21T04:30:00.000Z
```

The two breakdowns differ in width because the skip sets differ: video has no `animated`, `library`, `pendingOriginal`, or `noSurvivor` reason — nothing is meant to survive an expired video, so there is no survivor to check.

## Preview mode (FR-021)

`dryRun: true` threads into `performReclaim`, which sizes the doomed files and returns before any write. Reports identical counts and `bytesFreed`; changes nothing on disk or in the database. Exposed via the manual-trigger path.

## Schedule

| Queue | Cron | Why |
|---|---|---|
| `image-variant-expiry` | `0 4 * * *` | After the 02:00 db-backup, clear of the 03:00 `media-reclaim` |
| `video-expiry` | `30 4 * * *` | Staggered so the two never contend for the volume |

Registered via `upsertJobScheduler` in `scheduler.ts` — safe to re-run on every startup.
