# Infrastructure Reference

## Docker Services

7 services per environment. Prod: nginx on 80/443. Local dev: port 3006. Dev volumes isolated (`-dev` suffix on all volume names).

| Service | Description |
|---------|-------------|
| `postgres` | PostgreSQL 16 Alpine; data in named volume; healthcheck gates api + worker startup |
| `api` | Express backend (internal port 3000); runs `prisma migrate deploy` on startup |
| `media` | Hardened Nginx: WebP/JPG/JPEG/PNG/GIF/MP4 only, no dotfiles, immutable 1yr cache. Also mounts `./media-assets` read-only at `/assets` for the expired-video placeholder |
| `nginx` | Reverse proxy: `/api/*`→api, `/media/*`→media, `/admin`+`/workers` with HTTP basic auth, SPA fallback. SSE: buffering off, 24h timeout. Prod blocks `/api/docs`. |
| `web-build` | One-shot React build → `webdist` shared volume |
| `redis` | Redis 7 Alpine; snapshot every 60s if ≥1 key changed; also used for sessions |
| `worker` | BullMQ jobs + Bull Board on port 3001; dev uses `tsx watch` |

**Four compose files:**
- `docker-compose.yml` — production (nginx ports 80/443)
- `docker-compose.dev.yml` — dev droplet (pre-built GHCR images, managed by CI)
- `docker-compose.local.yml` — local dev (hot-reload, bind mounts, port 3006, isolated volumes)
- `docker-compose.test.yml` — single `api-test` service, requires external PostgreSQL test DB, exits with vitest coverage code

## Background Jobs (Workers)

TypeScript + BullMQ + Redis. Separate Docker container, connects to same PostgreSQL + Redis as API. Bull Board dashboard at `/workers` (nginx-proxied, HTTP basic auth).

```
workers/src/
├── index.ts        # Starts workers, scheduler, Bull Board on port 3001
├── db.ts, redis.ts, queues.ts, scheduler.ts
├── helpers/        # reclaim.ts (shared removal mechanism), media-refs.ts, retention.ts
├── scripts/
│   └── preview-expiry.ts   # dry-run entry point for both retention sweeps
└── jobs/
    ├── notification-cleanup.ts
    ├── db-backup.ts
    ├── original-downgrade.ts
    ├── media-reclaim.ts
    ├── image-variant-expiry.ts
    └── video-expiry.ts
```

| Job | Schedule | Action |
|-----|----------|--------|
| `notification-cleanup` | 00:00 UTC daily | Hard-delete notifications older than 14 days |
| `db-backup` | 02:00 UTC daily | PostgreSQL dump backup, keep last 7 |
| `original-downgrade` | hourly, on the hour | Downgrade original-quality JPG/PNG past their 24h window |
| `media-reclaim` | 03:00 UTC daily | Reclaim files for media no display surface can reach (currently: never-published uploads past `MEDIA_UNPUBLISHED_GRACE_DAYS`) |
| `image-variant-expiry` | 04:00 UTC daily | Remove `1600.webp` for still images older than 7 days |
| `video-expiry` | 04:30 UTC daily | Remove `original.mp4` older than 30 days |

### Original-quality downgrade sweep

`original-downgrade` finds `media` rows (`media_type=image`) whose `media_meta.orig` is set and `converted !== true`, and whose `uploaded_at` is older than `ORIGINAL_QUALITY_WINDOW_HOURS` (24h). For each, it flips `media_meta.converted=true`, removes the `orig` key, and `unlink`s the `original.<ext>` file to reclaim storage — the 320/960/1600 WebP variants already exist from upload, so **no image processing (no Sharp) runs in the worker**. The DB flag is flipped before the unlink, so a crash can only leave a harmless stray file (skipped next run), never a missing image; the original is never removed unless `1600.webp` is confirmed present. State lives in Postgres, so the sweep is restart-safe.

