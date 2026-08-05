---

description: "Task list for 006-multi-media-gallery"
---

# Tasks: Multi-Media Gallery Attachments

**Input**: Design documents from `/specs/006-multi-media-gallery/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks ARE included. `quickstart.md` explicitly enumerates the
required automated coverage per file, which constitutes an explicit request.

**Organization**: Tasks are grouped by user story. Each user story maps 1:1 onto
a production deployment stage.

> **Revised 2026-07-25** after `/speckit-analyze`. The material change: there are
> **two composers**, not one, and only the shout composer was previously tasked.
> Attachment logic is now extracted into a shared hook (research D9). Also added:
> SSE/create-response DTO coverage (D10), upload rate-limit tests (FR-008), and a
> MAJOR constitution bump.
>
> **Revised again 2026-07-26** after Stage 1 shipped (`d85c6bb`, `e844cfa`) and was
> tested. The first-item-only preview left items 2..N unviewable for the whole of
> Stage 1 — a spec defect, now fixed by an adaptive grid rendering every item, with
> each tile opening the existing viewer (research D11–D13). T001–T070 are preserved
> with their completion state; **T030 and T037 are superseded** (they shipped, then
> were made obsolete) and Phase 1b (T071–T080) carries the replacement work. Stage 2
> shrank correspondingly — it no longer unlocks viewing, only removes the
> dismiss-and-reopen round trip.
>
> **Revised again 2026-07-30** after further production feedback on the deployed
> Stage 1 build. Two composer-side changes, still entirely within Stage 1: (1)
> per-item removal (FR-024) is pulled forward from Stage 3 into effect now, plus a
> new bordered/divided pending-preview strip and click-to-`Lightbox` on pending
> items; (2) upload moves from selection-time to submit-time, atomically (research
> D14–D17). **Phase 1c (T081–T097)** carries this work. **T052 and T057 are
> superseded** — per-item removal moved out of Stage 3 into Phase 1c — and Phase 5
> is retitled/narrowed to reordering only.
>
> **Revised again 2026-07-31** — the largest revision so far. Published-gallery
> display replaces the adaptive grid with a Reddit-style single-item carousel
> (looping navigation, edge-anchored arrows, position indicator, fixed
> 1:1-square letterboxed frame), and GIFs are permanently excluded from
> multi-item galleries, reversing Stage 3's planned mixed-media work.
> **Phase 1d (T098–T112)** carries this work. **Phase 4 (US2, T041–T051) is
> retired in full** — Stage 2 is dropped, since the carousel already delivers
> its looping-navigation value inline. **Phase 5 is narrowed again**: T055,
> T056, T061, T062, T063 (all GIF-mixing) are superseded/retired; only
> reordering remains. Planning also turned up two corrections: (1) `research.md`
> D1's "retained `media_id` mirror" / `helpers/gallery.js` never actually
> shipped — the real code uses join-tables-only and `helpers/attachments.js`;
> earlier tasks below (T006, T083 area) that name `gallery.js` are historical
> and left as shipped, per explicit scope decision to fix only what this
> revision touches. (2) GIF exclusion turned out to be **half-enforced**
> already, not fully: Giphy-picker GIFs were always server-blocked from
> multi-item galleries, but uploaded animated GIF files were not — Phase 1d
> includes a real, small server-side fix for that gap (research D19), not just
> a doc correction.
>
> **Revised again 2026-08-05** — D20 is overturned per explicit user request
> (research.md addendum under D20). Phase 4 (US2) is **reinstated in modified
> form**: `Lightbox.tsx` gains gallery-mode paging (looping, edge-anchored
> arrows, position indicator, keyboard Left/Right, swipe), layered onto its
> existing zoom/pan/dismiss gesture model via dominant-axis drag
> disambiguation, rather than the standalone nav layer originally envisioned.
> `GalleryCarousel.tsx` (Phase 1d) is unchanged — it still owns inline
> paging separately; this only changes what happens once a reader opens a
> gallery item fullscreen.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task

## Path Conventions

Three-package web app, per plan.md: `api/` (Express + Prisma), `web/` (React +
Vite), `workers/` (BullMQ). Paths below are repo-root-relative.

## ⚠️ Sequencing constraint — read before scheduling

**The stories in this feature are NOT parallelizable across developers.** This
overrides the usual "different developers take different stories" strategy.

Per spec SC-009 and explicit user direction, each stage must be **deployed to
production and exercised by real users** before the next stage's implementation
begins. US2 builds directly on UI shipped in US1; US3 removes a gate that US1
installs.

| Stage | Phases | Gate before next stage |
|---|---|---|
| **Stage 1** | Phase 1 + **Phase 1b** + **Phase 1c** + **Phase 1d** + Phase 2 + Phase 3 (US1) | Deployed; constitution amended (twice — see Phase 1); single-media regression verified; carousel verified (looping, fixed frame, arrows, indicator); pending items individually removable/previewable; upload deferred to submit and atomic; GIF exclusion verified for both GIF sources, server + client |
| **Stage 2** | Phase 4 (US2) — retired 2026-07-31, **reinstated 2026-08-05** | Deployed; fullscreen paging (arrows/swipe/keyboard/looping) verified, single-image mode regression-checked |
| **Stage 3** | Phase 5 (US3, reorder only) + Phase 6 | Deployed; reorder verified end-to-end |

Parallelism marked `[P]` below is **within** a phase only.

## ⚠️ There are two composers

`web/components/ShoutInput.tsx` composes **shouts**. The **comment/reply**
composer is a separate implementation inside `web/components/ShoutCard.tsx`
(`replyMediaId`, `uploadReplyFile`, `handleReplyFileSelect`) and today has **no
drag-and-drop handler at all**. FR-031 demands identical behavior, so every
attachment task below routes through the shared `useMediaAttachments` hook
(T014) and is applied to **both** composers.

---

## Phase 1: Setup & Governance

**Purpose**: Establish a regression baseline and clear the release gate that
blocks Stage 1 from reaching production.

- [X] T001 Capture the regression baseline: run `make test-all` from the repo root and record the passing state before any change
- [X] T002 [P] Amend `.specify/memory/constitution.md` — revise the "Single media per post/comment" Domain Constraint to permit an ordered gallery of up to 5 image/GIF items while preserving gallery↔YouTube exclusivity; add a Sync Impact Report at the top; bump version 1.0.0 → **2.0.0 (MAJOR)**, since the constitution reserves MAJOR for redefinitions of binding constraints and this is a redefinition
- [X] T003 [P] Update the "Single media per post/comment" bullet in `CLAUDE.md` **by invoking the `/docs` skill** — direct edits to `CLAUDE.md` are prohibited by the constitution's Documentation Discipline rule (content should reflect T002)

**Checkpoint**: Governance cleared. **This is a release gate, not a code gate** —
T004 onward may proceed in parallel with T002/T003, but Stage 1 must not *deploy*
until both are complete.

---

## Phase 1b: Stage 1 revision — adaptive gallery grid (US1, P1) — **Stage 1** ⬅ CURRENT WORK

**Why**: Testing the deployed Stage 1 build showed that only the first item was
ever visible and the viewer was deferred to Stage 2, so items 2..N were
unviewable by anyone for the entire stage. Per Clarifications Session 2026-07-26
the inline preview becomes an adaptive grid rendering every item, and each tile
opens the existing viewer.

**Ordering**: numbered 1b because it is part of **Stage 1**, not a later stage.
Its prerequisites — Phases 2 and 3 — are already complete and deployed, so this is
the only remaining Stage 1 work and can be picked up immediately. Task IDs stay
T071–T080: they are stable identifiers, not positions, and are referenced by the
superseded T030/T037 entries below.

**Scope boundary**: presentation only. No backend, schema, DTO, upload or
`useMediaAttachments` change — all of that stands as shipped. `Lightbox.tsx` is
**not** modified here (research D13).

**Independent Test**: Post 2-, 3-, 4- and 5-image galleries; confirm each renders
the arrangement in `contracts/gallery-grid.md`, that clicking the third tile of a
4-image gallery opens that image full size, and that a comment gallery is visibly
shorter than the same gallery in a shout.

### Tests for Phase 1b

> Write first and confirm they FAIL before implementing.

- [X] T071 [P] [US1] Layout selection in `web/tests/unit/GalleryGrid.test.tsx` — 2/3/4/5 items each produce their documented arrangement and tile order matches gallery order (FR-012, U3)
- [X] T072 [P] [US1] Container shape in `web/tests/unit/GalleryGrid.test.tsx` — aspect ratio derives from `gallery[0]`, clamps at 0.5 and 2.0, and falls back to 1.0 when width/height are 0 or missing (FR-014, research D12)
- [X] T073 [P] [US1] Per-context height in `web/tests/unit/GalleryGrid.test.tsx` — the max-height prop is honoured and differs between shout (300px) and comment (200px) usage; assert it is a required prop, not a default (FR-015, U4)
- [X] T074 [P] [US1] Tile activation in `web/tests/unit/GalleryGrid.test.tsx` — activating tile *i* invokes the open handler with index *i*, and tiles are keyboard-activatable with an accessible name (FR-036)
- [X] T075 [P] [US1] Update gallery-rendering assertions in `web/tests/unit/composerParity.test.tsx` — `ShoutCard` imports `GalleryGrid` (not `GalleryPreview`) and renders it for both shout and comment bodies

### Implementation for Phase 1b

- [X] T076 [US1] Create `web/components/GalleryGrid.tsx` per `contracts/gallery-grid.md` — four CSS Grid arrangements selected by item count, container `aspect-ratio` from `gallery[0]` clamped 0.5–2.0 with 1.0 fallback, tiles `object-cover`, required `maxHeight` prop, no "+N" badge (FR-012, FR-014, FR-015; research D11/D12)
- [X] T077 [US1] Wire tile activation in `web/components/ShoutCard.tsx` to open the **existing** `Lightbox` on the activated item, passing that item's `full` URL and `orientation`; do not modify `Lightbox.tsx` (FR-036, research D13)
- [X] T078 [US1] Replace the `GalleryPreview` call sites in `web/components/ShoutCard.tsx` with `GalleryGrid` for both the shout body and the comment body, passing `maxHeight` 300 and 200 respectively and preserving the existing spoiler/NSFW static-image behaviour (FR-015, FR-031)
- [X] T079 [US1] Delete `web/components/GalleryPreview.tsx` and confirm no remaining references anywhere in `web/`
- [X] T080 [US1] Verify the single-attachment path is untouched — a 1-item gallery still renders today's single-image markup with no grid (FR-016, FR-032, SC-006)

**Checkpoint**: every attached image is visible inline and openable full size. **Re-deploy Stage 1 and validate before starting Phase 4.**

---

## Phase 1c: Stage 1 revision — pending-preview & upload-timing (US1, P1) — **Stage 1**

**Why**: Further production feedback on the deployed Stage 1 build. Per
Clarifications Session 2026-07-30: per-item removal (FR-024) is pulled forward
from Stage 3; a pending tile becomes individually clickable into the existing
`Lightbox`; the pending-preview area becomes its own bordered/divided
horizontal-scroll container at a unified 80px size; and — the larger change —
upload moves from selection-time to submit-time, with submission becoming
atomic (FR-041).

**Ordering**: numbered 1c for the same reason Phase 1b is numbered 1b — it is
part of **Stage 1**, not a later stage, and its prerequisites (Phase 2's T014
hook, Phase 3's T031/T034 composer wiring, Phase 1b's T076/T077 grid + Lightbox
wiring) are already complete and deployed, so this is the next Stage 1 work and
can be picked up immediately. It supersedes T052 and T057 from Phase 5 (see
Notes there).

**Scope boundary**: composer-only. No schema, DTO, or published-gallery display
change — `GalleryGrid.tsx` and `Lightbox.tsx`'s own code are untouched (Lightbox
is only ever passed a different kind of `src`, a local object URL instead of a
server URL — no new prop). No new API endpoint — `POST /upload/media` and the
create routes are unchanged; only client orchestration timing changes (research
D14).

**Independent Test**: Attach four images to a shout, remove the second one and
confirm no network request fires; click a pending tile and confirm the existing
viewer opens on its local preview; submit successfully and confirm uploads only
fire at that point, in parallel; then simulate one file failing at submit and
confirm nothing posts, the failure is named, everything else stays intact, and
"Try again" succeeds without re-uploading the files that already succeeded.
Repeat for the comment composer.

### Tests for Phase 1c

> Write first and confirm they FAIL before implementing.

- [X] T081 [P] [US1] Deferred upload in `web/tests/unit/useMediaAttachments.test.ts` — selecting/dropping a file does not call `POST /upload/media`; the pending item exposes only a local object URL until submit (FR-041, research D14)
- [X] T082 [P] [US1] Per-item removal in `web/tests/unit/useMediaAttachments.test.ts` — removing one pending item removes only that item, leaves the others in their existing relative order, and triggers no network call (FR-024)
- [X] T083 [P] [US1] Atomic submit success in `web/tests/unit/useMediaAttachments.test.ts` — `submit()` uploads every pending file in parallel and calls the create callback only once every upload has succeeded, passing `mediaIds` in pending order (FR-041, research D15)
- [X] T084 [P] [US1] Atomic submit failure in `web/tests/unit/useMediaAttachments.test.ts` — if any upload fails, no create callback is invoked, the pending list and composed text are left untouched, and the specific failing file(s) and reason are surfaced (FR-041)
- [X] T085 [P] [US1] Retry reuse in `web/tests/unit/useMediaAttachments.test.ts` — after a failed submit, calling `submit()` again does not re-upload pending items that already carry a `mediaId` from the prior attempt, only the failed/unattempted ones (research D16)
- [X] T086 [P] [US1] Container layout in `web/tests/unit/PendingMediaStrip.test.tsx` — bordered container with a divider, single horizontal row, horizontal scroll (not wrap) when items overflow the visible width (FR-038, FR-039)
- [X] T087 [P] [US1] Sizing in `web/tests/unit/PendingMediaStrip.test.tsx` — every tile renders in a uniform 80×80 square box regardless of shout/comment context or the item's own ratio, contents are letterboxed (not cropped/stretched) onto a `th-page` background, and the remove control's own size is unchanged from today's shipped size (FR-040, revised same-day 2026-07-30)
- [X] T088 [P] [US1] Tile activation in `web/tests/unit/PendingMediaStrip.test.tsx` — activating a tile opens `Lightbox` with that item's local object URL as `src`, with no inter-item navigation (FR-037)
- [X] T089 [P] [US1] Composer parity in `web/tests/unit/ShoutInput.test.tsx` and `web/tests/unit/ShoutCardReply.test.tsx` — `PendingMediaStrip`, per-item removal, deferred upload and atomic submit/retry behave identically in both composers (FR-031)

### Implementation for Phase 1c

- [X] T090 [US1] Rework `web/hooks/useMediaAttachments.ts` — hold each pending item as `{ id, file, objectUrl, mediaId?: string }`; remove the per-file `POST /upload/media` call from the selection/drop path (client-side type/size pre-validation stays at selection time, FR-034); add `removeItem(id)` as a pure state mutation with no network call (FR-024)
- [X] T091 [US1] Add `submit()` orchestration to `web/hooks/useMediaAttachments.ts` — upload every pending item without a `mediaId` yet, in parallel (research D15); invoke the caller's create callback only if every upload succeeds, passing `mediaIds` in pending order; on any failure, make no create call, surface a per-file error, and leave the pending list intact for retry (FR-041)
- [X] T092 [US1] Ensure `submit()` reuses previously-obtained `mediaId`s on retry in `web/hooks/useMediaAttachments.ts` — a pending item that already succeeded in a prior failed attempt must not be re-uploaded (research D16)
- [X] T093 [US1] Create `web/components/PendingMediaStrip.tsx` per `contracts/upload-orchestration.md` — bordered container with a thin divider, single horizontal row, horizontal scroll on overflow (FR-038/FR-039); uniform 80×80 square tiles with letterboxed, `th-page`-filled contents, unified across both composer contexts (FR-040, revised same-day 2026-07-30); per-item remove control at its existing visual size (FR-024); tile click opens the existing `Lightbox` on the item's local `objectUrl` (FR-037)
- [X] T094 [US1] Replace the ad hoc pending-preview markup in `web/components/ShoutInput.tsx` with `PendingMediaStrip`, wired to the hook's `removeItem`/`submit` (FR-024, FR-037, FR-038–FR-040)
- [X] T095 [US1] Replace the ad hoc pending-preview markup in the reply composer inside `web/components/ShoutCard.tsx` with `PendingMediaStrip`, identically to T094 (FR-031)
- [X] T096 [US1] Add a clear Russian-language atomic-submit-failure message and a "Try again" action to both `web/components/ShoutInput.tsx` and the reply composer in `web/components/ShoutCard.tsx`, naming the specific failing file(s) and triggering `submit()` again on retry (FR-041)
- [X] T097 [US1] Add an assertion in `web/tests/unit/useMediaAttachments.test.ts` that a permission-revoked (`is_media_allowed = false`) upload attempted during `submit()` blocks the entire submission — no partial post — matching FR-009's 2026-07-30 wording

**Checkpoint**: pending items are individually removable and individually
previewable; no upload occurs before submit; a failing submit posts nothing and
offers a retry that never re-uploads already-succeeded files. **Re-deploy Stage
1 and validate before starting Phase 1d.**

---

## Phase 1d: Stage 1 revision — published-gallery carousel & permanent GIF exclusion (US1, P1) — **Stage 1**

**Why**: Further production feedback on the deployed Stage 1 build. Per
Clarifications Session 2026-07-31: the adaptive grid is retired in favor of a
Reddit-style single-item-at-a-time carousel with looping navigation,
edge-anchored arrows, and a position indicator, inside a fixed 1:1-square
letterboxed frame. Separately, GIFs are permanently excluded from any 2+-item
gallery, reversing Stage 3's planned mixed-media work — this closes a real gap
discovered during planning: Giphy-picker GIFs were already server-blocked from
multi-item galleries, but uploaded animated GIF files were not (research D19).

**Ordering**: numbered 1d for the same reason Phases 1b/1c are lettered — part
of **Stage 1**, not a later stage, and its prerequisites (Phase 2's schema/DTO,
Phase 3's create routes, Phase 1b's `GalleryGrid`/Lightbox wiring, Phase 1c's
hook rework) are already complete and deployed, so this is the next Stage 1
work and can be picked up immediately. It retires Phase 4 (US2/Stage 2)
outright and further narrows Phase 5 (see Notes there).

**Scope boundary**: `GalleryGrid.tsx` is deleted, not extended — replaced
one-for-one by `GalleryCarousel.tsx` at both call sites. The GIF-exclusion fix
touches the create routes' eligibility check and the composer's picker-gate
condition; it does **not** touch `useMediaAttachments.ts`'s upload
orchestration (Phase 1c) or the schema (no migration — see `research.md` D19).
`Lightbox.tsx` is untouched — Stage 2 (which would have modified it) is
retired, not merely deferred.

**Independent Test**: Post 2-, 3-, 4- and 5-image galleries; confirm each opens
on its first image in a fixed-square carousel frame, that forward/backward
navigation loops at both ends, that the frame never changes size across
images of different ratios, and that a comment carousel is visibly shorter
than the same gallery in a shout. Separately: attempt to attach a second GIF
(either an uploaded file or from "Мои GIF"/Giphy search) once one is already
attached, in both composers, and confirm the picker is unavailable; then
attempt the equivalent server-side request directly and confirm it is
rejected too.

### Tests for Phase 1d

> Write first and confirm they FAIL before implementing.

- [X] T098 [P] [US1] Paging and looping in `web/tests/unit/GalleryCarousel.test.tsx` — opens on index 0; forward/backward navigation wraps at both boundaries (`(i + 1) % length`, `(i - 1 + length) % length`) (FR-012, FR-043)
- [X] T099 [P] [US1] Fixed frame in `web/tests/unit/GalleryCarousel.test.tsx` — the frame is a 1:1 square sized to the required `maxHeight` prop, identical regardless of any item's own width/height, unlike the retired grid's clamped-ratio container (FR-014)
- [X] T100 [P] [US1] Letterbox rendering in `web/tests/unit/GalleryCarousel.test.tsx` — each image renders via `object-contain` with `bg-th-page` filling any leftover space, never cropped or stretched (FR-014, mirrors research D18 and the existing `PendingMediaStrip` convention)
- [X] T101 [P] [US1] Arrow and indicator visibility in `web/tests/unit/GalleryCarousel.test.tsx` — both present only when `gallery.length > 1` (FR-042, FR-044)
- [X] T102 [P] [US1] Tile activation in `web/tests/unit/GalleryCarousel.test.tsx` — activating the currently-displayed item invokes the open handler with `currentIndex`, and the frame is keyboard-activatable with an accessible name (FR-036)
- [X] T103 [P] [US1] Extended R5 in `api/tests/integration/shouts.test.js` and `comments.test.js` — a `mediaIds` array with 2+ items where one item is an uploaded animated GIF file (`media_type: "image"`, `media_meta.animated: true`) is rejected, in addition to the pre-existing Giphy-picker-type (`media_type: "giphy"`) rejection (research D19)
- [X] T104 [P] [US1] Client GIF-picker gate in `web/tests/unit/useMediaAttachments.test.ts` or composer parity tests — `gifPickerBlocked`/`replyGifBlocked` become true once one GIF is already attached (either source), not only when an image is attached (research D19)
- [X] T105 [P] [US1] Update `web/tests/unit/composerParity.test.tsx` — assertions reference `GalleryCarousel` instead of `GalleryGrid`; the GIF-gate assertion covers the `hasGif` condition

### Implementation for Phase 1d

- [X] T106 [US1] Create `web/components/GalleryCarousel.tsx` per `contracts/gallery-carousel.md` — fixed 1:1-square frame bounded by the required `maxHeight` prop; `useState<number>` current index starting at 0; forward/backward handlers with modulo looping arithmetic (FR-043); arrow controls anchored to the frame's own edges (FR-042); position indicator (FR-044); every item rendered via `object-contain` with `bg-th-page` letterbox fill (FR-014); no `animated`/`gif`/`staticOnly` branching, since galleries are images-only (research D18)
- [X] T107 [US1] Delete `web/components/GalleryGrid.tsx` (its CSS Grid templates and `containerRatio()` clamping, research D11/D12) and `web/tests/unit/GalleryGrid.test.tsx`; confirm no remaining references anywhere in `web/`
- [X] T108 [US1] Replace the `GalleryGrid` call sites in `web/components/ShoutCard.tsx` (shout body, comment body) with `GalleryCarousel`, passing the existing `maxHeight` 300/200 and preserving spoiler/NSFW behaviour (FR-015, FR-031)
- [X] T109 [US1] Extend the multi-item eligibility check used in `api/src/routes/shouts.js` / `comments.js` (backing `isMultiItemEligible()` in the attachment-persistence helper) to also parse each candidate media's `media_meta` and reject any row with `animated: true` when the gallery has 2+ items — closes the uploaded-GIF gap; the existing Giphy-picker (`media_type: "giphy"`) rejection is unchanged (FR-035, research D19)
- [X] T110 [US1] Fix `gifPickerBlocked` in `web/components/ShoutInput.tsx` and `replyGifBlocked` in `web/components/ShoutCard.tsx` to also include `hasGif` in their blocking condition (`hasImages || hasVideo || isFull` → `hasImages || hasVideo || isFull || hasGif`), so the GIF picker closes once one GIF — either source — is already attached (FR-035, research D19)
- [X] T111 [US1] Correct the stale "Deliberately NOT enforced server-side" note in `contracts/shout-comment-create.md`'s R5 to describe the now-complete eligibility check (both GIF sources)
- [X] T112 [US1] Follow-up constitution/`CLAUDE.md` correction: revise the "up to 5 images/GIFs" wording (from the original T002/T003 amendment) to describe an images-only gallery — amend `.specify/memory/constitution.md` directly (same as T002) and update `CLAUDE.md` **by invoking the `/docs` skill only** (same as T003, direct edits prohibited)

**Checkpoint**: the carousel replaces the grid in production; GIF exclusion is
enforced for both GIF sources, server-side and client-side; the second
constitution/`CLAUDE.md` correction has landed. **Re-deploy Stage 1 and
validate before starting Phase 5** (Phase 4/Stage 2 is retired — there is
nothing to deploy between Stage 1 and Stage 3 anymore).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Data layer, DTO shape, worker correctness and the shared attachment
hook. Every user story depends on this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add `ShoutMedia` and `CommentMedia` models to `api/prisma/schema.prisma` exactly per data-model.md — composite PKs `@@id([shout_id, position])` and `@@id([comment_id, position])` respectively, `@@unique([shout_id, media_id])` / `@@unique([comment_id, media_id])`, both indexes on each, and back-relations on `Shout`, `Comment` and `Media`
- [X] T005 Create migration `add_media_galleries` under `api/prisma/migrations/` — table DDL plus the **image-only** backfill `INSERT` statements from data-model.md (depends on T004)
- [X] T006 Create `api/src/helpers/gallery.js` exposing `attachGallery(tx, parentType, parentId, mediaIds)` — writes join rows at positions `0..n-1` and mirrors `mediaIds[0]` into the parent's `media_id` inside one Prisma transaction, enforcing Invariants I1 and I2; this module is the **sole permitted writer** of both the join tables and `media_id`
- [X] T007 [P] Add `mediaIds: z.array(z.string().uuid()).min(1).max(5).optional()` to the shout and comment create schemas in `api/src/helpers/validation.js`
- [X] T008 [P] Add `buildGallery(rows)` to `api/src/helpers/media.js`, mapping ordered join rows through the existing `buildMedia()` so each item inherits `orientation` / `animated` / `gif` handling unchanged
- [X] T009 Batch-load galleries in `enrichFeed()` in `api/src/helpers/feed.js` — one `findMany` with `shout_id: { in: <page ids> }` ordered by `position`, grouped in memory, emitting `gallery` **only when length > 1**; must not introduce an N+1 (depends on T008)
- [X] T010 [P] Extend orphan detection in `workers/src/jobs/original-downgrade.ts` so a media row referenced only as a non-preview gallery item is not treated as orphaned — add join-table lookups alongside the existing `liveShout` / `liveComment` checks (research D7)
- [X] T011 [P] Add a `GalleryItem` type (the `buildMedia()` wire shape) and `gallery?: GalleryItem[]` to the `Shout` and `Comment` interfaces in `web/types.ts` — **do not name it `ShoutMedia`**, which is already the Prisma join-row model and would collide
- [X] T012 [P] Create `web/utils/plural.ts` with a Russian declension helper for item counts (`1 файл` / `2 файла` / `5 файлов`), per Constitution Principle II — new directory
- [X] T013 [P] Add unit tests for the declension helper in `web/tests/unit/plural.test.ts` covering the 1 / 2–4 / 5+ / 11–14 cases (Constitution Principle II)
- [X] T014 Create `web/hooks/useMediaAttachments.ts` — shared pending-list state, the pre-upload capacity gate (FR-033) and per-file upload orchestration with per-file error reporting (FR-034), per contracts/upload-orchestration.md; consumed by **both** composers so FR-031 parity is structural (research D9). Depends on T012

**Checkpoint**: Schema, DTO, worker and the shared attachment hook are ready. User story work can begin.

---

## Phase 3: User Story 1 - Attach several images to one shout or comment (Priority: P1) 🎯 MVP — **Stage 1**

**Goal**: Users can attach and publish up to 5 images to **both** shouts and comments; readers see the first image plus a count badge.

**Independent Test**: Compose a shout with three images selected in one action and, separately, a comment with four images dropped at once; publish both and confirm from another account that each shows one preview image plus an indicator of additional items, with all items stored in order.

### Tests for User Story 1

> Write these first and confirm they FAIL before implementing.

- [X] T015 [P] [US1] Gallery creation rules in `api/tests/integration/shouts.test.js` — `mediaId` + `mediaIds` together rejected (R1); 5 ids accepted; 6 rejected (R2); `mediaIds` + `youtubeUrl` rejected (R3); unknown id rejected (R4); non-image media rejected (R5); duplicate ids rejected (R6)
- [X] T016 [P] [US1] Invariant I1 assertion in `api/tests/integration/shouts.test.js` — after every create path, the shout's `media_id` equals the `position = 0` join row
- [X] T017 [P] [US1] Identical rule coverage for comments in `api/tests/integration/comments.test.js`, proving FR-031 parity
- [X] T018 [P] [US1] DTO contract in `api/tests/integration/feed.test.js` — `gallery` present with 2+ items and **absent** with 1 (FR-016); `gallery[0]` deep-equals `media` (G1); order stable across requests (G2)
- [X] T019 [P] [US1] Regression guard in `api/tests/integration/feed.test.js` — pre-existing single-media shouts and comments serialize identically after the migration (FR-032, SC-006)
- [X] T020 [P] [US1] Create-response and SSE payload shape in `api/tests/integration/shouts.test.js` and `api/tests/integration/comments.test.js` — the inline DTO returned from create and broadcast over SSE also carries `gallery`, satisfying G1 (research D10)
- [X] T021 [P] [US1] Multi-file upload rate limiting in `api/tests/integration/upload.test.js` — `uploadLimiter` behavior verified in **both authenticated and unauthenticated** states (FR-008; a constitution workflow MUST)
- [X] T022 [P] [US1] Media restriction in `api/tests/integration/upload.test.js` — a user with `is_media_allowed = false` has every file in a multi-file attempt rejected at upload time, so no gallery can be formed (FR-009 as reworded)
- [X] T023 [P] [US1] Capacity gate in `web/tests/unit/useMediaAttachments.test.ts` — an over-limit action uploads nothing and leaves the existing pending selection untouched (FR-033); also assert that adding a 2nd item implicitly forms a gallery with no separate action (FR-003)
- [X] T024 [P] [US1] Partial failure in `web/tests/unit/useMediaAttachments.test.ts` — successful files stay attached while each failure is reported with its filename and reason (FR-034)
- [X] T025 [P] [US1] Video handling in `web/tests/unit/useMediaAttachments.test.ts` — a video inside a multi-file batch is rejected and reported, while a lone video still follows the existing single-attachment path (FR-028)
- [X] T026 [P] [US1] Composer parity in `web/tests/unit/ShoutInput.test.tsx` and `web/tests/unit/ShoutCardReply.test.tsx` — multi-select, multi-file drop and the FR-035 GIF gate behave identically in the shout composer and the comment composer (FR-004, FR-005, FR-031, FR-035)

### Implementation for User Story 1

- [X] T027 [US1] Accept `mediaIds` in `api/src/routes/shouts.js` — apply rules R1–R7 from contracts/shout-comment-create.md in order, delegating all persistence to `attachGallery()`; keep the existing `mediaId` path working as a 1-item gallery
- [X] T028 [US1] Accept `mediaIds` in `api/src/routes/comments.js` with identical rules and identical Russian error copy (FR-031)
- [X] T029 [US1] Emit `gallery` from the inline create-response DTO in `api/src/routes/shouts.js` (~line 316) and `api/src/routes/comments.js` (~line 148) via `buildGallery()`, so SSE-broadcast shouts and comments carry the gallery without a refresh (research D10)
- [X] T030 [P] [US1] ~~Create `web/components/GalleryPreview.tsx` — first item + "+N" badge~~ — **SUPERSEDED 2026-07-26 by T076.** Shipped, then obsoleted by the grid redesign; FR-013 was removed and the component is deleted in T079. The badge-misplacement defect found in the deployed build is retired with it, not fixed.
- [X] T031 [US1] Rewire `web/components/ShoutInput.tsx` onto `useMediaAttachments`, replacing the single `mediaId` state; add `multiple` to the file input and extend the existing drop handler to accept multiple files (FR-004, FR-005)
- [X] T032 [US1] Add the FR-035 GIF/image mutual-exclusivity gate in `web/components/ShoutInput.tsx` and the picker entry point in `web/components/EmojiPicker.tsx` — client-side only, with a comment naming its Stage 3 removal
- [X] T033 [US1] Submit `mediaIds` as an ordered array from `web/components/ShoutInput.tsx`, preserving the existing single-`mediaId` and `youtubeUrl` paths
- [X] T034 [US1] Rewire the reply composer in `web/components/ShoutCard.tsx` onto `useMediaAttachments`, replacing `replyMediaId` / `uploadReplyFile` / `handleReplyFileSelect` (~lines 1024–1200) and adding `multiple` to the reply file input at ~line 1767
- [X] T035 [US1] Add a drag-and-drop handler to the reply composer in `web/components/ShoutCard.tsx` — it has **none today**, and FR-005 + FR-031 require drop support for comments (US1 acceptance scenario 2)
- [X] T036 [US1] Apply the FR-035 gate and `mediaIds` array submission to the reply composer in `web/components/ShoutCard.tsx` (~line 1233), matching T032/T033 exactly
- [X] T037 [US1] ~~Render `GalleryPreview` from `web/components/ShoutCard.tsx`~~ — **SUPERSEDED 2026-07-26 by T078**, which renders `GalleryGrid` instead and passes the per-context max height.
- [X] T038 [US1] Add the video rule to `specs/006-multi-media-gallery/contracts/upload-orchestration.md` and implement it in `web/hooks/useMediaAttachments.ts` — a video within a multi-file batch is rejected and reported; a lone video keeps today's single-attachment path (FR-028)
- [X] T039 [US1] Add a `visibility_tag` assertion in `api/tests/integration/shouts.test.js` confirming spoiler/NSFW still applies to the whole gallery through the `media_id` path with no logic change (FR-030)
- [X] T040 [US1] Add an integration assertion in `api/tests/integration/shouts.test.js` and `comments.test.js` that the edit routes reject `mediaIds`, guarding gallery immutability against regression (FR-029)

**Checkpoint (original)**: US1 shipped for both shouts and comments — reached
2026-07-25, commits `d85c6bb` / `e844cfa`.

---

## ~~Phase 4: User Story 2 - Navigate between gallery items (Priority: P2)~~ — RETIRED 2026-07-31, **REINSTATED in modified form 2026-08-05**

*Retired in full, never started (all tasks below were still `[ ]`).* Stage 2's
entire value — looping navigation, edge-anchored arrows, a position indicator
— is now delivered by Phase 1d's `GalleryCarousel.tsx`, inline in the
shout/comment body, before a reader ever opens anything fullscreen. Building a
second, fullscreen-specific navigation layer on top would duplicate that
capability for no real benefit (see `research.md` D20). `Lightbox.tsx`
therefore never gains an `items`/`startIndex` prop — it keeps its existing
single-`src` signature permanently. Kept here, not deleted, so historical
references retain a stable target (see `spec.md`'s retired User Story 2).

**Reinstated 2026-08-05**: D20 was overturned per explicit user request — see
`research.md`'s addendum under D20. T041/T043–T046/T048–T050 below are
implemented, in modified form (dominant-axis drag disambiguation layered onto
`Lightbox.tsx`'s existing zoom/pan/dismiss model, rather than the originally
imagined standalone nav layer). T042 is covered by a new "single-image mode
is unaffected" regression block in `Lightbox.test.tsx`. T047 and T051 stay
retired — never gallery-specific to begin with.

- [X] ~~T041 [P] [US2] Gallery navigation in `web/tests/unit/Lightbox.test.tsx`~~ — RETIRED 2026-07-31, **REINSTATED 2026-08-05**: covered by the new "gallery mode: paging and looping" / "pointer-swipe navigation" / "dominant-axis disambiguation" blocks in `Lightbox.test.tsx`
- [X] ~~T042 [P] [US2] Regression guard in `web/tests/unit/Lightbox.test.tsx`~~ — RETIRED 2026-07-31, **REINSTATED 2026-08-05**: covered by the "single-image mode is unaffected" block — no `items` prop ⇒ no prev/next/indicator/track in the DOM
- [X] ~~T043 [US2] Add optional `items`/`startIndex` props to `web/components/Lightbox.tsx`~~ — RETIRED 2026-07-31, **REINSTATED 2026-08-05** as implemented (gallery mode gated on `items.length > 0`; `GalleryCarousel.tsx` is unchanged, still owns inline paging separately)
- [X] ~~T044 [US2] Add prev/next controls anchored to the screen edges in `Lightbox.tsx`~~ — RETIRED 2026-07-31, **REINSTATED 2026-08-05**: edge-anchored arrows, hidden on coarse pointers (same convention as `GalleryCarousel`)
- [X] ~~T045 [US2] Implement looping navigation in `Lightbox.tsx`~~ — RETIRED 2026-07-31, **REINSTATED 2026-08-05**
- [X] ~~T046 [US2] Add the position indicator to `Lightbox.tsx`~~ — RETIRED 2026-07-31, **REINSTATED 2026-08-05**
- [ ] ~~T047 [US2] Ensure each item renders letterboxed, not cropped, in `Lightbox.tsx`~~ — **RETIRED 2026-07-31** — this was never gallery-specific; it describes `Lightbox`'s existing single-image baseline behaviour, unaffected by any of this feature's stages
- [X] ~~T048 [US2] Add keyboard Left/Right navigation in `Lightbox.tsx`~~ — RETIRED 2026-07-31, **REINSTATED 2026-08-05**
- [X] ~~T049 [US2] Gate horizontal swipe on `zoomLevel.current === 1` in `Lightbox.tsx`~~ — RETIRED 2026-07-31, **REINSTATED 2026-08-05** in modified form: pan-while-zoomed keeps first priority in `onPointerMove`/`onPointerUp`; paging only ever evaluated once `zoomLevel.current <= 1`
- [X] ~~T050 [US2] Upgrade the tile handler to pass `gallery` + `startIndex` to `Lightbox`~~ — RETIRED 2026-07-31, **REINSTATED 2026-08-05**: `ShoutCard.tsx`'s shout- and comment-level gallery `Lightbox` call sites now pass `items`/`startIndex` instead of a single derived `src`/`orientation`
- [ ] ~~T051 [US2] Coverage that scroll position is preserved on dismiss~~ — **RETIRED 2026-07-31** — this was never gallery-specific either; `useScrollLock` behaviour is an existing baseline, not new work this feature introduces

**Checkpoint**: Reinstated 2026-08-05 — `Lightbox.tsx` gallery mode ships
alongside Stage 1's `GalleryCarousel.tsx`, both independently deployable
(gallery mode only changes what happens once a `GalleryCarousel` tile is
activated).

---

## Phase 5: User Story 3 - Reorder the gallery before posting (Priority: P3) — **Stage 3**

**Scope narrowed 2026-07-30**: per-item removal (FR-024) moved to Phase 1c —
see T082/T090 there. **Narrowed again 2026-07-31**: GIF-mixing work is removed
entirely — FR-026 is permanently reversed, not deferred (see spec.md Session
2026-07-31 and `research.md` D19) — so this phase now covers only reordering.

**Goal**: Reorder while composing. Both composers.

**Independent Test**: Attach four images, move the last to the front, publish, and confirm the gallery contains exactly the intended items in the intended order — verified in both the shout and comment composers.

**Depends on**: Stage 1 (through Phase 1d) deployed and validated in production — Stage 2 no longer exists as an intervening gate (retired, see Phase 4).

### Tests for User Story 3

- [ ] ~~T052 [P] [US3] Removal behavior in `web/tests/unit/useMediaAttachments.test.ts`~~ — **SUPERSEDED 2026-07-30 by T082**, before ever being started. Per-item removal moved out of Stage 3 into Phase 1c.
- [ ] T053 [P] [US3] Reordering in `web/tests/unit/useMediaAttachments.test.ts` — the reordered first item becomes the published preview (FR-025)
- [ ] T054 [P] [US3] Rollback in `web/tests/unit/useMediaAttachments.test.ts` — a failed reorder reverts the pending list to its prior state (Constitution Principle V)
- [ ] ~~T055 [P] [US3] Mixed galleries in `api/tests/integration/shouts.test.js`~~ — **RETIRED 2026-07-31**, before ever being started. FR-026 (mixed image+GIF galleries) is permanently reversed, not merely deferred — see T103 for the opposite assertion (GIFs are rejected from galleries, unconditionally).
- [ ] ~~T056 [P] [US3] Restriction parity in `api/tests/integration/gifs.test.js`~~ — **RETIRED 2026-07-31**, before ever being started. Moot: since GIFs can never join a gallery, feature 005's GIF-upload restriction has nothing gallery-specific left to test here — it continues to apply to single-GIF attachments, already covered by feature 005's own tests.

### Implementation for User Story 3

- [ ] ~~T057 [US3] Add per-item removal to `web/hooks/useMediaAttachments.ts`~~ — **SUPERSEDED 2026-07-30 by T090**, before ever being started. Implemented in Phase 1c instead, available to both composers from Stage 1 onward.
- [ ] T058 [US3] Add reordering of pending items to `web/hooks/useMediaAttachments.ts`, with the first item driving the preview (FR-025)
- [ ] T059 [US3] Make reorder optimistic with guaranteed rollback on failure in `web/hooks/useMediaAttachments.ts` (Constitution Principle V)
- [ ] T060 [US3] Add the reorder UI affordance to both `web/components/ShoutInput.tsx`'s and the reply composer's `PendingMediaStrip` usage in `web/components/ShoutCard.tsx` (FR-025, FR-031) — remove is already available from Phase 1c
- [ ] ~~T061 [US3] Remove the FR-035 gate, enabling free image+GIF mixing~~ — **RETIRED 2026-07-31**, before ever being started. FR-035 is now permanent (see Phase 1d, T110) — this gate is never removed.
- [ ] ~~T062 [US3] Allow selecting a GIF into an existing gallery in `web/components/GifPicker.tsx`~~ — **RETIRED 2026-07-31**, before ever being started. A GIF can never join an existing (2+-item) gallery — see Phase 1d.
- [ ] ~~T063 [US3] Verify animated GIF items animate correctly inside mixed galleries~~ — **RETIRED 2026-07-31**, before ever being started. Mixed galleries can never exist; `GalleryCarousel.tsx` (T106) deliberately carries no animated/GIF-handling code at all.

**Checkpoint**: US1 (through Phase 1d) and US3 are both independently
functional. US2/Stage 2 is retired, not a gap — there is nothing between them.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T064 [P] Update `docs/api.md` and `docs/web.md` for the gallery DTO, the `mediaIds` create contract, the shared hook and the new components — **via the `/docs` skill only**
- [ ] T065 [P] Audit all new Russian copy for correct declensions and pluralization across `web/hooks/useMediaAttachments.ts`, `web/components/ShoutInput.tsx`, `web/components/ShoutCard.tsx`, `web/components/GalleryCarousel.tsx` (replaces the retired `GalleryGrid.tsx`) and `web/components/Lightbox.tsx` (Constitution Principle II)
- [ ] T066 [P] Add an automated worker test in `workers/tests/` asserting that **every** item of a gallery is converted by the 24-hour downgrade and none is treated as orphaned (FR-010, SC-008, research D7)
- [ ] T067 Confirm no N+1 was introduced — verify a feed page containing several galleries issues exactly one additional query, per research D5
- [ ] T068 Run the full `quickstart.md` validation pass for all three stages, including the cross-stage 24-hour compression check
- [ ] T069 Record post-Stage-1 monitoring follow-ups in `specs/006-multi-media-gallery/research.md` — `uploadLimiter` headroom (5 units per gallery against 100/10 min) and orphaned-upload growth rate
- [ ] T070 Run `make test-all` and confirm the suite is green against the T001 baseline

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup & Governance)**: no dependencies — start immediately. T002/T003 gate the Stage 1 **deploy**, not Phase 2's start
- **Phase 2 (Foundational)**: depends on T001 — **blocks all user stories**
- **Phase 3 (US1)**: depends on Phase 2 — ✅ complete, shipped
- **Phase 1b (US1 revision)**: despite its number, depends on Phases 2 and 3 (both complete). Presentation-only; touches
  `GalleryGrid.tsx` (new) and the two call sites in `ShoutCard.tsx`. Nothing in
  Phases 1–2 needs revisiting, and no redeploy of the API is required.
- **Phase 1c (US1 revision)**: despite its number, depends on Phase 2's T014 hook
  and Phase 3's T031/T034 composer wiring (both complete). Composer-only; no API
  redeploy required — only the client orchestration in `useMediaAttachments.ts`
  and the new `PendingMediaStrip.tsx` change.
- **Phase 1d (US1 revision)**: despite its number, depends on Phase 2's schema/DTO,
  Phase 3's create routes, Phase 1b's grid/Lightbox wiring, and Phase 1c's hook
  rework (all complete). Touches `GalleryCarousel.tsx` (new, replacing
  `GalleryGrid.tsx`), the create routes' eligibility check, and the composers'
  GIF-picker gate condition.
- ~~**Phase 4 (US2)**~~: **RETIRED 2026-07-31** — no dependency to track; this
  phase never starts.
- **Phase 5 (US3)**: depends on Phase **1d** being deployed to production, not
  Phase 4 (revised — Stage 2 no longer exists as an intervening gate)
- **Phase 6 (Polish)**: depends on Phase 5

### User Story Dependencies

Unlike the usual Spec Kit pattern, these stories are **strictly sequential** —
see the sequencing constraint at the top. *(Revised 2026-07-31 — US2 is
retired; US3 no longer "removes the FR-035 gate that US1 installs," since
FR-035 is now permanent. US3's only remaining dependency on US1 is the shared
`useMediaAttachments.ts` hook and `PendingMediaStrip.tsx` it reorders within.)*

### Within Each User Story

- Tests are written first and must fail before implementation
- Schema → helpers → hook → routes → components
- `api/src/helpers/gallery.js` (T006) must exist before T027/T028 — *(historical
  reference; the actual shipped module is `api/src/helpers/attachments.js`, see
  the 2026-07-31 revision banner above — T006's own file path is left as
  originally written since Phase 2 already shipped)*
- `web/utils/plural.ts` (T012) must exist before T014
- `web/hooks/useMediaAttachments.ts` (T014) must exist before T031 and T034
- `web/hooks/useMediaAttachments.ts`'s Phase 1c rework (T090–T092) must exist before `PendingMediaStrip.tsx` (T093) and its two call sites (T094/T095)
- `web/components/GalleryCarousel.tsx` (T106) must exist before its call-site swap (T108); T107's deletion of `GalleryGrid.tsx` should happen only after T108 confirms no remaining references

### Critical Path

```text
T001 → T004 → T005 → T006 → T009 → T014 → T027 → T031 → T034 → T035 → T037
         (T002/T003 gate the deploy, not the code)
         └──────────── Stage 1 (initial) deploy ────────────┘
                              → T090 → T091 → T093 → T094 → T095
                              └──── Stage 1 (1c revision) deploy ────┘
                                          → T106 → T108 → T109 → T110 → T112
                                          └──── Stage 1 (1d revision) deploy ────┘
                                                      → T058 → T059 → T060
