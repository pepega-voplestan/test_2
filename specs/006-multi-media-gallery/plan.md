# Implementation Plan: Multi-Media Gallery Attachments

**Branch**: `006-multi-media-gallery` | **Date**: 2026-07-25 (revised 2026-07-26, 2026-07-30) | **Spec**: [spec.md](./spec.md)

> **Revision 2026-07-26 — Stage 1 preview redesign.** Stage 1 has already shipped
> to the local environment (commits `d85c6bb`, `e844cfa`) and testing exposed a
> spec-level defect: the first-item-only preview left items 2..N unviewable for
> the whole of Stage 1. Per Clarifications Session 2026-07-26, the inline preview
> becomes an **adaptive grid rendering every item**, and each tile opens the
> existing single-image viewer. **Nothing in the backend, data model, upload
> orchestration or shared hook changes** — this revision is confined to the
> inline rendering component and the Stage 1/Stage 2 boundary. Design decisions
> D1–D10 stand unchanged; D11–D13 are added.

> **Revision 2026-07-30 — Composer pending-preview & upload-timing.** Further
> production feedback on the deployed Stage 1 build. Two changes, both confined
> to composing (nothing about published-gallery display or the schema changes):
> (1) per-item removal (FR-024) is pulled forward from Stage 3 into effect now,
> the pending-item preview gets its own bordered/divided horizontal-scroll
> container at a unified 80px size, and a pending tile is now clickable into the
> existing `Lightbox`; (2) upload timing reverses from upload-on-select to
> upload-on-submit, with the submit becoming atomic — this **directly reverses
> research D2's rejection of "upload on submit"** (D2 rejected it for lacking a
> preview and for blocking submit on a slow upload; both objections are resolved
> differently here — see D14). Design decisions D1, D3–D13 stand unchanged; D2 is
> superseded by D14; D15–D17 are added.

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
navigation rather than building a second one. As of the 2026-07-30 revision,
`Lightbox` is also opened from a **pending** (not-yet-uploaded) tile during
composing, pointed at the file's local object URL instead of a server URL —
no changes to `Lightbox.tsx` itself are needed for this, since it only ever
needed a `src` string.

As of the 2026-07-30 revision, file upload no longer happens at selection time.
`useMediaAttachments.ts` holds selected files client-side (object URL preview
only) and defers the actual `POST /upload/media` calls until the user submits;
the submit is atomic — every file must upload successfully before the
shout/comment is created, otherwise nothing is posted and the whole batch can be
retried. This is a client-orchestration change only: no new endpoint, no schema
change (see D14–D16).

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

**Re-check after the 2026-07-30 composer/upload-timing revision**: still PASS, no
new violations.

- **Principle IV (Validated, Prisma-Mediated Data Access)**: unaffected — no new
  endpoint, no schema change. The five-item cap and permission check (feature 005)
  are still enforced at the same server boundary (`POST /upload/media`,
  `POST /shouts`/`/comments`); only the client-side *timing* of when that boundary
  is invoked changes.
- **Principle V (Optimistic UI + rollback)**: pending-item removal introduced by
  this revision needs no rollback story — it is pure client-state mutation with no
  network call (nothing has been uploaded yet), so there is nothing to roll back
  from. This is a stronger guarantee than the optimistic-with-rollback pattern
  elsewhere, not a gap in it.
- **Workflow: Rate-limit auth states**: unaffected in shape — `uploadLimiter`
  still gates the same endpoint on the same terms; only *when* in the user's
  session the calls happen changes (see research D15 for the concurrency
  decision).
