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
| **Stage 1** | Phase 1 + **Phase 1b** + **Phase 1c** + Phase 2 + Phase 3 (US1) | Deployed; constitution amended; single-media regression verified; every attached image visible inline and openable; pending items individually removable/previewable; upload deferred to submit and atomic |
| **Stage 2** | Phase 4 (US2) | Deployed; Lightbox zoom/pan regressions verified |
| **Stage 3** | Phase 5 (US3, reorder + GIF mixing only) + Phase 6 | Deployed; mixed galleries verified |

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
- [X] T087 [P] [US1] Sizing in `web/tests/unit/PendingMediaStrip.test.tsx` — every tile renders at 80px max-height regardless of shout/comment context, and the remove control's own size is unchanged from today's shipped size (FR-040)
- [X] T088 [P] [US1] Tile activation in `web/tests/unit/PendingMediaStrip.test.tsx` — activating a tile opens `Lightbox` with that item's local object URL as `src`, with no inter-item navigation (FR-037)
- [X] T089 [P] [US1] Composer parity in `web/tests/unit/ShoutInput.test.tsx` and `web/tests/unit/ShoutCardReply.test.tsx` — `PendingMediaStrip`, per-item removal, deferred upload and atomic submit/retry behave identically in both composers (FR-031)

### Implementation for Phase 1c

- [X] T090 [US1] Rework `web/hooks/useMediaAttachments.ts` — hold each pending item as `{ id, file, objectUrl, mediaId?: string }`; remove the per-file `POST /upload/media` call from the selection/drop path (client-side type/size pre-validation stays at selection time, FR-034); add `removeItem(id)` as a pure state mutation with no network call (FR-024)
- [X] T091 [US1] Add `submit()` orchestration to `web/hooks/useMediaAttachments.ts` — upload every pending item without a `mediaId` yet, in parallel (research D15); invoke the caller's create callback only if every upload succeeds, passing `mediaIds` in pending order; on any failure, make no create call, surface a per-file error, and leave the pending list intact for retry (FR-041)
- [X] T092 [US1] Ensure `submit()` reuses previously-obtained `mediaId`s on retry in `web/hooks/useMediaAttachments.ts` — a pending item that already succeeded in a prior failed attempt must not be re-uploaded (research D16)
- [X] T093 [US1] Create `web/components/PendingMediaStrip.tsx` per `contracts/upload-orchestration.md` — bordered container with a thin divider, single horizontal row, horizontal scroll on overflow (FR-038/FR-039); 80px max-height tiles unified across both composer contexts (FR-040); per-item remove control at its existing visual size (FR-024); tile click opens the existing `Lightbox` on the item's local `objectUrl` (FR-037)
- [X] T094 [US1] Replace the ad hoc pending-preview markup in `web/components/ShoutInput.tsx` with `PendingMediaStrip`, wired to the hook's `removeItem`/`submit` (FR-024, FR-037, FR-038–FR-040)
- [X] T095 [US1] Replace the ad hoc pending-preview markup in the reply composer inside `web/components/ShoutCard.tsx` with `PendingMediaStrip`, identically to T094 (FR-031)
- [X] T096 [US1] Add a clear Russian-language atomic-submit-failure message and a "Try again" action to both `web/components/ShoutInput.tsx` and the reply composer in `web/components/ShoutCard.tsx`, naming the specific failing file(s) and triggering `submit()` again on retry (FR-041)
- [X] T097 [US1] Add an assertion in `web/tests/unit/useMediaAttachments.test.ts` that a permission-revoked (`is_media_allowed = false`) upload attempted during `submit()` blocks the entire submission — no partial post — matching FR-009's 2026-07-30 wording

**Checkpoint**: pending items are individually removable and individually
previewable; no upload occurs before submit; a failing submit posts nothing and
offers a retry that never re-uploads already-succeeded files. **Re-deploy Stage
1 and validate before starting Phase 4.**

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

