# Implementation Plan: Multi-Media Gallery Attachments

**Branch**: `006-multi-media-gallery` | **Date**: 2026-07-25 (revised 2026-07-26) | **Spec**: [spec.md](./spec.md)

> **Revision 2026-07-26 — Stage 1 preview redesign.** Stage 1 has already shipped
> to the local environment (commits `d85c6bb`, `e844cfa`) and testing exposed a
> spec-level defect: the first-item-only preview left items 2..N unviewable for
> the whole of Stage 1. Per Clarifications Session 2026-07-26, the inline preview
> becomes an **adaptive grid rendering every item**, and each tile opens the
> existing single-image viewer. **Nothing in the backend, data model, upload
> orchestration or shared hook changes** — this revision is confined to the
> inline rendering component and the Stage 1/Stage 2 boundary. Design decisions
> D1–D10 stand unchanged; D11–D13 are added.

**Input**: Feature specification from `/specs/006-multi-media-gallery/spec.md`

## Summary

Allow a shout or comment to carry an ordered gallery of up to five images/GIFs
instead of a single attachment, rendered inline as an adaptive grid showing every
item, with any tile opening full-screen and (from Stage 2) looping navigation
between items.

The technical approach is deliberately conservative to support the staged
rollout. Two join tables (`shout_media`, `comment_media`) become the home for
gallery membership and ordering, while the existing `Shout.media_id` /
`Comment.media_id` columns are **retained** as a mirror of the gallery's
position-0 item. That mirror is what keeps Stage 1's blast radius small: every
existing read path (`enrichFeed`, search, quote resolution, admin, the
original-downgrade job) continues to work untouched, because "the media of a
shout" still means "its preview item". Only gallery-aware paths join the new
tables.

Multi-file upload reuses the existing `POST /upload/media` endpoint called once
per file rather than introducing a batch endpoint — which makes FR-034's
"keep successes, report each failure" behavior fall out for free, since each
file is already an independent request with its own success or error.

The existing `Lightbox` component (drag-to-dismiss, pinch/wheel/double-tap zoom,
EXIF orientation) is reused as-is from **Stage 1**: a grid tile simply opens it on
that item, which is what makes every image viewable without writing any new
viewer. Stage 2 then extends the same component with optional inter-item
navigation rather than building a second one.

## Technical Context

**Language/Version**: Node.js + JavaScript (ESM) on the API; TypeScript 5 + React 18 on the web; TypeScript on workers

**Primary Dependencies**: Express, Prisma, Zod, multer, sharp (API); React 18, Vite, TailwindCSS (web); BullMQ + Redis (workers)

**Storage**: PostgreSQL via Prisma; media files on disk under `MEDIA_PATH` (`/media`), one directory per media id containing `320/960/1600.webp` variants plus the pending original

**Testing**: Vitest for API integration tests (`api/tests/integration/`) and web unit tests (`web/tests/unit/`); tests run sequentially

**Target Platform**: Dockerised Linux server behind Nginx; browsers desktop + mobile (iOS Safari explicitly supported)

**Project Type**: Web application — `api/` (backend), `web/` (frontend), `workers/` (background jobs)

**Performance Goals**: Feed rendering must not regress; a gallery must add at most one extra query per feed page (batched join-table fetch), never N+1 per shout

**Constraints**: Max 5 items per gallery; per-item limits unchanged from today (`MEDIA_MAX_BYTES` = `ORIGINAL_QUALITY_MAX_BYTES`, default 10 MB; `MEDIA_MAX_DIM` 4096; `MEDIA_MAX_PIXELS` 16 MP; MIME allowlist `image/jpeg|png|webp|gif`, `video/mp4`); `uploadLimiter` = 100 uploads / 10 min / user, unchanged

**Scale/Scope**: 3 stages, each independently deployed to production. Touches ~6 API files, ~5 web components, 1 worker job, 2 new tables.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v1.0.0.

