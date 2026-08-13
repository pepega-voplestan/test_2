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
└── jobs/
    ├── notification-cleanup.ts
    ├── db-backup.ts
    └── original-downgrade.ts
```

| Job | Schedule | Action |
|-----|----------|--------|
| `notification-cleanup` | 00:00 UTC daily | Hard-delete notifications older than 14 days |
| `db-backup` | 02:00 UTC daily | PostgreSQL dump backup, keep last 7 |
| `original-downgrade` | hourly, on the hour | Downgrade original-quality JPG/PNG past their 24h window |

### Original-quality downgrade sweep

`original-downgrade` finds `media` rows (`media_type=image`) whose `media_meta.orig` is set and `converted !== true`, and whose `uploaded_at` is older than `ORIGINAL_QUALITY_WINDOW_HOURS` (24h). For each, it flips `media_meta.converted=true`, removes the `orig` key, and `unlink`s the `original.<ext>` file to reclaim storage — the 320/960/1600 WebP variants already exist from upload, so **no image processing (no Sharp) runs in the worker**. The DB flag is flipped before the unlink, so a crash can only leave a harmless stray file (skipped next run), never a missing image; the original is never removed unless `1600.webp` is confirmed present. State lives in Postgres, so the sweep is restart-safe.

Soft-deleted owners do **not** exempt an item from the sweep. The job checks whether a live (`is_deleted=0`) shout or comment still references the media, but that check only decides which counter the result lands in (`skipped` vs `converted`) — an orphaned item is still finalized: flag flipped, original unlinked. This is deliberate, so every asset reaches a terminal state instead of being rescanned every hour forever. The WebP variants and all DB rows are left in place either way; reclaiming those is the subject of `specs/008-reclaim-unused-media/`.

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
- `workers/` has a Vitest suite for `original-downgrade` (`workers/tests/`, run via `npm test` in `workers/`); other jobs are untested. Not yet wired into the root `make test` targets.
