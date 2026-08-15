# Implementation Plan: Multi-Media Gallery Attachments

**Branch**: `006-multi-media-gallery` | **Date**: 2026-07-25 (revised 2026-07-26, 2026-07-30, 2026-07-31) | **Spec**: [spec.md](./spec.md)

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

> **Revision 2026-07-31 — Published-gallery carousel & permanent GIF exclusion.**
> The largest revision so far. The adaptive grid (`GalleryGrid.tsx`, D11–D13) is
> retired entirely in favor of a Reddit-style single-item carousel with looping
> navigation, edge-anchored arrows, and a position indicator, delivered inline in
> the shout/comment body. Stage 2 (a separate fullscreen looping viewer) is
> dropped outright — the inline carousel already delivers that value. GIFs are
> permanently excluded from any 2+-item gallery, reversing Stage 3's planned
> mixed-media work. **Key finding during planning (D19): GIF exclusion is
> half-shipped already, not fully** — `api/src/helpers/attachments.js`'s
> `isMultiItemEligible()` has excluded Giphy-picker GIFs (`media_type: "giphy"`)
> from any 2+-item gallery since Stage 1 first shipped, but a directly
> **uploaded** animated GIF file gets `media_type: "image"` (animated-ness
> lives only in its `media_meta` JSON) and so currently *passes* that same
> check — a small, genuine server-side fix is needed to close that gap, plus
> the client-side gate fix and a stale doc comment correction. Design
> decisions D1–D17 stand for what they document; D18–D20 are added.
> **Correction, not new information**: while verifying file paths for
> this revision, this plan and `research.md`'s D1 were found to describe an
> architecture (a retained `media_id` mirror, a `helpers/gallery.js` module)
> that was never actually shipped — the real migration
> (`20260726180452_add_media_attachments`) drops `media_id` in the same
> migration that creates the join tables, and the helper module is
> `helpers/attachments.js`. This revision uses the real, current file names and
> architecture wherever it touches them; reconciling the rest of D1's narrative
> and the older Stage 1 section against shipped code is explicitly out of scope
> here and left for a dedicated follow-up.

**Input**: Feature specification from `/specs/006-multi-media-gallery/spec.md`

## Summary

Allow a shout or comment to carry an ordered gallery of up to five **images**
(GIFs and video excluded — see the 2026-07-31 revision) instead of a single
attachment, rendered inline as a single-item-at-a-time carousel: a fixed
1:1-square, letterboxed frame with edge-anchored arrows, a position indicator,
and infinite looping navigation, opening on the first uploaded item on a fresh
mount and staying synced to wherever the fullscreen viewer was left otherwise
(2026-08-15 revision — see spec.md Session 2026-08-15).
Activating the currently-displayed item still opens the existing single-image
fullscreen viewer. There is no separate fullscreen-specific
navigation layer — the previously-planned Stage 2 is dropped, since the inline
carousel already delivers that browsing value.

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
EXIF orientation) is reused as-is, permanently, with no multi-item navigation
ever added to it. Activating the carousel's currently-displayed item simply
opens `Lightbox` on that one item — this is what makes every image viewable
without writing a second viewer. *(Revised 2026-07-31 — the previous plan for
Stage 2 to extend `Lightbox` with inter-item navigation is dropped along with
Stage 2 itself; the inline carousel, not the fullscreen viewer, is where
looping/arrows/position-indicator now live — see D20.)* As of the 2026-07-30
revision, `Lightbox` is also opened from a **pending** (not-yet-uploaded) tile
during composing, pointed at the file's local object URL instead of a server
URL — no changes to `Lightbox.tsx` itself are needed for this, since it only
ever needed a `src` string, and that remains true for the carousel too.

As of the 2026-07-30 revision, file upload no longer happens at selection time.
`useMediaAttachments.ts` holds selected files client-side (object URL preview
only) and defers the actual `POST /upload/media` calls until the user submits;
the submit is atomic — every file must upload successfully before the
shout/comment is created, otherwise nothing is posted and the whole batch can be
retried. This is a client-orchestration change only: no new endpoint, no schema
change (see D14–D16).