| Principle | Verdict | Notes |
|---|---|---|
| I. Session-Based Authentication Only | ✅ PASS | No auth surface touched. Upload and create routes keep `requireAuth` + `req.session.user`. |
| II. Russian-Language UI Integrity | ✅ PASS (with obligation) | All new copy is Russian. Item counts require correct declension (`1 файл` / `2 файла` / `5 файлов`) — a plural helper is required, not string concatenation. Tracked as a task. |
| III. Soft-Delete & Data Preservation | ✅ PASS | Galleries inherit the parent's `is_deleted`. Join rows are never hard-deleted for user content; they are only removed when a *pending* (unpublished) selection is discarded, which is not user content. |
| IV. Validated, Prisma-Mediated Data Access | ✅ PASS | Join tables are Prisma models. `mediaIds` validated in `helpers/validation.js` (`z.array(z.string().uuid()).max(5)`). Backend remains authoritative on the 5-item cap (FR-002). |
| V. Optimistic UI with Guaranteed Rollback | ✅ PASS | Stage 3's remove/reorder update the pending list immediately and revert on failure. No optimistic path ships without rollback. |
| Domain: **Single media per post/comment** | ⚠️ **DELIBERATE VIOLATION** | This is the feature. Requires a constitution amendment — see Complexity Tracking and the spec's Governance Note. **This is a release gate, not a code gate.** |
| Domain: Single-level comments | ✅ PASS | Untouched. |
| Domain: One pinned shout max | ✅ PASS | Untouched. |
| Domain: Notification dedup | ✅ PASS | Untouched — galleries do not alter notification logic. |
| Workflow: Test isolation | ✅ PASS | New tests follow the existing sequential pattern; no shared mutable state. |
| Workflow: Rate-limit auth states | ✅ PASS | `uploadLimiter` behavior is unchanged; existing both-auth-state tests still apply and are extended for multi-file. |
| Workflow: Admin safety | ✅ PASS | No `admin.js` resource changes planned. If a gallery view is added to admin later, it is out of this feature's scope. |
| Workflow: SSE provider order | ✅ PASS | No provider changes. |
| Workflow: Documentation discipline | ✅ PASS (with obligation) | `CLAUDE.md` / `docs/*` updates go through the `/docs` skill only. The "Single media per post/comment" line in `CLAUDE.md` **must** be revised via `/docs` as part of Stage 1. |

**Gate result**: PASS with one documented, justified violation requiring a
constitution amendment before Stage 1 reaches production.

**Post-Phase-1 re-check**: Re-evaluated after the design below was written. No
new violations introduced. The one addition worth recording is FR-035's
Stage 1–2 GIF/image exclusivity, which is implemented **client-side only** —
see Complexity Tracking for why this does not breach Principle IV.

**Re-check after the 2026-07-26 grid redesign**: still PASS, no new violations.
The revision is presentation-only — no schema, validation, auth, soft-delete or
SSE surface is touched, so Principles I, III and IV are untouched by
construction. Two are worth noting explicitly:

- **Principle II (Russian UI)**: the redesign *removes* the only counted string
  in the rendered output (the "+N" badge), so the declension surface shrinks. The
  plural helper remains required for composer error messages.
- **Principle V (optimistic UI + rollback)**: unaffected — the grid renders
  server-confirmed state; there is no optimistic mutation in it. Optimistic
  behaviour still arrives in Stage 3's reorder/remove.
- **Domain constraint**: the amended v2.0.0 constraint says "an ordered gallery of
  up to 5 image/GIF items", which the grid satisfies more literally than the
  first-item preview did.

## Project Structure

### Documentation (this feature)

```text
specs/006-multi-media-gallery/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — design decisions and rejected alternatives
├── data-model.md        # Phase 1 output — schema, migration, invariants
├── quickstart.md        # Phase 1 output — validation guide per stage
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
├── contracts/
│   ├── gallery-dto.md            # Read contract: how a gallery appears in feed/comment payloads
│   ├── shout-comment-create.md   # Write contract: mediaIds on create
│   └── upload-orchestration.md   # Client-side multi-upload orchestration contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
api/
├── prisma/
│   ├── schema.prisma                 # + ShoutMedia, CommentMedia models
│   └── migrations/<ts>_add_media_galleries/
├── src/
│   ├── helpers/
│   │   ├── validation.js             # + mediaIds array schema (max 5)
│   │   ├── media.js                  # + buildGallery(); buildMedia() unchanged
│   │   ├── feed.js                   # enrichFeed(): batch-load galleries, emit `gallery`
│   │   └── gallery.js                # NEW — single writer enforcing the position-0 mirror
│   └── routes/
│       ├── shouts.js                 # accept mediaIds[]; write gallery rows
│       ├── comments.js               # accept mediaIds[]; write gallery rows
│       └── upload.js                 # unchanged (per-file endpoint reused as-is)
└── tests/integration/
    ├── shouts.test.js  comments.test.js  upload.test.js  feed.test.js

web/
├── components/
│   ├── ShoutInput.tsx                # shout composer — consumes the shared hook
│   ├── ShoutCard.tsx                 # reply composer (SEPARATE impl) + gallery preview; opens viewer
│   ├── Lightbox.tsx                  # Stage 1: reused as-is; Stage 2: + items[]/index navigation
│   ├── GalleryGrid.tsx               # NEW — adaptive grid, replaces GalleryPreview.tsx
│   └── EmojiPicker.tsx / GifPicker.tsx  # FR-035 gate (Stages 1–2), lifted in Stage 3
├── hooks/
│   └── useMediaAttachments.ts        # NEW — shared pending-list, capacity gate, upload orchestration
├── utils/plural.ts                   # NEW — Russian declension for item counts
├── types.ts                          # + GalleryItem[] on Shout/Comment
└── tests/unit/

workers/
└── src/jobs/original-downgrade.ts    # orphan check must consider join tables
```