- **New consideration — submission atomicity**: FR-041 requires an all-or-nothing
  submit. This is enforced by client orchestration in `useMediaAttachments.ts`
  (only call the create route once every upload has succeeded), not by a new
  database transaction — there is no multi-row server-side transaction to add,
  since `helpers/gallery.js` (D1) already writes gallery membership in one
  create-route call. The one residual gap this leaves — a create-route failure
  *after* all uploads already succeeded — is the same class of orphaned-`Media`-row
  risk the codebase already accepts for single-media today; see Complexity
  Tracking.

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
│   ├── Lightbox.tsx                  # Stage 1: reused as-is; Stage 2: + items[]/index navigation; 2026-07-30: also opened on a pending item's local object URL
│   ├── GalleryGrid.tsx               # NEW — adaptive grid, replaces GalleryPreview.tsx
│   ├── PendingMediaStrip.tsx         # NEW (2026-07-30) — bordered/divided horizontal-scroll pending-item preview, shared by both composers; renders remove-X + click-to-Lightbox per tile
│   └── EmojiPicker.tsx / GifPicker.tsx  # FR-035 gate (Stages 1–2), lifted in Stage 3
├── hooks/
│   └── useMediaAttachments.ts        # NEW — shared pending-list, capacity gate; 2026-07-30: pending files hold only a local object URL until submit, per-item removal (FR-024), and atomic submit-time upload orchestration (FR-041) replace the former per-file upload-on-select behavior
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

**Also in Stage 1 — composer revision (added 2026-07-30, post-deployment feedback)**
- `useMediaAttachments.ts` rewritten: selecting/dropping a file no longer calls
  `POST /upload/media` immediately — it is held client-side as
  `{ file, objectUrl }` and only uploaded at submit time (FR-041). Client-side
  pre-validation (type/size) still runs immediately at selection, unchanged
  (FR-034). Per-item removal (FR-024) is added: removing a pending item is a
  pure state mutation, no server call, since nothing has been uploaded yet.
- `PendingMediaStrip.tsx` (NEW): renders the pending list in its own bordered
  container with a thin divider, single horizontal row, horizontal scroll on
  overflow (FR-038/FR-039). Each tile is 80px max-height (FR-040, unified across
  both composers, down from the shipped 160px/96px split) with its own remove
  control (kept at its current visual size) and opens `Lightbox` on its local
  object URL when clicked (FR-037). Consumed by both `ShoutInput.tsx` and the
  reply composer in `ShoutCard.tsx`, per the D9 lesson (one implementation, not
  two).
- Submit handler: on submit, upload every pending file (parallel, D15), then —
  only if every upload succeeded — call `POST /shouts`/`/comments` with the
  resulting `mediaIds`. On any upload failure, no create call is made; the
  pending list and composed text are left untouched; a "Try again" action
  resubmits, reusing any `mediaId` already obtained in the failed attempt
  rather than re-uploading those files again (D16).

**Deploy gate**: constitution amendment + `/docs` update landed; existing
single-media content verified visually unchanged (SC-006); the 2026-07-30
composer revision additionally verified for atomic submit failure/retry and
per-item removal before re-deployment.

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

### Stage 3 — Reorder and mix (US3, P3)

**Goal**: reorder while composing; GIFs mixable into galleries.

**Scope note (narrowed 2026-07-30)**: per-item removal (FR-024) moved to Stage 1
as part of the composer revision; this stage now covers only reordering.

- Reorder (FR-025), optimistic with rollback per Principle V.
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
| *(Superseded 2026-07-30 — see row below)* Abandoned composer uploads leave orphaned `Media` rows and files, now at up to 5× the previous rate | Uploads must be persisted before shout creation because the create route takes ids, not files. | Resolved by the 2026-07-30 upload-timing revision for the common case (a composer abandoned without ever submitting now uploads nothing at all — see D14). |
| A submit that fails after some files already uploaded, and is never retried, still orphans those `Media` rows | Atomicity (FR-041) is client-orchestrated, not a server-side transaction — see Constitution Check re-check above. A true transactional guarantee would require either a combined upload+create endpoint or a two-phase commit, both rejected as disproportionate (see research D14). | This residual case is the **same order of magnitude** as the pre-existing single-media orphan risk (one abandoned upload), not the up-to-5× multiplier the original architecture would have produced — D16's retry-reuses-ids behavior prevents *retried* attempts from compounding it further. A reaping job for unreferenced `Media` rows remains the correct long-term fix and stays out of scope here. |