## Phase 4: User Story 2 - Navigate between gallery items (Priority: P2) — **Stage 2**

**Goal**: Readers cycle the whole gallery with looping, edge-anchored controls.

**Scope reduced 2026-07-26**: Stage 1 already opens any item full size (T077), so
this stage no longer unlocks viewing — it removes the dismiss-and-reopen round
trip. `Lightbox.tsx` is untouched until this phase.

**Independent Test**: Open a published 4-image gallery, click the preview, and confirm all four are reachable by repeated forward navigation including wrap-around from last to first.

**Depends on**: Stage 1 deployed and validated in production.

### Tests for User Story 2

- [ ] T041 [P] [US2] Gallery navigation in `web/tests/unit/Lightbox.test.tsx` — forward and backward looping (FR-019), position indicator content (FR-021), no navigation controls when opened on a single item (FR-022)
- [ ] T042 [P] [US2] Regression guard in `web/tests/unit/Lightbox.test.tsx` — the existing single-`src` invocation renders and behaves exactly as before when no `items` prop is passed

### Implementation for User Story 2

- [ ] T043 [US2] Add optional `items: GalleryItem[]` and `startIndex: number` props to `web/components/Lightbox.tsx`, keeping the existing single-`src` code path unchanged when they are absent
- [ ] T044 [US2] Add prev/next controls anchored to the left and right screen edges in `web/components/Lightbox.tsx`, rendered at every viewport size and for every item aspect ratio (FR-018, SC-005)
- [ ] T045 [US2] Implement looping navigation in both directions in `web/components/Lightbox.tsx` — past-last wraps to first, before-first wraps to last (FR-019)
- [ ] T046 [US2] Add the position indicator ("3 / 5") to `web/components/Lightbox.tsx` (FR-021)
- [ ] T047 [US2] Ensure each item renders in its entirety, letterboxed rather than cropped, in `web/components/Lightbox.tsx` (FR-020)
- [ ] T048 [US2] Add keyboard Left/Right navigation in `web/components/Lightbox.tsx`, alongside the existing Escape handler
- [ ] T049 [US2] Gate horizontal swipe navigation on `zoomLevel.current === 1` in `web/components/Lightbox.tsx` so pan-while-zoomed keeps working — the highest-risk regression in this stage (research D6)
- [ ] T050 [US2] Upgrade the Stage 1 tile handler (T077) in `web/components/ShoutCard.tsx` to pass the full `gallery` array plus `startIndex` instead of a single `src`, for both shouts and comments (FR-017, FR-031)
- [ ] T051 [US2] Add explicit coverage in `web/tests/unit/Lightbox.test.tsx` that scroll position is preserved on dismiss via `web/hooks/useScrollLock.ts` (FR-023)

**Checkpoint**: US1 and US2 both work independently. **Deploy Stage 2 and validate in production before starting Phase 5.**

---

## Phase 5: User Story 3 - Reorder the gallery before posting, and mix in GIFs (Priority: P3) — **Stage 3**

**Scope narrowed 2026-07-30**: per-item removal (FR-024) moved to Phase 1c —
see T082/T090 there. This phase now covers only reordering and GIF mixing.

**Goal**: Reorder while composing; GIFs mixable with images. Both composers.

**Independent Test**: Attach four images, move the last to the front, add a GIF, publish, and confirm the gallery contains exactly the intended items in the intended order — verified in both the shout and comment composers.

**Depends on**: Stage 2 deployed and validated in production.

### Tests for User Story 3

