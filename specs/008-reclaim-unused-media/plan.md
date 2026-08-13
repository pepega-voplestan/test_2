# Implementation Plan: Reclaim Unused Media Storage

**Branch**: `main` (no feature branch created) | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-reclaim-unused-media/spec.md`

## Summary

Reclaim media storage in three classes, none of which degrades any image a user
can currently see. **(1)** Stop generating per-kind unreachable WebP variants at
upload — `320.webp` for non-animated images, `1600.webp` for animated ones — and
remove the existing ones with a one-time operator script. **(2)** Add a daily
BullMQ job that removes files for media with no live reference: uploads
abandoned before publishing, and media behind content soft-deleted longer ago
than a grace period. **(3)** Never remove a database row — only files.

The design turns on one idea: a single `media_meta.reclaimed` marker answers
"are this item's files still on disk?", and four separate requirements
(idempotency, DTO honesty, restore-after-reclaim, publish guard) all read that
one answer instead of deriving four that could disagree.

Three protections are structural rather than filtered-in: media referenced by a
user's personal GIF library, by any live content, or by ban-removed content
(`is_deleted=2`) is treated as *protected*, so a missed check retains data
rather than destroying it.

## Technical Context

**Language/Version**: Node.js ESM (`api/`, `.js`); TypeScript (`workers/`); React 18 + TypeScript via Vite (`web/`)

**Primary Dependencies**: BullMQ + Redis (job scheduling), Prisma (all DB access), Express, nginx (media serving). `sharp` is used at upload in `api/` only — **no image processing in the workers**, since this feature only deletes files. One new devDependency: `vitest` in `workers/` (see below).

**Storage**: PostgreSQL via Prisma — **no schema migration**; state lives in the existing `media.media_meta` JSON column. Media files on the Docker `media` volume at `MEDIA_PATH=/media`, mounted read-write by the `worker` container and read-only by the `media` nginx container.

**Testing**: Vitest. `api/tests/{unit,integration}/`, `web/tests/unit/`, `workers/tests/`. **Blocking defect**: `workers/tests/original-downgrade.test.ts` imports `vitest`, but `workers/package.json` declares no `vitest` dependency and no `test` script — the existing suite cannot run. Must be repaired and baselined before new job code lands ([research D8](./research.md#d8)). Tests run sequentially; no `describe`-level parallelism.

**Target Platform**: Linux server, Docker Compose + nginx. Browser frontend.

**Project Type**: Web application — `api/` backend + `web/` frontend + `workers/` background jobs.

**Performance Goals**: The sweep is I/O-bound metadata work, not compute. Batched so worker memory stays bounded regardless of media volume ([research D6](./research.md#d6)). Must add no measurable latency to feed rendering — the reclaim check is a field read on already-loaded `media_meta`, never a filesystem `stat` on the request path.

**Constraints**: Deletion is irreversible — lossless originals are already discarded 24h after upload, so nothing removed can be regenerated. Dry-run is the default posture for both capabilities. Files only, never rows. All user-facing copy in Russian. Backend authoritative.

**Scale/Scope**: Production media volume size is unknown from the development environment; [quickstart Step 1](./quickstart.md#step-1--measure-before) establishes the baseline before anything is deleted. Scope: 1 new worker job, 1 new operator script, `upload.js` variant generation, `buildMedia` DTO, `attachments.js` publish guard, `media-nginx.conf` fallback, `web/types.ts`, plus tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against **Constitution v4.0.0**.

| Principle / Constraint | Impact | Compliance |
|---|---|---|
| I. Session-based auth only | Not touched — no auth surface in this feature. | ✅ N/A |
| II. Russian-language UI integrity | One new user-facing string: the publish-guard rejection (FR-013, [C3](./contracts/media-dto.md#c3--publish-guard)). Must be Russian with correct declensions. | ✅ Pass — specified as Russian; no English UI copy. |
| **III. Soft-delete & data preservation (NON-NEGOTIABLE)** | **The central principle for this feature.** It deletes media files, including for soft-deleted content. | ✅ **Pass — under v4.0.0.** See analysis below. |
| IV. Validated, Prisma-mediated data access | All DB access via Prisma; no raw SQL. No new external input to validate (both entry points are operator-invoked, not user-facing). | ✅ Pass |
| V. Optimistic UI with rollback | No optimistic mutation added. | ✅ N/A |
| VI. Design-first, tests second | Dependency-injection seam mirrors `runOriginalDowngrade`'s existing shape ([C4](./contracts/media-dto.md#c4--recurring-job-entry-point)) — an established production pattern, adopted because it is right, not to ease testing. | ✅ Pass |
| VII. Minimal, meaningful comments | Comments reserved for the non-obvious: why `user_gifs` protects, why the DB marker precedes the `unlink`, why `960.webp` must never be reclaimed. | ✅ Pass |
| Bounded media galleries | `buildGallery` already omits sub-2-item galleries, so a gallery reduced by reclaim degrades to the single-media shape with no new code. Cap and exclusivity untouched. | ✅ Pass |
| Test isolation (sequential) | New tests use injected fakes, no shared mutable state, no `describe`-level parallelism. | ✅ Pass |
| Environment-driven config | Grace periods via `MEDIA_UNPUBLISHED_GRACE_DAYS` / `MEDIA_DELETED_GRACE_DAYS`, following `ORIGINAL_QUALITY_WINDOW_HOURS` precedent. Not hardcoded. | ✅ Pass |
| Admin safety (`admin.js`) | Not modified, but restore behaviour changes observably (restored content may be media-free). Any uncaught error there exits code 1 in production — restore must be exercised locally before deploy ([quickstart Step 6](./quickstart.md#step-6--verify-restore-degrades-visibly-fr-014)). | ✅ Pass — with mandatory manual verification |
| Rate-limit auth states | No rate-limited endpoint touched. `attachments.js` gains a guard but no new endpoint. | ✅ N/A |
| SSE provider order | Not touched. | ✅ N/A |
| Documentation discipline (`/docs` only) | `CLAUDE.md` and `docs/*.md` updates go through `/docs`. Already used to propagate the v4.0.0 amendment. | ✅ Noted for post-implementation |

### Principle III analysis

This feature exists *because* Principle III was amended for it. The gate passes
only under v4.0.0, and only because the design stays inside the boundaries that
amendment drew:

| v4.0.0 requirement | How the design satisfies it |
|---|---|
| Rows are never hard-deleted | FR-009. Files only. `media`, `shout_media`, `comment_media`, `user_gifs` rows all survive — the tombstone path for a deleted shout with live comments depends on them. |
| Files reclaimable only when unreachable, unpublished past a window, or behind `is_deleted=1` past a grace period | The three classes in [data-model.md](./data-model.md#candidate-classification) map 1:1 to the three permitted clauses. No fourth path exists. |
| Grace period covers routine reversal | Default 7 days, env-configurable ([research D7](./research.md#d7)). |
| Restore is content-complete, not media-complete; loss must be visible | [C2](./contracts/media-dto.md#c2--reclaimed-media-is-omitted-not-broken) — media omitted from the payload entirely, so restored content renders text-only rather than as a broken image. |
| `is_deleted=2` exempt | [research D10](./research.md#d10) — banned content is expressed as *protecting* its media, so the fail-safe direction is retention. |
| Live-referenced and personal-library media exempt | [research D9](./research.md#d9) — one `hasLiveReference` predicate covering all three tables, unit-tested against the library case directly. |
| Avatars unaffected | FR-021. Avatars live under `AVATAR_PATH` on a separate volume and are not `media` rows, so they are out of scope structurally, not by filter. |

**No Complexity Tracking entries.** No principle is violated and no exception is
required, because the amendment landed before planning rather than being
justified retroactively.

## Project Structure

### Documentation (this feature)

```text
specs/008-reclaim-unused-media/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — D1..D10 design decisions
├── data-model.md        # Phase 1 — media_meta shape, reference rules
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   └── media-dto.md     # Phase 1 — C1..C6 contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16)
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
api/src/
├── routes/upload.js            # MODIFY — skip unreachable variant per kind (FR-001/002)
├── helpers/
│   ├── media.js                # MODIFY — buildMedia honours `reclaimed` (C1, C2)
│   └── attachments.js          # MODIFY — publish guard (C3)
└── tests/
    ├── unit/media.test.js      # buildMedia emission rules
    └── integration/upload.test.js  # per-kind variant generation

workers/
├── package.json                # MODIFY — add vitest + test script (BLOCKING, D8)
├── src/
│   ├── jobs/media-reclaim.ts   # NEW — recurring job (C4)
│   ├── scripts/
│   │   └── reclaim-unreachable-variants.ts  # NEW — one-time script (C5)
│   ├── helpers/media-refs.ts   # NEW — hasLiveReference predicate (D9)
│   ├── queues.ts               # MODIFY — register media-reclaim queue
│   ├── scheduler.ts            # MODIFY — daily schedule
│   └── index.ts                # MODIFY — worker + Bull Board panel
└── tests/
    ├── original-downgrade.test.ts   # EXISTING — baseline first
    ├── media-reclaim.test.ts        # NEW
    └── media-refs.test.ts           # NEW — GIF library, banned, shared media

web/
├── types.ts                    # MODIFY — thumb/full optional (C1)
└── components/                 # VERIFY ONLY — no reader of the omitted fields

media-nginx.conf                # MODIFY — 960.webp fallback (C6)
```

**Structure Decision**: Standard three-tier layout, unchanged. The reclaim logic
lives in `workers/` because it is scheduled background work with filesystem
access — the `worker` container already mounts the media volume read-write in
all three compose files, and `original-downgrade` establishes the pattern. The
new `workers/src/helpers/` and `workers/src/scripts/` directories are the only
structural additions; both mirror conventions already used in `api/src/`.

## Phase 2 note

`/speckit-tasks` should sequence the work so each user story stays independently
shippable:

1. **Blocking prerequisite** — repair and baseline the `workers/` test harness (D8).
2. **US1** — upload change, one-time script, DTO change, nginx fallback. Ships alone; no policy dependency.
3. **US2** — recurring job with the `hasLiveReference` predicate, never-published class only.
4. **US3** — extend the same job to deleted-content, plus the publish guard and restore verification.

US1 delivers most of the guaranteed-safe reclaim and touches no user-owned
content, so it should land and be verified in production before US3 — the class
that makes an existing capability permanently lossy — is enabled.