Soft-deleted owners do **not** exempt an item from the sweep. The job checks whether a live (`is_deleted=0`) shout or comment still references the media, but that check only decides which counter the result lands in (`skipped` vs `converted`) — an orphaned item is still finalized: flag flipped, original unlinked. This is deliberate, so every asset reaches a terminal state instead of being rescanned every hour forever. The WebP variants and all DB rows are left in place either way; reclaiming those is the subject of `specs/008-reclaim-unused-media/`.

### Media reclaim sweep

`media-reclaim` removes **files only** — no row is ever deleted, because the tombstone render for a soft-deleted shout that still carries live comments depends on the `media` and join rows surviving. It runs at 03:00 UTC, after `db-backup` at 02:00, so a day's snapshot always predates that day's deletions.

A media item is reclaimable only when nothing references it. The reference check (`workers/src/helpers/media-refs.ts`) consults **three** tables, and the third is the one that bites: `user_gifs` holds a user's personal GIF library, whose entries are deliberately attached to no post — a check consulting only `shout_media`/`comment_media` classifies every saved library as orphaned and deletes it. `is_deleted=2` (ban-removed) content *protects* its media rather than being filtered out afterwards, so the fail-safe direction is retention: a missed protection retains data, a missed filter destroys it. Unbanning therefore still restores an account's content complete.

Two classes are swept, each with its own grace period (both default 7 days):

| Class | Condition | Grace |
|---|---|---|
| Never published | no reference of any kind | `MEDIA_UNPUBLISHED_GRACE_DAYS` |
| Behind deleted content | references exist, none to live or ban-removed content | `MEDIA_DELETED_GRACE_DAYS` |

Media shared by one deleted and one live post is retained — a single live reference protects it. The DB prefilter uses whichever of the two cutoffs is more permissive, then the exact per-class cutoff is applied in memory, so the shorter window cannot silently cap the longer one.

**The deleted-content clock runs from content CREATION, not deletion**, and this is the most surprising behaviour in the feature. Nothing in the schema records when a delete happened: `is_deleted` is a bare `Int` with no timestamp. Adding `deleted_at` was considered and rejected in favour of shipping without a migration ([spec D3](../specs/008-reclaim-unused-media/spec.md)). The consequence: deleting a post that is ALREADY older than the grace period makes its media reclaimable on the next sweep, with no window in which restore is media-complete. Restore is media-complete only for recently **created** content — which is weaker than Constitution v5.0.0 §III's "within the grace period, administrator restore MUST be fully faithful, including all media". Fixing it means adding the column; the job would then read it instead of `created_at` and need no other change.

Candidates are paged with `take`/`cursor` (500 per batch). Unlike the downgrade sweep this candidate set does not self-empty — protected media stays a candidate forever, and a dry run marks nothing — so an unbounded `findMany` would grow with the volume. `media_meta.reclaimed.files=true` is written **before** any `unlink`, so an interruption can only leave a harmless stray file, never a record pointing at a file that is gone. That write is a compare-and-set on the whole `media_meta` blob, because `original-downgrade` rewrites the same column hourly from another process; a row that moved under us is left entirely alone and retried next sweep. `meta.json` is deliberately left on disk as a tombstone, so a reclaimed directory reads as intentional rather than as an unexplained empty one. `runMediaReclaim({ dryRun: true })` performs every read and reports `bytesFreed` without deleting anything.

Avatars are unaffected: they carry no `media` row and live on a separate volume (`AVATAR_PATH`, default `/data/avatars`).

Reclaimed media disappears from API payloads rather than 404ing: `buildMedia` returns `undefined` once `media_meta.reclaimed.files` is true, and `buildGallery` filters it out and collapses to the single-media shape below two survivors. A restored post therefore comes back text-only.