- [ ] ~~T052 [P] [US3] Removal behavior in `web/tests/unit/useMediaAttachments.test.ts`~~ — **SUPERSEDED 2026-07-30 by T082**, before ever being started. Per-item removal moved out of Stage 3 into Phase 1c.
- [ ] T053 [P] [US3] Reordering in `web/tests/unit/useMediaAttachments.test.ts` — the reordered first item becomes the published preview (FR-025)
- [ ] T054 [P] [US3] Rollback in `web/tests/unit/useMediaAttachments.test.ts` — a failed reorder reverts the pending list to its prior state (Constitution Principle V)
- [ ] T055 [P] [US3] Mixed galleries in `api/tests/integration/shouts.test.js` — an image+GIF `mediaIds` array is accepted (FR-026)
- [ ] T056 [P] [US3] Restriction parity in `api/tests/integration/gifs.test.js` — a user with `is_media_allowed = false` is blocked from uploading a **new** GIF into a gallery but may still re-select an **existing** one from "Мои GIF" (FR-009, SC-007)

### Implementation for User Story 3

- [ ] ~~T057 [US3] Add per-item removal to `web/hooks/useMediaAttachments.ts`~~ — **SUPERSEDED 2026-07-30 by T090**, before ever being started. Implemented in Phase 1c instead, available to both composers from Stage 1 onward.
- [ ] T058 [US3] Add reordering of pending items to `web/hooks/useMediaAttachments.ts`, with the first item driving the preview (FR-025)
- [ ] T059 [US3] Make reorder optimistic with guaranteed rollback on failure in `web/hooks/useMediaAttachments.ts` (Constitution Principle V)
- [ ] T060 [US3] Add the reorder UI affordance to both `web/components/ShoutInput.tsx`'s and the reply composer's `PendingMediaStrip` usage in `web/components/ShoutCard.tsx` (FR-025, FR-031) — remove is already available from Phase 1c
- [ ] T061 [US3] Remove the FR-035 gate from `web/components/ShoutInput.tsx`, `web/components/ShoutCard.tsx` and `web/components/EmojiPicker.tsx`, enabling free image+GIF mixing (FR-026 takes effect, FR-035 expires)
- [ ] T062 [US3] Allow selecting a GIF into an existing gallery in `web/components/GifPicker.tsx`, appending rather than replacing
- [ ] T063 [US3] Verify animated GIF items animate correctly inside mixed galleries in both `web/components/GalleryGrid.tsx` and `web/components/Lightbox.tsx` (US3 acceptance scenario 5)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T064 [P] Update `docs/api.md` and `docs/web.md` for the gallery DTO, the `mediaIds` create contract, the shared hook and the new components — **via the `/docs` skill only**
- [ ] T065 [P] Audit all new Russian copy for correct declensions and pluralization across `web/hooks/useMediaAttachments.ts`, `web/components/ShoutInput.tsx`, `web/components/ShoutCard.tsx`, `web/components/GalleryGrid.tsx` and `web/components/Lightbox.tsx` (Constitution Principle II)
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
- **Phase 4 (US2)**: depends on Phase **1c** being deployed to production, not
  merely merged (revised again — Stage 1 is not complete until the pending-preview
  and upload-timing revision ships)
- **Phase 5 (US3)**: depends on Phase 4 **being deployed to production**
- **Phase 6 (Polish)**: depends on Phase 5

### User Story Dependencies

Unlike the usual Spec Kit pattern, these stories are **strictly sequential** —
see the sequencing constraint at the top. US2 extends UI delivered by US1, and
US3 removes the FR-035 gate that US1 installs.

### Within Each User Story

- Tests are written first and must fail before implementation
- Schema → helpers → hook → routes → components
- `api/src/helpers/gallery.js` (T006) must exist before T027/T028
- `web/utils/plural.ts` (T012) must exist before T014
- `web/hooks/useMediaAttachments.ts` (T014) must exist before T031 and T034
- `web/hooks/useMediaAttachments.ts`'s Phase 1c rework (T090–T092) must exist before `PendingMediaStrip.tsx` (T093) and its two call sites (T094/T095)

### Critical Path