As of the 2026-07-31 revision, `GalleryGrid.tsx` is retired and replaced by a
new `GalleryCarousel.tsx` — a fixed-square, letterboxed, single-item-at-a-time
component with its own paging state, arrows, and position indicator (D18).
GIFs are permanently excluded from any 2+-item gallery; this turned out to be
**half-enforced already, not fully** (D19) — `api/src/helpers/attachments.js`'s
`isMultiItemEligible()` has excluded Giphy-picker GIFs (`media_type: "giphy"`)
from multi-item galleries since Stage 1 first shipped, but a directly
**uploaded** animated GIF file is stored as `media_type: "image"` (its
animated-ness lives only inside `media_meta`), so it currently passes that
same eligibility check. Closing this needs a small, real server-side change —
parsing `media_meta.animated` at the eligibility-check site, not just a doc
correction — plus the client-side gate fix (the GIF picker doesn't yet block
picking a *second* GIF once one is attached, for either GIF source) and
correcting a stale doc comment that claimed none of this was server-enforced.

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
  since `helpers/attachments.js`'s `attachMedia()` (the actual current writer —
  see the 2026-07-31 revision note above correcting this plan's earlier
  `helpers/gallery.js` reference) already writes gallery membership in one
  create-route call. The one residual gap this leaves — a create-route failure
  *after* all uploads already succeeded — is the same class of orphaned-`Media`-row
  risk the codebase already accepts for single-media today; see Complexity
  Tracking.

**Re-check after the 2026-07-31 carousel/GIF-exclusion revision**: still PASS,
no new violations — and one long-standing item actually gets *stronger*.

