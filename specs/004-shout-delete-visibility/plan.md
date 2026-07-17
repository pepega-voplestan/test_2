# Implementation Plan: Hide Uncommented Shouts on Delete

**Branch**: `004-shout-delete-visibility` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-shout-delete-visibility/spec.md`

## Summary

When a user deletes a shout, the backend must check its comment count at the moment of deletion. Zero comments → the shout is fully removed from the main feed for everyone, live, instead of leaving today's "deleted" placeholder. One or more comments → today's exact soft-delete/placeholder/live-update behavior is unchanged. The approach adds a comment-count check to the existing `DELETE /shouts/:id` route, introduces a new SSE event (`remove_shout`) broadcast only for the zero-comment case so the existing `delete_shout` placeholder path is never touched, and extends the feed/single-shout read queries to exclude zero-comment deleted shouts on reload.

## Technical Context

**Language/Version**: Node.js (Express, ESM) backend; TypeScript + React 18 (Vite) frontend

**Primary Dependencies**: Prisma ORM (PostgreSQL), the project's hand-rolled SSE layer (`api/src/sse.js` broadcast/broadcastToUser, `web/context/SSEContext.tsx` subscribe), React state in `ShoutFeed.tsx` / `ShoutPage.tsx`

**Storage**: PostgreSQL via Prisma — `shouts` and `comments` tables (existing schema, no migration needed; the feature is a query/behavior change, not a data-model change)

**Testing**: Vitest (`api/tests/integration`, `web/tests` — both run via `vitest run`, sequential per project convention)

**Target Platform**: Existing Docker/Nginx-deployed web app (Linux server) + browser clients

**Project Type**: Web application (backend `api/` + frontend `web/`)

**Performance Goals**: The zero-comment removal must propagate over the existing SSE broadcast path with the same latency as today's `delete_shout` placeholder update — no new polling or delivery mechanism.

**Constraints**: Soft-delete only (constitution III) — the shout row is still marked `is_deleted=1`; "hidden from feed" is query-level exclusion, not row destruction. Prisma-only data access (constitution IV) — the comment-count check and feed exclusion must be expressed as Prisma queries/relation filters, not raw SQL. Must not alter the has-comments placeholder path in any observable way (spec SC-002).

**Scale/Scope**: Touches one backend route (`DELETE /shouts/:id`), two read paths (`GET /shouts` "new"-tab query, `GET /shouts/:id`), one new SSE event name (the backend's `broadcast()` takes an arbitrary string with no allowlist, so the only real registration point is the frontend's `ALL_EVENTS` list in `SSEContext.tsx`), and the two frontend consumers that currently handle `delete_shout` (`ShoutFeed.tsx`, `ShoutPage.tsx`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **III. Soft-Delete & Data Preservation (NON-NEGOTIABLE)** — PASS. The shout row is still soft-deleted (`is_deleted=1`); nothing is hard-deleted. "Hidden from feed" is achieved by excluding it from feed/detail queries, matching FR-008.
- **IV. Validated, Prisma-Mediated Data Access** — PASS. The comment-count check and the feed-exclusion filter are both expressible as native Prisma queries (`comment.count`, and a `comments: { none: { is_deleted: 0 } }` relation filter) — no raw SQL required.
- **V. Optimistic UI with Guaranteed Rollback** — PASS, no change in risk profile. The author's own delete (`ShoutCard.tsx:1273-1285`) is actually confirm-then-update today, not optimistic — it awaits the `DELETE` response and only calls `onDelete` after `res.ok`, unlike the genuinely optimistic like-toggle in the same file. This feature preserves that same confirm-then-update pattern (it only adds a branch on comment count to the callback that already runs after confirmation) and doesn't newly introduce an optimistic-without-rollback path, so the principle isn't implicated either way.
- **Domain constraint — one pinned shout maximum** — PASS, addressed explicitly (spec Edge Cases): a pinned shout with zero comments is removed like any other, and the pinned slot is simply vacated (no auto-promotion of another shout is introduced by this feature).
- **Domain constraint — single-level comments** — N/A, unaffected.
- No violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/004-shout-delete-visibility/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── delete-shout.md
│   └── sse-remove-shout.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
api/
├── src/
│   ├── routes/
│   │   └── shouts.js        # DELETE /shouts/:id (comment-count check, conditional broadcast)
│   │                         # GET /shouts (new-tab query gains zero-comment-deleted exclusion)
│   │                         # GET /shouts/:id (404 instead of placeholder for zero-comment deleted)
│   ├── helpers/
│   │   └── feed.js          # enrichFeed/mapShout — no change to has-comments placeholder branch
│   └── sse.js                # broadcast() reused; new event name "remove_shout"
└── tests/
    └── integration/
        └── shouts.test.js    # existing suite — extend for both branches

web/
├── context/
│   └── SSEContext.tsx        # ALL_EVENTS list gains "remove_shout"
├── components/
│   ├── ShoutFeed.tsx          # new remove_shout handler (splice out of array) alongside existing delete_shout handler (unchanged)
│   └── ShoutPage.tsx          # new remove_shout handler (show "not found"/removed state) alongside existing delete_shout handler (unchanged)
```

**Structure Decision**: Existing web-application layout (`api/` + `web/`) is unchanged; this feature is additive within already-established files (one route, one feed query, one SSE event, two frontend listeners) rather than new modules.

## Complexity Tracking

*No Constitution Check violations — section not applicable.*