```text
T001 → T004 → T005 → T006 → T009 → T014 → T027 → T031 → T034 → T035 → T037
         (T002/T003 gate the deploy, not the code)
         └──────────── Stage 1 (initial) deploy ────────────┘
                              → T090 → T091 → T093 → T094 → T095
                              └──── Stage 1 (1c revision) deploy ────┘
                                          → T043 → T045 → T049 → T050
                                          └──── Stage 2 deploy ────┘
                                                      → T058 → T059 → T061
```

### Parallel Opportunities

- **Phase 1**: T002 and T003 are `[P]` and run alongside all of Phase 2
- **Phase 2**: T007, T008, T010, T011, T012, T013 are independent files → run together (T004→T005→T006 and T012→T014 stay serial)
- **Phase 3 tests**: T015–T026 are all `[P]` → write the entire test suite in one pass
- **Phase 3 implementation**: T030 (superseded) was `[P]`; the `ShoutInput.tsx` chain (T031–T033) and the `ShoutCard.tsx` chain (T034–T037) are each internally serial but **can run in parallel with each other**, since the shared hook removes the coupling
- **Phase 1c tests**: T081–T089 are all `[P]` → write the entire test suite in one pass
- **Phase 1c implementation**: T090–T092 all touch `useMediaAttachments.ts` and MUST stay serial; T093 (`PendingMediaStrip.tsx`) can start once T090's shape is settled; T094/T095 (the two composer call sites) **can run in parallel with each other** once T093 exists, same reasoning as Phase 3
- **Phase 4**: T041/T042 `[P]`; T043–T049 all touch `Lightbox.tsx` and MUST stay serial
- **Phase 5**: T053–T056 `[P]`; T058–T059 all touch the hook and MUST stay serial
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

---

## Implementation Strategy

### MVP scope — Stage 1 (Phases 1, 1b, 1c, 2, 3 — T001–T040, T071–T080, T081–T097)

1. Phase 1: baseline, plus the constitution amendment and `/docs` update that gate the deploy
2. Phase 2: schema, migration, gallery helper, DTO, worker fix, **shared attachment hook**
3. Phase 3: create routes + SSE DTO + both composers + preview UI
4. Phase 1b: adaptive grid, every published item viewable
5. Phase 1c: deferred/atomic upload, per-item removal, pending-preview strip
6. **STOP and VALIDATE**: run `quickstart.md` Stage 1 checks, especially the single-media regression (SC-006), comment-composer parity (FR-031), and the 2026-07-30 network-trace checks (no upload before submit; retry skips already-uploaded files)
7. **Deploy to production** and let real users exercise it

This alone delivers the feature's core value: users can publish multi-image
shouts **and comments**, and readers can see that a gallery exists.

### Incremental delivery

- **Stage 1** (T001–T040) → deployed 2026-07-25 → validation exposed the
  viewability defect → **Stage 1 revision** (T071–T080) → re-deploy → validate →
  further feedback exposed the composer-timing/removal papercuts →
  **Stage 1 revision 2** (T081–T097) → re-deploy → validate
- **Stage 2** (T041–T051) → deploy → validate, with special attention to zoom/pan regressions
- **Stage 3** (T053, T054, T055, T056, T058–T063) + polish (T064–T070) → deploy → validate mixed galleries

### Team strategy

Because stages are gated on production deployment, **splitting stories across
developers does not shorten the calendar**. Within Stage 1, the shared hook
creates a genuine split: once T014 lands, one developer takes the `api/` chain
(T027–T029) while another takes `ShoutInput.tsx` (T031–T033) and a third takes
the `ShoutCard.tsx` reply composer (T034–T037), all against the same hook
contract.

---

## Notes

- `[P]` = different files, no dependencies
- Attachment logic lives in `useMediaAttachments.ts`, **not** in either composer — this is what keeps FR-031 parity from drifting across three stages
- `api/src/helpers/gallery.js` is the only module permitted to write `media_id` or the join tables (Invariant I1)
- `CLAUDE.md` and `docs/*.md` are modified **only** through the `/docs` skill
- Commit after each task or logical group; stop at any checkpoint to validate