**Reporting.** Each run writes the same summary to three places — the worker log, `job.log` (Bull Board's *Logs* tab), and the processor's return value (Bull Board's *Return Value* tab):

```
[media-reclaim] scanned=847 reclaimed=81 skipped=766 failed=0 freed=11.6MB
  by-class(unpublished=12 deleted=69) retained(live=700 inGrace=66 already=0 raced=0 unreadable=0)
  strays=0 grace(unpublished=7 deleted=7) cutoff=2026-08-06T…
```

It logs unconditionally, so "did nothing" is distinguishable from "never ran". `by-class` attributes the saving per waste class. `retained` says why each candidate survived — `inGrace` is not yet old enough, `raced` lost the compare-and-set. `bytesFreed` counts only files actually removed; **`strays` > 0 means files survived the unlink**, which in practice means the media volume is not writable, and the job says so explicitly.

### Age-based retention sweeps

Two sweeps reclaim files purely because they are old, and they differ from every other sweep in one respect: **they reach media behind live, undeleted content**. That is the fourth reclamation ground added in Constitution v5.0.0 §III. What makes it permissible is that the attachment survives and the loss is visible.

| Sweep | Removes | Window | Survivor |
|---|---|---|---|
| `image-variant-expiry` | `1600.webp` | 7 days | `960.webp` — the post keeps its picture, losing only full-size resolution |
| `video-expiry` | `original.mp4` | 30 days | none — nothing survives, so the loss is shown as a tombstone instead |

**Both windows are hardcoded constants, not environment variables**, in `workers/src/helpers/retention.ts`:

```ts
export const IMAGE_RETENTION_DAYS = 7;
export const VIDEO_RETENTION_DAYS = 30;
```

This is deliberate, and Constitution v5.1.0 §III permits it: a declared file class must have its window "declared in exactly one place", which a compile-time constant satisfies, and it may be a source constant or per-environment config. The constant is the safer form here, because it also satisfies the fail-closed limit structurally — there is no value to be absent or unparseable, a non-number is a type error, and a zero or negative window is visible in the diff.

**Do not make these environment-driven without a strict throwing resolver.** The `Number(env) || DEFAULT` convention used by the grace windows above is prohibited for retention windows: `Number("-1") || 7` evaluates to `-1`, which places the age cutoff in the *future* and makes every file — including media uploaded that day — eligible for irreversible removal. Changing a window today is a source edit plus a rebuild.

**Exemptions.** Neither sweep touches:

| Exempt | Enforced by |
|---|---|
| Animated media | `media_meta.animated` — it plays from `original.gif`, which never expires |
| Personal-library media | `libraryMediaIds()` in `workers/src/helpers/media-refs.ts` |
| Ban-removed content (`is_deleted=2`) | untouched; unbanning restores wholesale |
| Avatars | carry no `media` row and live on a separate volume |

The personal-library guard is the subtle one and it has **two** ways to go wrong. Omit it and the sweep deletes library files that §III exempts absolutely: a single-frame GIF is stored `media_type: "image"` with `animated: false`, and `gifs.js` writes it all three variants, so a guard resting on `meta.animated` alone will happily delete a `1600.webp` the lightbox still reads. But implementing it with `hasLiveReference`/`hasAnyReference` is just as wrong in the opposite direction — both also match `shout_media`/`comment_media`, and media on live posts is this sweep's entire target population, so either would skip every candidate and reduce the sweep to a no-op that still reports success. `libraryMediaIds` queries `user_gifs` alone, batch-shaped (one query per page), with no `is_deleted` filter.

**Composition with `original-downgrade` — the silent-wedge trap.** Image expiry must skip media whose `meta.orig` is set and `converted !== true`, counting it `pendingOriginal`. `original-downgrade` refuses to unlink an original unless `1600.webp` is confirmed present; expire that variant first and its check throws *forever*. Nothing breaks visibly — the original is simply never reclaimed, the hourly job logs a failure for that media on every run, and net storage goes **up**, because the sweep freed ~90 KB and stranded a multi-megabyte original.

**Expired media in API payloads.** `buildMedia` omits `full` entirely for an expired image — it must never substitute `url`, which would present the display copy as though it were the full one (§III "Advertised state"). For an expired video it returns `{ type: "video", expired: true, width, height }` with **no `url` and no `thumb`**, and `ShoutCard` renders a Russian tombstone (`Срок хранения видео истёк`) in place of the player — no play control, no imagery, no disabled chrome that could read as "still loading".

**Stale cached addresses.** Pages are cached for a year under `immutable`, so a browser can hold an address for a file a sweep has since removed. Images degrade to `960.webp` via the existing WebP rule. Video is answered by `media-assets/_deleted.mp4` (8.6 KB, silent, same Russian wording), committed to the repo and bind-mounted at `/assets`. In `media-nginx.conf` this needs **two** things to be right:

- `.mp4` has its **own** location. On the shared `(webp|jpg|jpeg|png|gif|mp4)` location the fallback would answer a stale `original.gif` with an MP4 body under an image URL, and `nosniff` guarantees the browser cannot recover.
- The placeholder is served from an **exact-match** `location = /_deleted.mp4` carrying `root /assets` and `Cache-Control: no-store`. `try_files` performs an internal redirect that re-runs location matching, so a regex match would re-apply `immutable` and let a client cache the placeholder under a real video's address for a year.

The asset lives outside the media volume on purpose: that volume holds only user uploads, has no build context and is mounted `:ro` on the media service, so a file "shipped at the volume root" has no mechanism to arrive — and a `make restore` of the volume must not be able to remove it.

**Preview before the first run.** The initial backlog run is by far the highest-risk run either sweep will ever perform. Preview it without changing anything:

```sh
cd workers && npm run preview:expiry            # both sweeps
cd workers && npm run preview:expiry -- image   # one class
```

`dryRun` is hardcoded in that entry point, not a flag — it sizes the run and reports `bytesFreed` while touching nothing. To run for real, trigger the job from Bull Board.

**Reporting.** Same three destinations as `media-reclaim`, logged unconditionally so "did nothing" stays distinguishable from "never ran":

```
[image-variant-expiry] scanned=1204 reclaimed=1179 skipped=25 failed=0 freed=812.4MB
  retained(inWindow=12 animated=6 library=1 pendingOriginal=2 already=3
  noSurvivor=1 raced=0 unreadable=0) strays=0 window=7d cutoff=2026-08-13T…

[video-expiry] scanned=88 reclaimed=81 skipped=7 failed=0 freed=6.2GB
  retained(inWindow=0 alreadyExpired=5 alreadyReclaimed=2 raced=0 unreadable=0)
  strays=0 window=30d cutoff=2026-07-21T…
```

The video breakdown is deliberately narrower: there is no `animated`, `library`, `pendingOriginal` or `noSurvivor` reason, because nothing is meant to survive an expired video. `noSurvivor` on the image sweep means `960.webp` was missing or empty and the removal was refused — it is attributed only to the survivor check, never to an unrelated database error.

There is **no restoration path** for a file reclaimed on this ground.

### Which variants are reachable

> **Removed tooling**: a one-time operator script (`workers/src/scripts/reclaim-unreachable-variants.ts`) once handled the backlog of unreachable variants generated before feature 008. It was **deleted in `6613456`**, together with its test, when the recurring `media-reclaim` job superseded it. Earlier revisions of this file documented it at `./scripts/reclaim-unreachable-variants.sh` with `--execute`/`--limit`/`--dev` flags; no such file has ever existed at that path. A stale compiled copy may linger in the gitignored `workers/dist/scripts/` — it is a build artifact, not a supported entry point. The table below is retained because the reachability rule it records still governs `media-reclaim` and any future sweep.

Which variant is dead flips with the media kind, and **inverting the rule deletes images that are still on screen**:

| Kind | Dead variant | Why the others stay |
|---|---|---|
| Still image (no `original.gif`) | `320.webp`, then `1600.webp` at 7 days | nothing reads the DTO's `thumb`; the lightbox reads `1600` while it exists, then falls back to `960` |
| Animated GIF | `1600.webp` | it plays from `original.gif`; the library picker grid reads `320` |
| Single-frame library GIF | *none*, at any age | the picker reads its `320`, and `buildMedia` serves it as a still so the lightbox reads its `1600`; library media is exempt from age-based expiry |

`960.webp` is reachable for every kind, is never removed, and must be present and non-empty before anything else is deleted — the nginx fallback in `media-nginx.conf` degrades a missing variant to it instead of 404ing, which is what keeps already-cached pages from breaking.

The script **reads** the database and never writes it, so it cannot lose an update against `original-downgrade`. Its idempotency comes from the disk instead: a variant already gone is not a candidate on the next run. Deliberately not a scheduled job — uploads no longer produce the dead variant, so a permanent sweep would walk the whole volume forever to find nothing.

Jobs registered idempotently via `upsertJobScheduler` (safe on restart). Dev container uses `tsx watch` with source mount for hot-reload.

## Backup & Restore

```sh
./scripts/backup.sh prod                     # timestamped tarballs in ./backups/
./scripts/backup.sh prod --upload             # + rclone to Google Drive
./scripts/backup.sh prod --no-media           # skip the media archive (database/session data only)
./scripts/restore.sh prod                     # latest (prompts for confirmation, stops containers)
./scripts/restore.sh prod TIMESTAMP
```

Keeps last 3 snapshots per type (configurable via `KEEP` in script), rotated locally, on the DO volume, and on the rclone remote. `--no-media` is fully independent of `--upload` and combinable with it. `restore.sh` tolerates a missing media archive for a timestamp (treats it as a valid `--no-media` backup) and restores the database only, leaving `/media` untouched.

Makefile shortcuts: `make backup`, `make backup-upload`, `make backup-no-media`, `make restore`.

**`make db-pull` / `make db-pull-local` are broken, same root cause.** Both run `sqlite3 /data/app.db ".backup ..."` inside the `api` container and `docker cp` the result to `./app.db` — pre-Postgres remnants. `/data/app.db` no longer exists, so the target fails outright rather than degrading quietly. To pull a database copy today, use `pg_dump` against the `postgres` container directly, or take the daily dump produced by the `db-backup` worker job. Flagged rather than fixed for the same reason as the `backup.sh` step below: the correct replacement is a deliberate choice, not a mechanical substitution.

**`scripts/backup.sh`'s "database" step is currently dead code in production.** It runs `sqlite3 .backup` against `/data/app.db` and `/data/sessions.sqlite` inside the `api` container — remnants from before the Postgres/Redis migration. Neither file exists anymore: Postgres runs in its own `postgres` container/volume (not the `api` container's `/data` mount), and sessions live in Redis via `connect-redis` (see `api/src/app.js`). The step silently logs "not found, skipping" for both and produces a near-empty `{prefix}-appdata-*.tar.gz`. The **actual** database backup is the `db-backup` worker job (PostgreSQL dump, daily at 02:00 UTC, see Background Jobs above) — `backup.sh` today only meaningfully backs up media. Worth fixing (either wire it to a real `pg_dump`/`pg_basebackup`, or drop the step and rely solely on the worker job) — flagged here rather than fixed, since it changes backup behavior and should be a deliberate decision.

## Known Tech Debt

- **Mobile/iOS** — no systematic mobile QA; iOS Safari regressions are common; no dedicated mobile testing in CI
- No Prettier / auto-formatter (ESLint active, no style enforcement)
- No React error boundaries
- Tailwind loaded via CDN (not bundled)
- `scripts/backup.sh`'s database-backup step is dead code (targets removed SQLite files) — see Backup & Restore above
- Planned notification types `shout_like`/`comment_like` not yet implemented
- `components/` directory has no test files (contexts + hooks are covered)
- `workers/` has a Vitest suite (`workers/tests/`) covering `original-downgrade`, `media-reclaim`, and the reclaim helpers; `notification-cleanup` and `db-backup` are still untested. Run via `make test-workers`, included in `make test-all`, and run in CI alongside lint.
