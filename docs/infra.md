# Infrastructure Reference

## Docker Services

7 services per environment. Prod: nginx on 80/443. Local dev: port 3006. Dev volumes isolated (`-dev` suffix on all volume names).

| Service | Description |
|---------|-------------|
| `postgres` | PostgreSQL 16 Alpine; data in named volume; healthcheck gates api + worker startup |
| `api` | Express backend (internal port 3000); runs `prisma migrate deploy` on startup |
| `media` | Hardened Nginx: WebP/JPG/JPEG/PNG/GIF/MP4 only, no dotfiles, immutable 1yr cache |
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
├── helpers/        # reclaim.ts (shared removal mechanism), media-refs.ts, variant rules
└── jobs/
    ├── notification-cleanup.ts
    ├── db-backup.ts
    ├── original-downgrade.ts
    └── media-reclaim.ts
```

| Job | Schedule | Action |
|-----|----------|--------|
| `notification-cleanup` | 00:00 UTC daily | Hard-delete notifications older than 14 days |
| `db-backup` | 02:00 UTC daily | PostgreSQL dump backup, keep last 7 |
| `original-downgrade` | hourly, on the hour | Downgrade original-quality JPG/PNG past their 24h window |
| `media-reclaim` | 03:00 UTC daily | Reclaim files for media no display surface can reach (currently: never-published uploads past `MEDIA_UNPUBLISHED_GRACE_DAYS`) |

### Original-quality downgrade sweep

`original-downgrade` finds `media` rows (`media_type=image`) whose `media_meta.orig` is set and `converted !== true`, and whose `uploaded_at` is older than `ORIGINAL_QUALITY_WINDOW_HOURS` (24h). For each, it flips `media_meta.converted=true`, removes the `orig` key, and `unlink`s the `original.<ext>` file to reclaim storage — the 320/960/1600 WebP variants already exist from upload, so **no image processing (no Sharp) runs in the worker**. The DB flag is flipped before the unlink, so a crash can only leave a harmless stray file (skipped next run), never a missing image; the original is never removed unless `1600.webp` is confirmed present. State lives in Postgres, so the sweep is restart-safe.

Soft-deleted owners do **not** exempt an item from the sweep. The job checks whether a live (`is_deleted=0`) shout or comment still references the media, but that check only decides which counter the result lands in (`skipped` vs `converted`) — an orphaned item is still finalized: flag flipped, original unlinked. This is deliberate, so every asset reaches a terminal state instead of being rescanned every hour forever. The WebP variants and all DB rows are left in place either way; reclaiming those is the subject of `specs/008-reclaim-unused-media/`.

### Media reclaim sweep

`media-reclaim` removes **files only** — no row is ever deleted, because the tombstone render for a soft-deleted shout that still carries live comments depends on the `media` and join rows surviving. It runs at 03:00 UTC, after `db-backup` at 02:00, so a day's snapshot always predates that day's deletions.

A media item is reclaimable only when nothing references it. The reference check (`workers/src/helpers/media-refs.ts`) consults **three** tables, and the third is the one that bites: `user_gifs` holds a user's personal GIF library, whose entries are deliberately attached to no post — a check consulting only `shout_media`/`comment_media` classifies every saved library as orphaned and deletes it. `is_deleted=2` (ban-removed) content *protects* its media rather than being filtered out afterwards, so the fail-safe direction is retention: a missed protection retains data, a missed filter destroys it. Unbanning therefore still restores an account's content complete.

Only the **never-published** class is swept today: media with no reference of any kind, older than `MEDIA_UNPUBLISHED_GRACE_DAYS` (default 7). Media sitting behind `is_deleted=1` content is a separate class on a deletion-based clock and is deliberately **not** swept — `MEDIA_DELETED_GRACE_DAYS` is already wired into all three compose files but is intentionally unread until that work lands.

Candidates are paged with `take`/`cursor` (500 per batch). Unlike the downgrade sweep this candidate set does not self-empty — protected media stays a candidate forever, and a dry run marks nothing — so an unbounded `findMany` would grow with the volume. `media_meta.reclaimed.files=true` is written **before** any `unlink`, so an interruption can only leave a harmless stray file, never a record pointing at a file that is gone. That write is a compare-and-set on the whole `media_meta` blob, because `original-downgrade` rewrites the same column hourly from another process; a row that moved under us is left entirely alone and retried next sweep. `meta.json` is deliberately left on disk as a tombstone, so a reclaimed directory reads as intentional rather than as an unexplained empty one. `runMediaReclaim({ dryRun: true })` performs every read and reports `bytesFreed` without deleting anything.

Avatars are unaffected: they carry no `media` row and live on a separate volume (`AVATAR_PATH`, default `/data/avatars`).

### One-time reclaim of unreachable variants

`./scripts/reclaim-unreachable-variants.sh` — a host-side operator script for the WebP variants generated before feature 008 that no display surface can request. Run from the repo root on the machine holding the volumes; **dry run by default**, `--execute` to delete, `--limit N` for a staged rollout, `--dev` to target the dev stack.

Which variant is dead flips with the media kind, and **inverting the rule deletes images that are still on screen**:

| Kind | Dead variant | Why the others stay |
|---|---|---|
| Still image (no `original.gif`) | `320.webp` | nothing reads the DTO's `thumb`; the lightbox reads `1600` |
| Animated GIF | `1600.webp` | it plays from `original.gif`; the library picker grid reads `320` |
| Single-frame library GIF | *none* | the picker reads its `320`, and `buildMedia` serves it as a still so the lightbox reads its `1600` |

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