```

### Parallel Opportunities

- **Phase 1**: T002 and T003 are `[P]` and run alongside all of Phase 2
- **Phase 2**: T007, T008, T010, T011, T012, T013 are independent files → run together (T004→T005→T006 and T012→T014 stay serial)
- **Phase 3 tests**: T015–T026 are all `[P]` → write the entire test suite in one pass
- **Phase 3 implementation**: T030 (superseded) was `[P]`; the `ShoutInput.tsx` chain (T031–T033) and the `ShoutCard.tsx` chain (T034–T037) are each internally serial but **can run in parallel with each other**, since the shared hook removes the coupling
- **Phase 1c tests**: T081–T089 are all `[P]` → write the entire test suite in one pass
- **Phase 1c implementation**: T090–T092 all touch `useMediaAttachments.ts` and MUST stay serial; T093 (`PendingMediaStrip.tsx`) can start once T090's shape is settled; T094/T095 (the two composer call sites) **can run in parallel with each other** once T093 exists, same reasoning as Phase 3
- **Phase 1d tests**: T098–T105 are all `[P]` → write the entire test suite in one pass
- **Phase 1d implementation**: T106–T108 (the carousel component and its two call sites) are serial and independent of T109–T111 (the server-side eligibility fix and its doc correction), which can proceed **in parallel** with the frontend chain; T110 (client gate) can start as soon as T109's server behavior is settled, or in parallel if the team trusts the contract; T112 (governance) is independent of all of it
- ~~**Phase 4**~~: retired — no parallel opportunities to track
- **Phase 5**: T053–T054 `[P]`; T058–T059 all touch the hook and MUST stay serial
- **Phase 6**: T064, T065, T066 `[P]`

---

## Parallel Example: User Story 1 tests

```bash
# All twelve US1 test tasks touch different files or suites — write them together:
Task: "Gallery creation rules R1–R6 in api/tests/integration/shouts.test.js"
Task: "Invariant I1 assertion in api/tests/integration/shouts.test.js"
Task: "Comment parity in api/tests/integration/comments.test.js"
Task: "DTO contract in api/tests/integration/feed.test.js"
Task: "Single-media regression guard in api/tests/integration/feed.test.js"
Task: "Create-response + SSE gallery shape in shouts/comments tests"
Task: "Upload rate limiting, both auth states, in api/tests/integration/upload.test.js"
Task: "Restricted-user multi-upload rejection in api/tests/integration/upload.test.js"
Task: "Capacity gate + implicit gallery in web/tests/unit/useMediaAttachments.test.ts"
Task: "Partial failure in web/tests/unit/useMediaAttachments.test.ts"
Task: "Video-in-batch rejection in web/tests/unit/useMediaAttachments.test.ts"
Task: "Composer parity in ShoutInput.test.tsx and ShoutCardReply.test.tsx"
```

> Note: tests run **sequentially** at execution time (Constitution: Test
> Isolation). The parallelism above is about authoring them, not running them.

## Parallel Example: Phase 1c tests

```bash
# All nine Phase 1c test tasks touch two suites — write them together:
Task: "Deferred upload in web/tests/unit/useMediaAttachments.test.ts"
Task: "Per-item removal in web/tests/unit/useMediaAttachments.test.ts"
Task: "Atomic submit success in web/tests/unit/useMediaAttachments.test.ts"
Task: "Atomic submit failure in web/tests/unit/useMediaAttachments.test.ts"
Task: "Retry reuse of already-obtained mediaIds in web/tests/unit/useMediaAttachments.test.ts"
Task: "Container layout in web/tests/unit/PendingMediaStrip.test.tsx"
Task: "Sizing in web/tests/unit/PendingMediaStrip.test.tsx"
Task: "Tile activation in web/tests/unit/PendingMediaStrip.test.tsx"
Task: "Composer parity in ShoutInput.test.tsx and ShoutCardReply.test.tsx"
```

## Parallel Example: Phase 1d tests

```bash
# All eight Phase 1d test tasks touch two suites — write them together:
Task: "Paging and looping in web/tests/unit/GalleryCarousel.test.tsx"
Task: "Fixed frame in web/tests/unit/GalleryCarousel.test.tsx"
Task: "Letterbox rendering in web/tests/unit/GalleryCarousel.test.tsx"
Task: "Arrow and indicator visibility in web/tests/unit/GalleryCarousel.test.tsx"
Task: "Tile activation in web/tests/unit/GalleryCarousel.test.tsx"
Task: "Extended R5 (uploaded-GIF rejection) in api/tests/integration/shouts.test.js and comments.test.js"
Task: "Client GIF-picker gate in web/tests/unit/useMediaAttachments.test.ts"
Task: "composerParity.test.tsx updates for GalleryCarousel and the hasGif gate"
```

---

## Implementation Strategy

### MVP scope — Stage 1 (Phases 1, 1b, 1c, 1d, 2, 3 — T001–T040, T071–T080, T081–T097, T098–T112)

1. Phase 1: baseline, plus the constitution amendment and `/docs` update that gate the deploy
2. Phase 2: schema, migration, gallery helper, DTO, worker fix, **shared attachment hook**
3. Phase 3: create routes + SSE DTO + both composers + preview UI
4. Phase 1b: adaptive grid, every published item viewable
5. Phase 1c: deferred/atomic upload, per-item removal, pending-preview strip
6. Phase 1d: single-item carousel replacing the grid, permanent GIF exclusion (both sources)
7. **STOP and VALIDATE**: run `quickstart.md` Stage 1 checks, especially the single-media regression (SC-006), comment-composer parity (FR-031), the 2026-07-30 network-trace checks (no upload before submit; retry skips already-uploaded files), and the 2026-07-31 carousel/GIF-exclusion checks (fixed-frame letterboxing at mixed ratios; both GIF sources blocked server- and client-side; second constitution/`CLAUDE.md` correction landed)
8. **Deploy to production** and let real users exercise it

This alone delivers the feature's core value: users can publish multi-image
shouts **and comments**, and readers can see and browse a gallery.

### Incremental delivery

- **Stage 1** (T001–T040) → deployed 2026-07-25 → validation exposed the
  viewability defect → **Stage 1 revision** (T071–T080) → re-deploy → validate →
  further feedback exposed the composer-timing/removal papercuts →
  **Stage 1 revision 2** (T081–T097) → re-deploy → validate → further feedback
  requested a carousel instead of a grid and permanent GIF exclusion →
  **Stage 1 revision 3** (T098–T112) → re-deploy → validate
- ~~**Stage 2** (T041–T051)~~ → **retired**, never implemented — the Phase 1d
  carousel already delivers looping navigation inline
- **Stage 3** (T053, T054, T058–T060) + polish (T064–T070) → deploy → validate
  reordering (no mixed-gallery validation — that direction is permanently
  reversed)

### Team strategy

Because stages are gated on production deployment, **splitting stories across
developers does not shorten the calendar**. Within Stage 1, the shared hook
creates a genuine split: once T014 lands, one developer takes the `api/` chain
(T027–T029) while another takes `ShoutInput.tsx` (T031–T033) and a third takes
the `ShoutCard.tsx` reply composer (T034–T037), all against the same hook
contract. Within Phase 1d, the carousel component (T106–T108) and the
GIF-exclusion fix (T109–T111) are independent enough for two developers to
split without either blocking the other.

---

## Notes

- `[P]` = different files, no dependencies
- Attachment logic lives in `useMediaAttachments.ts`, **not** in either composer — this is what keeps FR-031 parity from drifting across three stages
- `api/src/helpers/gallery.js` is the only module permitted to write `media_id` or the join tables (Invariant I1) — *(historical wording; the actual shipped module is `api/src/helpers/attachments.js`, and it has never retained `media_id` at all — see the 2026-07-31 revision banner. Left as originally written per explicit scope decision to fix only what the 2026-07-31 revision directly touches.)*
- `CLAUDE.md` and `docs/*.md` are modified **only** through the `/docs` skill — as of 2026-07-31 this applies to **two** corrections: the original "Single media per post/comment" amendment (T003) and the follow-up "images/GIFs" → "images" narrowing (T112)
- Galleries are **images-only, permanently**, as of 2026-07-31 (T109, T110) — video was always excluded (FR-028); GIFs (either an uploaded animated file or a Giphy-picker reference) now are too, unconditionally, with no future stage that re-enables them
- Commit after each task or logical group; stop at any checkpoint to validate

---

## Phase 7: Convergence

**Why**: A mobile UI/UX review of the deployed Stage 1 build (post-1d) surfaced
three gaps between shipped code and already-stated spec intent, all confined to
mobile touch ergonomics in the composer and carousel. Two additional review
findings were evaluated and deliberately **not** appended here: a request to
change the >5-photo selection from reject-all to partial-accept contradicts the
explicit, clarified FR-033 decision (Session 2026-07-25) rather than closing a
gap — reopening it requires `/speckit-clarify`, not convergence; and the
`Lightbox.tsx` close-button size is out of this feature's scope, since
`plan.md` (research D13/D20) explicitly reuses `Lightbox.tsx` unchanged.

- [X] T113 [P] [US1] Enlarge the pending-item remove control's tap target in `web/components/PendingMediaStrip.tsx` (currently 24×24px `w-6 h-6` at `-top-2 -right-2`, roughly half overlapping the 80×80 tile) to a full ≥44px hit area via padding, without enlarging the visible icon, so removal registers reliably on mobile per FR-024 (partial)
- [X] T114 [P] [US1] Guard against a tap on the remove control being swallowed by an in-progress horizontal scroll/fling on the pending-item strip's `overflow-x-auto` container in `web/components/PendingMediaStrip.tsx` — this is the diagnosed root cause of the reported "add-photo button stays disabled after removing a mid-list item" defect: the removal tap is lost, `items.length` never actually decreases, and the add button is correctly (not stalely) still showing capacity-full (FR-024, partial)
- [X] T115 [US1] Add a regression test in `web/tests/unit/PendingMediaStrip.test.tsx` asserting the remove control's hit area meets a ≥44px minimum and that a tap immediately following a scroll event on the strip still triggers `removeItem` (FR-024, partial)
- [X] T116 [US1] Add horizontal pointer-swipe-to-navigate on the carousel tile in `web/components/GalleryCarousel.tsx` (`onPointerDown`/`onPointerUp` tracking `clientX` delta + velocity threshold, `touchAction: 'pan-y'` to preserve vertical page scroll; a zero-movement pointer sequence must still resolve as tile activation, not a swipe), fulfilling the spec's Assumptions section framing that touch swipe is "a natural extension" expected beyond the guaranteed arrow-control baseline (spec.md Assumptions: "Carousel navigation controls are input-agnostic", partial)
- [X] T117 [P] [US1] Enlarge the carousel's prev/next arrow buttons in `web/components/GalleryCarousel.tsx` from 32×32px (`w-8 h-8`) to a ≥44px tap target, improving mobile usability per SC-005 ("reachable and usable... at the narrowest supported mobile width") (SC-005, partial)
- [X] T118 [US1] Extend `web/tests/unit/GalleryCarousel.test.tsx` with pointer-swipe navigation coverage — a left/right swipe past the distance/velocity threshold triggers `goNext`/`goPrev`, and existing click/keyboard tile-activation assertions still pass unchanged (SC-005, partial)
- [X] T119 [P] [US1] Align the reply composer's attach/spoiler icon buttons in `web/components/ShoutCard.tsx` (~lines 1828-1843, currently ~20×20px) with the existing `minWidth:44,minHeight:36` convention already used by the same file's `clearReplyTo` button, for consistency with FR-031's identical-behavior intent across both composers (FR-031, unrequested — inconsistent touch-target sizing between composers, not itself a numerically stated requirement)
- [X] T120 [P] [US1] Add `break-words` (or equivalent) to the upload-failure filename list in `web/components/ShoutInput.tsx` (~444-446) and `web/components/ShoutCard.tsx` (~1876) so a long unbroken filename cannot overflow the error box on narrow mobile viewports, keeping FR-034's per-file failure reporting legible (FR-034, partial)

**Checkpoint**: pending-item removal is reliable on mobile; the carousel supports swipe navigation with adequately sized fallback controls; composer touch-target sizing and failure-message legibility are consistent across both composers. Not gated on a production redeploy of its own — bundles into the next Stage 1 polish deploy.
