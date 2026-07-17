# Implementation Plan: Original-Quality Image Uploads

**Branch**: `003-original-quality-uploads` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-original-quality-uploads/spec.md`

## Summary

Allow JPG/PNG uploads to be stored and served at their original, losslessly-preserved
pixel quality for the first 24 hours after upload, then automatically downgrade them to
the existing compressed-WebP pipeline output and reclaim the original file's storage.

Technical approach: at upload time, in addition to the current WebP variant generation,
persist a metadata-stripped copy of the original file (`original.<ext>`) and record the
upload time plus a pending-conversion flag in `media_meta`. The full-size ("opened"/
lightbox) view serves the original during the window; feed/inline surfaces keep serving
the existing scaled WebP variants. A repeatable BullMQ worker sweep (mirroring the
existing `notification-cleanup` job) runs every few minutes, finds original-quality
assets past their 24-hour deadline whose owning content still exists, converts them
through the standard pipeline, flips the flag, and deletes the original file. State lives
in the database, so the process is restart-safe and cancellation is implicit (deleted
content is simply skipped).

## Technical Context

**Language/Version**: Node.js (ESM) for API; TypeScript for workers; React 18 + TypeScript + Vite for web

**Primary Dependencies**: Express, Prisma, `sharp` (image processing), `multer` (upload), BullMQ + Redis (workers); web uses existing `Lightbox`/`ShoutCard` components

**Storage**: PostgreSQL via Prisma (`media` table); media files on disk under `MEDIA_PATH`, served by the `media` nginx container (`media-nginx.conf`) in prod and `express.static` in dev

**Testing**: API — Jest/node test runner via `make test` (sequential, `bcrypt` rounds=4); web — Vitest (`make test-web`)

**Target Platform**: Linux server (Docker Compose: api, web, workers, media, redis, postgres, nginx)

**Project Type**: Web application (API + web front end + background workers)

**Performance Goals**: Conversion of ≥99% of eligible images within 1 hour of their 24-hour deadline (SC-002; sweep runs hourly); no user-facing latency added to upload beyond writing one extra file

**Constraints**: Original must be lossless (no re-encode of pixel data) while privacy metadata (GPS, camera identifiers) is stripped; single-media-per-post/comment invariant preserved; image reference URLs must survive the transition (FR-006); env-configurable size limit (FR-011)

**Scale/Scope**: Small social app; one image per shout/comment; touches `api/src/routes/upload.js`, `api/src/helpers/media.js`, `workers/` (new job + queue + schedule), Prisma `media_meta` usage, and the web full-size image URL selection

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| I. Session-Based Auth Only | ✅ Upload path stays behind `requireAuth`/session; no token changes. |
| II. Russian-Language UI Integrity | ✅ New rejection messages (oversized/corrupt) are Russian with correct declensions; no English copy. |
| III. Soft-Delete & Data Preservation | ✅ No hard-delete of user content. Deleting the redundant *original* file after a confirmed WebP conversion is storage reclamation of a derived asset, not content deletion; the `media` row and served image persist. |
| IV. Validated, Prisma-Mediated Data Access | ✅ All DB access via Prisma; upload validation stays in `sharp`/Zod-guarded flow; size limit via env. Worker uses Prisma. |
| V. Optimistic UI with Guaranteed Rollback | ✅ No new optimistic mutation; upload is a request/response with explicit error handling. N/A but not violated. |
| Single media per post/comment | ✅ Feature operates on the existing single `media_id`; adds no second media item. |
| Rate-limit auth states | ✅ Upload path keeps `uploadLimiter` (per-user key, IP fallback); both states tested. |
| Env-driven config | ✅ Max original-quality size and retention window read from env, not hardcoded. |
| Documentation via `/docs` | ⚠️ Any `docs/*.md` / `CLAUDE.md` prose updates go through the `/docs` skill. The SPECKIT-marker plan pointer in `CLAUDE.md` is the one machine-managed exception updated by this workflow. |

**Result**: PASS — no violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-original-quality-uploads/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature spec (already present)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── upload-media.md          # POST /api/v1/upload/media contract
│   ├── media-dto.md             # buildMedia() DTO + full-URL selection contract
│   └── downgrade-job.md         # Worker sweep contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
api/
├── src/
│   ├── routes/
│   │   ├── upload.js        # MODIFY: persist metadata-stripped original + set media_meta flags for JPG/PNG
│   │   └── index.js         # (mount unchanged)
│   ├── helpers/
│   │   ├── media.js         # MODIFY: constants (ORIGINAL_QUALITY_MAX_BYTES env), lossless metadata-strip helper, buildMedia() full-URL selection
│   │   └── validation.js    # (no new external input schema needed; multer/sharp guard upload)
│   └── app.js               # (dev static + rate limit unchanged)

workers/
├── src/
│   ├── jobs/
│   │   └── original-downgrade.ts   # NEW: sweep worker — convert due originals, reclaim storage
│   ├── queues.ts                   # MODIFY: add originalDowngradeQueue
│   ├── scheduler.ts                # MODIFY: register repeatable sweep (every N minutes)
│   └── index.ts                    # MODIFY: start worker + register on Bull Board

web/
└── components/
    └── ShoutCard.tsx        # (no change if buildMedia keeps returning `full`; verify lightbox uses media.full)

api/prisma/
└── schema.prisma           # NO schema change required — state carried in existing media_meta JSON
```

**Structure Decision**: Existing web-application layout (API + workers + web). The feature
adds one background job to `workers/` following the established repeatable-sweep pattern
(`notification-cleanup`), modifies the upload route and media helper in the API, and
requires no Prisma migration because per-asset conversion state is stored in the existing
`media.media_meta` JSON column.

## Complexity Tracking

> No constitution violations — section intentionally empty.