**Structure Decision**: Existing three-package layout (`api/`, `web/`,
`workers/`) is retained unchanged. New: one backend helper (`gallery.js`), one
frontend component (`GalleryGrid.tsx`), one shared hook
(`useMediaAttachments.ts`) and one utility (`plural.ts`); everything else is
modification of existing files.

> **There are two composers, not one.** The shout composer lives in
> `ShoutInput.tsx`; the reply/comment composer is an entirely separate
> implementation inside `ShoutCard.tsx` (`replyMediaId`, `uploadReplyFile`,
> `handleReplyFileSelect`) which today has **no drag-and-drop handler at all**.
> FR-031 requires identical behavior, so all attachment logic is extracted into
> `useMediaAttachments.ts` and consumed by both, rather than being implemented
> twice. This was missed in the first draft of this plan and caught by
> `/speckit-analyze`; see research D9.

## Staged Delivery Plan

This is the load-bearing part of this plan. **Each stage is a separate
production deployment.** No stage begins implementation until the previous stage
is live and has been exercised by real users (SC-009). Stages are additive: no
stage rewrites the previous stage's work.

### Stage 1 — Publish and view galleries (US1, P1)

**Goal**: users can attach and publish up to 5 images; readers see **every**
image as an adaptive grid and can open any one of them full size. No inter-item
navigation inside the viewer yet.

**Status**: backend and composer work is already implemented and deployed
(`d85c6bb`, `e844cfa`). The remaining work is confined to the inline rendering
component — see "Revision" at the top of this file.

**Backend**
- Migration adding `shout_media` + `comment_media`, with a backfill inserting a
  position-0 row for every existing shout/comment that has a `media_id`.
- `helpers/gallery.js`: the single writer that persists a gallery and maintains
  the `media_id` ↔ position-0 invariant.
- `validation.js`: `mediaIds: z.array(z.string().uuid()).max(5).optional()`,
  accepted alongside the existing `mediaId` (which stays valid — a 1-item
  gallery). Mutual exclusivity with `youtubeUrl` preserved (FR-027).
- `shouts.js` / `comments.js`: accept `mediaIds`, validate every id exists,
  reject >5 server-side (FR-002/FR-033), write gallery rows.
- `feed.js`: batch-load gallery rows for the page's shouts/comments in one
  query; emit `gallery` in the DTO only when length > 1.
- `original-downgrade.ts`: extend the orphan check to consider join-table
  membership.

**Frontend**
- `useMediaAttachments.ts` (NEW): shared pending-list state, capacity gate
  (FR-033) and per-file upload orchestration with per-file error reporting
  (FR-034).
- `ShoutInput.tsx`: `<input multiple>`, multi-file drop, consuming the hook.
- `ShoutCard.tsx` reply composer: same, consuming the same hook — **including a
  drag-and-drop handler it does not have today** (FR-005, FR-031).
- `GalleryGrid.tsx` (NEW, replaces the shipped `GalleryPreview.tsx`): adaptive
  grid rendering every item (FR-012), container shaped by the first item's
  clamped aspect ratio with tiles cropped to fill (FR-014), bounded by the
  per-context max height — 300px shouts / 200px comments (FR-015). No "+N"
  badge (FR-013 removed).
- Tile activation opens the **existing** `Lightbox` on that item (FR-036). No
  changes to `Lightbox.tsx` in Stage 1.