- **Domain: Bounded media gallery** — the constitution's own non-negotiable
  says "backend enforces the cap and the exclusivity, frontend gates as a
  secondary guard." Until now, FR-035's image/GIF exclusivity was flagged in
  Complexity Tracking as a **client-only deviation** from that rule. D19 found
  this was only half true: Giphy-picker GIFs were always server-blocked from
  multi-item galleries, but uploaded animated GIF files were not (a real gap
  in `isMultiItemEligible()`, since it only inspects `media_type`, and an
  uploaded GIF's animated-ness lives in `media_meta`). This revision closes
  that gap with an actual server-side fix, so the deviation the Complexity
  Tracking row described is retired below **because it's fixed**, not because
  it was already imaginary. The remaining work is a client-side UX gate
  (matching the constitution's
  own "frontend gates as a secondary guard" framing, correctly this time).
- **Domain constraint wording**: the amended constitution (v2.0.0) and
  `CLAUDE.md` both currently say "up to 5 images/GIFs" — inaccurate now that
  GIFs are permanently excluded from galleries. A follow-up `/docs` correction
  is required (see spec.md's Governance Note) before this revision reaches
  production; tracked as a Stage 1 deploy-gate item below, same mechanism as
  the original constitution amendment.
- **Principle V (Optimistic UI + rollback)**: unaffected. The carousel's
  paging state is pure client-side navigation over already-fetched data — there
  is no server round-trip per page-turn, so there is nothing to optimistically
  update or roll back.
- **Principle II (Russian UI)**: the position indicator ("2 / 5") is a digit
  pair, not user-facing prose requiring declension — no new plural-copy surface.

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
│   ├── Lightbox.tsx                  # Reused as-is, permanently — no multi-item nav ever added (Stage 2 dropped 2026-07-31, D20); 2026-07-30: also opened on a pending item's local object URL
│   ├── GalleryGrid.tsx               # RETIRED 2026-07-31 — deleted; replaced by GalleryCarousel.tsx
│   ├── GalleryCarousel.tsx           # NEW (2026-07-31) — fixed 1:1-square letterboxed frame, one item at a time, edge-anchored arrows, looping, position indicator (FR-012, FR-014, FR-042–FR-044); opens on index 0 on a fresh mount, controlled `index`/`onIndexChange` props keep it synced with Lightbox otherwise (2026-08-15)
│   ├── PendingMediaStrip.tsx         # NEW (2026-07-30) — bordered/divided horizontal-scroll pending-item preview, shared by both composers; renders remove-X + click-to-Lightbox per tile
│   └── EmojiPicker.tsx / GifPicker.tsx  # FR-035 gate — PERMANENT as of 2026-07-31, never lifted; gate fixed to also block a 2nd GIF once one is attached, for either GIF source (closes the client-side stacking gap; server-side gap for uploaded animated GIFs closed alongside it, see attachments.js)
├── hooks/
│   └── useMediaAttachments.ts        # NEW — shared pending-list, capacity gate; 2026-07-30: pending files hold only a local object URL until submit, per-item removal (FR-024), and atomic submit-time upload orchestration (FR-041) replace the former per-file upload-on-select behavior
├── utils/plural.ts                   # NEW — Russian declension for item counts
├── types.ts                          # + GalleryItem[] on Shout/Comment
└── tests/unit/

workers/
└── src/jobs/original-downgrade.ts    # orphan check must consider join tables
```

**Structure Decision**: Existing three-package layout (`api/`, `web/`,
`workers/`) is retained unchanged. New (original Stage 1): one backend helper,
one shared hook (`useMediaAttachments.ts`) and one utility (`plural.ts`). New
(2026-07-31): `GalleryCarousel.tsx` replaces `GalleryGrid.tsx` one-for-one at
both call sites; no other new files. Everything else is modification of
existing files.

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

**Goal**: users can attach and publish up to 5 images; readers see a
single-item-at-a-time carousel with looping navigation, edge-anchored arrows,
and a position indicator, and can open the currently-displayed item full size.
*(Revised 2026-07-31 — supersedes "readers see every image as an adaptive grid.
No inter-item navigation inside the viewer yet," which described the retired
grid and the now-dropped Stage 2.)*

**Status**: backend and composer work is already implemented and deployed
(`d85c6bb`, `e844cfa`). The 2026-07-31 revision's remaining work is the
carousel component and a client-side GIF-gate fix — see "Revision" at the top
of this file.

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
  overflow (FR-038/FR-039). Each tile is a uniform 80×80 square with letterboxed
  contents on a `th-page` background (FR-040, revised same-day 2026-07-30; unified across
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

**Also in Stage 1 — published-gallery carousel & permanent GIF exclusion
(added 2026-07-31, post-deployment feedback)**
- `GalleryGrid.tsx` is deleted. `GalleryCarousel.tsx` (NEW) replaces it
  one-for-one at both call sites in `ShoutCard.tsx` (shout body, comment
  body). Renders exactly one item at a time inside a fixed 1:1-square frame
  (FR-014) bounded by the existing per-context max height — 300px shouts /
  200px comments (FR-015, wording unchanged, now also the square's width).
  Every item is displayed via `object-contain` (never cropped or stretched),
  with `bg-th-page` filling any letterboxed gap — the same convention as
  `PendingMediaStrip.tsx`'s tiles (FR-040), so composer and reader now share
  one visual language for "how does an odd-shaped image sit in a fixed box."
- Internal paging state (`useState<number>`, starting at 0 — FR-012) plus
  forward/backward handlers implementing looping arithmetic
  (`(i + 1) % length`, `(i - 1 + length) % length` — FR-043) replace the
  grid's per-count CSS templates entirely. No CSS Grid, no `containerRatio()`
  clamping math (D12) — both retired along with `GalleryGrid.tsx`, since the
  frame no longer derives its shape from any item.
- Arrow buttons anchored to the carousel frame's own left/right edges (FR-042)
  and a position indicator ("2 / 5") at the frame's bottom (FR-044), both
  present only when `gallery.length > 1` — a 1-item post already renders via
  the untouched single-image path (FR-016), so no extra "hide for 1 item"
  branch is needed in the new component itself.
- Activating the currently-displayed item opens the **existing** `Lightbox` on
  that item (FR-036, revised wording only — same mechanism as the grid's tile
  activation, just now targeting `items[currentIndex]` instead of a clicked
  tile). No changes to `Lightbox.tsx`.
- GIF exclusion from galleries — **half-shipped already, half genuinely new**
  (D19). `attachments.js`'s `isMultiItemEligible()` already excludes
  Giphy-picker GIFs (`media_type: "giphy"`) from 2+-item galleries and has
  since Stage 1 first shipped — no change needed for that source. But a
  directly **uploaded** animated GIF file is stored as `media_type: "image"`
  with its animated-ness only inside `media_meta`, so it currently *passes*
  eligibility — a real server-side fix: extend the eligibility check (in
  `shouts.js`/`comments.js`, alongside the existing `media_type` check) to
  also parse `media_meta` for `animated: true` and reject those rows too when
  `galleryIds.length > 1`.
- Client-side gate fix, for both GIF sources: `gifPickerBlocked` (in
  `ShoutInput.tsx`) and `replyGifBlocked` (in `ShoutCard.tsx`) currently read
  `hasImages || hasVideo || isFull` and must become `hasImages || hasVideo ||
  isFull || hasGif`, so the GIF picker also closes once one GIF (uploaded or
  Giphy-sourced) is already attached — closing the "stack multiple GIFs" UX
  gap immediately, with a clear message, instead of a generic atomic-submit
  failure (FR-041) once the (now-fixed) server rejects it.
- `contracts/shout-comment-create.md`'s stale "Deliberately NOT enforced
  server-side" note (about the Stage 1–2 exclusivity gate) is corrected to
  describe the now-complete `isMultiItemEligible()` rule accurately, covering
  both GIF sources.
- Follow-up `/docs` correction: the amended constitution (v2.0.0) and
  `CLAUDE.md` both say "up to 5 images/GIFs" — narrowed to images-only wording,
  same mechanism as the original constitution amendment (T002/T003-style task).
- `GalleryGrid.test.tsx` retired; replaced by `GalleryCarousel.test.tsx`
  covering paging, looping arithmetic, frame fixity, and tile activation.
  `composerParity.test.tsx`'s grid-rendering assertions are updated to
  reference `GalleryCarousel` instead of `GalleryGrid`.

**Deploy gate**: constitution amendment + `/docs` update landed; existing
single-media content verified visually unchanged (SC-006); the 2026-07-30
composer revision additionally verified for atomic submit failure/retry and
per-item removal; the 2026-07-31 revision additionally verified for carousel
looping/frame-fixity across viewport sizes (SC-005/SC-010), the closed
GIF-stacking gap, and the second constitution/`CLAUDE.md` correction landed
before re-deployment.

### ~~Stage 2 — Navigate between items (US2, P2)~~ — RETIRED 2026-07-31

*Retired in full.* Previously: extend `Lightbox.tsx` with optional
`items`/`startIndex` props for looping inter-item navigation inside the
fullscreen viewer. Dropped — the inline carousel added to Stage 1 already
delivers looping navigation, edge-anchored arrows, and a position indicator
directly in the shout/comment body, making a second, fullscreen-specific
navigation layer redundant. `Lightbox.tsx` therefore never gains an `items`
prop; it stays exactly what it is today, permanently, for both single images
and gallery items alike. Kept here (not deleted) so `tasks.md`'s Phase 4 and
any historical references to "Stage 2" retain a stable target — see spec.md's
retired User Story 2.

### Stage 3 — Reorder (US3, P3)

**Goal**: reorder while composing.

**Scope note (narrowed 2026-07-30, narrowed again 2026-07-31)**: per-item
removal (FR-024) moved to Stage 1 as part of the composer revision. GIF-mixing
work is removed entirely — FR-026 is permanently reversed, not deferred (see
Session 2026-07-31) — so this stage now covers only reordering.

- Reorder (FR-025), optimistic with rollback per Principle V.
- Polish pass: loading/error states, transitions.

**Deploy gate**: reorder verified end-to-end in both composers (FR-025,
FR-031), including the optimistic-update/rollback path on a simulated failure.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Constitution Domain Constraint "**Single media per post/comment**" is contradicted | This is the entire feature — the user explicitly directed that the constraint be superseded. | There is no simpler alternative; the constraint *is* the thing being changed. Mitigation is procedural, not technical: amend the constitution (Sync Impact Report + **MAJOR** bump 1.0.0 → 2.0.0, since the constitution reserves MAJOR for redefinitions of binding constraints) and propagate to `CLAUDE.md`/`docs/*` via `/docs`, before Stage 1 reaches production. |
| `media_id` is **denormalized** — it mirrors the gallery's position-0 item, so the same fact lives in two places | Keeps every existing read path (`enrichFeed`, search, quote resolution, admin, downgrade job) working without modification, which is what makes a small, low-risk Stage 1 possible. | Making the join table the sole source of truth would force every read site to change in Stage 1 — precisely the big-bang change the staged rollout exists to avoid. Risk is contained by making `helpers/gallery.js` the **only** writer of both, so the invariant has exactly one enforcement point. Dropping `media_id` is viable follow-up debt once Stage 3 is stable. |
| *(Retired 2026-07-31 — see row below)* FR-035 (Stage 1–2 GIF/image exclusivity) is enforced **client-side only**, against the usual "backend enforces, frontend gates" rule | It is a temporary UX simplification, not a security or integrity boundary. The data model permits mixed galleries from Stage 1, and Stage 3 legitimizes them deliberately. | Enforcing it server-side would mean writing a validation rule in Stage 1 solely to delete it in Stage 3, and would risk rejecting content that becomes valid mid-rollout. Bypassing the gate produces a mixed gallery — which is a *supported* state, not a corrupt one, so there is no integrity risk. |
| **Correction (2026-07-31, partially resolved rather than imaginary)**: the row above was half-wrong about what was already enforced. `attachments.js`'s `isMultiItemEligible()` has restricted 2+-item galleries to `media_type: "image"` since Stage 1, which already excludes Giphy-picker GIFs (`media_type: "giphy"`) — but an uploaded animated GIF file (`media_type: "image"`, animated-ness only in `media_meta`) was NOT excluded, so a multi-item gallery containing uploaded GIFs was genuinely creatable until this revision's server-side fix (see D19, Stage 1 section above). | The uploaded-GIF gap is closed by this revision's own server-side change, not left standing. This row exists to correct the record on *why* the Complexity Tracking row above is retired: partly because it's now actually fixed, not because the deviation was already fictional. | N/A |
| *(Superseded 2026-07-30 — see row below)* Abandoned composer uploads leave orphaned `Media` rows and files, now at up to 5× the previous rate | Uploads must be persisted before shout creation because the create route takes ids, not files. | Resolved by the 2026-07-30 upload-timing revision for the common case (a composer abandoned without ever submitting now uploads nothing at all — see D14). |
| A submit that fails after some files already uploaded, and is never retried, still orphans those `Media` rows | Atomicity (FR-041) is client-orchestrated, not a server-side transaction — see Constitution Check re-check above. A true transactional guarantee would require either a combined upload+create endpoint or a two-phase commit, both rejected as disproportionate (see research D14). | This residual case is the **same order of magnitude** as the pre-existing single-media orphan risk (one abandoned upload), not the up-to-5× multiplier the original architecture would have produced — D16's retry-reuses-ids behavior prevents *retried* attempts from compounding it further. A reaping job for unreferenced `Media` rows remains the correct long-term fix and stays out of scope here. |