- FR-035 gate: GIF picker disabled while any image is attached and vice versa,
  in both composers.
- Russian plural helper for item counts.

**Also in Stage 1** (added post-analysis)
- `gallery` emitted from the inline create-response/SSE DTOs in `shouts.js` and
  `comments.js`, not only from `enrichFeed()` — otherwise a live-appended shout
  shows no gallery until refresh.
- `upload.test.js` extended for the multi-file path in both authenticated and
  unauthenticated states (FR-008, a constitution MUST).

**Deploy gate**: constitution amendment + `/docs` update landed; existing
single-media content verified visually unchanged (SC-006).

### Stage 2 — Navigate between items (US2, P2)

**Goal**: readers can cycle the whole gallery with looping edge-anchored arrows,
without dismissing and reopening the viewer.

**Scope note (revised 2026-07-26)**: Stage 1 already opens any item full size, so
this stage no longer *unlocks* viewing — it removes the dismiss-and-reopen round
trip. Correspondingly smaller than originally planned.

- `Lightbox.tsx`: optional `items: GalleryItem[]` + `startIndex` props. When
  absent, current single-image behavior is byte-for-byte unchanged.
- Edge-anchored prev/next controls, always rendered at every viewport size
  (FR-018), hidden only for 1-item galleries (FR-022).
- Looping in both directions (FR-019); position indicator "3 / 5" (FR-021).
- Keyboard arrows; horizontal swipe **only while zoom == 1**, to avoid
  conflicting with the existing pan-when-zoomed gesture.
- Scroll position preserved on dismiss (FR-023) — the existing `useScrollLock`
  hook already handles this and must not regress.

**Deploy gate**: verified on the narrowest supported mobile width (SC-005), and
zoom/pan/dismiss gestures confirmed non-regressed.

### Stage 3 — Curate and mix (US3, P3)

**Goal**: reorder/remove while composing; GIFs mixable into galleries.

- Remove individual pending item (FR-024) and reorder (FR-025), both optimistic
  with rollback per Principle V.
- Lift the FR-035 gate; FR-026 takes effect — images and GIFs mix freely.
- Polish pass: loading/error states, badge styling, transitions.

**Deploy gate**: mixed image+GIF galleries verified end-to-end, including a
restricted user (feature 005) being blocked from *new* GIF upload while still
able to reuse an existing one (FR-009 / SC-007).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Constitution Domain Constraint "**Single media per post/comment**" is contradicted | This is the entire feature — the user explicitly directed that the constraint be superseded. | There is no simpler alternative; the constraint *is* the thing being changed. Mitigation is procedural, not technical: amend the constitution (Sync Impact Report + **MAJOR** bump 1.0.0 → 2.0.0, since the constitution reserves MAJOR for redefinitions of binding constraints) and propagate to `CLAUDE.md`/`docs/*` via `/docs`, before Stage 1 reaches production. |
| `media_id` is **denormalized** — it mirrors the gallery's position-0 item, so the same fact lives in two places | Keeps every existing read path (`enrichFeed`, search, quote resolution, admin, downgrade job) working without modification, which is what makes a small, low-risk Stage 1 possible. | Making the join table the sole source of truth would force every read site to change in Stage 1 — precisely the big-bang change the staged rollout exists to avoid. Risk is contained by making `helpers/gallery.js` the **only** writer of both, so the invariant has exactly one enforcement point. Dropping `media_id` is viable follow-up debt once Stage 3 is stable. |
| FR-035 (Stage 1–2 GIF/image exclusivity) is enforced **client-side only**, against the usual "backend enforces, frontend gates" rule | It is a temporary UX simplification, not a security or integrity boundary. The data model permits mixed galleries from Stage 1, and Stage 3 legitimizes them deliberately. | Enforcing it server-side would mean writing a validation rule in Stage 1 solely to delete it in Stage 3, and would risk rejecting content that becomes valid mid-rollout. Bypassing the gate produces a mixed gallery — which is a *supported* state, not a corrupt one, so there is no integrity risk. |
| Abandoned composer uploads leave orphaned `Media` rows and files, now at up to 5× the previous rate | Uploads must be persisted before shout creation because the create route takes ids, not files. | This is **pre-existing** behavior, not introduced here — a single abandoned upload already orphans today. The multiplier is new; a reaping job is the right fix but is out of scope for this feature. Recorded as known debt in `research.md`. |
