---

description: "Task list for 008-reclaim-unused-media"
---

# Tasks: Reclaim Unused Media Storage

**Input**: Design documents from `/specs/008-reclaim-unused-media/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/media-dto.md, quickstart.md

**Tests**: INCLUDED. Not because the spec requested TDD, but because every capability here deletes files irreversibly — originals are discarded 24h after upload, so nothing removed can be regenerated. `plan.md`'s source layout names the test files explicitly.

**Organization**: Grouped by user story. US1 is independently shippable and carries no policy risk; US3 is the only story that makes an existing capability permanently lossy.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3
- Exact file paths included

## Path Conventions

Web app: `api/src/` (Node ESM), `workers/src/` (TypeScript), `web/` (React + TS). Per `plan.md` structure.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repair test tooling before any file-deleting code is written

- [X] T001 Add `vitest` devDependency and `"test": "vitest run"` script to `workers/package.json` — the suite currently cannot run (research D8)
- [X] T002 Run `cd workers && npm test` to establish a pass/fail baseline for the existing `workers/tests/original-downgrade.test.ts`; record any pre-existing failures before writing new code
- [X] T003 [P] Add `MEDIA_UNPUBLISHED_GRACE_DAYS` and `MEDIA_DELETED_GRACE_DAYS` (default 7) to the `worker` service environment in `docker-compose.yml`, `docker-compose.local.yml`, and `docker-compose.dev.yml`

**⚠️ T001–T002 are blocking.** Landing a job that irreversibly deletes files onto a harness that does not execute is indefensible.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared reclaim mechanism both capabilities depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create `workers/src/helpers/reclaim.ts` with the `media_meta.reclaimed` marker reader/writer (`{ variants, files, at }` per data-model.md) and the `ReclaimResult` shape (`scanned`, `reclaimed`, `skipped`, `failed`, `bytesFreed`, `dryRun`)
- [X] T005 Add verified removal to `workers/src/helpers/reclaim.ts`: `stat` for byte accounting, confirm the surviving variant is present and non-empty BEFORE any unlink (FR-016), write the DB marker BEFORE the unlink (FR-017), treat a missing file at unlink time as success (FR-018), and honour a `dryRun` flag that performs every read but no write
- [X] T006 [P] Unit tests for the helper in `workers/tests/reclaim.test.ts`: marker round-trip, abort when the survivor is missing or zero-length, dry-run mutates nothing, missing-file-is-success, byte totals correct

**Checkpoint**: Shared reclaim mechanism ready — user stories can begin

---

## Phase 3: User Story 1 — Unreachable image variants (Priority: P1) 🎯 MVP

**Goal**: Stop generating the per-kind unreachable WebP variant, and remove those already stored. Zero visible change.

**Independent Test**: Upload one still photo and one animated GIF; confirm only reachable variants are written. Dry-run the script over existing media, then execute; browse feed, gallery, lightbox, and the personal GIF picker — every image renders as before.

**No dependency on US2 or US3.** Touches no deleted or user-owned content and needs no policy decision.

### Tests for User Story 1

- [X] T007 [P] [US1] Unit tests for per-kind variant reachability in `workers/tests/reclaim-variants.test.ts`: static image → `320` removable, `960`/`1600` retained; animated → `1600` removable, `320`/`960` retained; video and `youtube`/`giphy` rows skipped entirely
- [ ] T008 [P] [US1] Unit tests for `buildMedia` emission rules in `api/tests/unit/media.test.js`: `thumb` omitted for non-animated, `full` omitted for animated, `url` always present, `orientation` unchanged

### Implementation for User Story 1

- [X] T009 [US1] Make variant generation per-kind in `api/src/routes/upload.js`: skip `320.webp` in the non-animated branch, skip `1600.webp` in the animated branch, and update the `res.json` `urls` payload so it never advertises a variant that was not written
- [X] T010 [P] [US1] Update `buildMedia` in `api/src/helpers/media.js` to omit `thumb` for non-animated images and `full` for animated images (contract C1)
- [X] T011 [P] [US1] Widen `thumb` and `full` to optional on the `image` member of the media union in `web/types.ts` (contract C1) — must land in the same commit as T010
- [X] T012 [US1] Verify no frontend reader breaks in `web/components/ShoutCard.tsx`, `web/components/Lightbox.tsx`, `web/components/GalleryCarousel.tsx`: inline and gallery use `url`, lightbox uses `full` only for non-animated, GIF picker `thumb` comes from `gifs.js` not `buildMedia`
- [X] T013 [US1] Replace the `try_files $uri =404` webp rule in `media-nginx.conf` with the `960.webp` fallback from contract C6, keeping the existing cache and nosniff headers; leave the non-webp rule unchanged
- [X] T014 [US1] Create the one-time script `workers/src/scripts/reclaim-unreachable-variants.ts` per contract C5: dry-run by default, `--execute` to delete, `--limit N` for staged rollout, non-zero exit if any item failed, reports files and bytes
- [ ] T015 [US1] Integration test for per-kind variant generation in `api/tests/integration/upload.test.js`: JPG upload produces no `320.webp`, animated GIF upload produces no `1600.webp`, both still render through the API payload

**Checkpoint**: US1 fully functional and independently shippable. Deploy and verify in production before starting US3.

---

## Phase 4: User Story 2 — Media never published (Priority: P2)

**Goal**: Daily job reclaims files for uploads abandoned before publishing, without ever touching a personal GIF library.

**Independent Test**: Attach media in the composer, abandon it, pass the grace period, run the job — files gone, rows intact. Separately, save a GIF to the personal library and confirm the job never touches it.

### Tests for User Story 2

- [ ] T016 [P] [US2] Tests for the reference predicate in `workers/tests/media-refs.test.ts`: media referenced only by an active `user_gifs` row is PROTECTED (the most destructive possible bug), `user_gifs.is_deleted=1` does not protect, live shout protects, live comment protects
- [ ] T017 [P] [US2] Tests for the never-published class in `workers/tests/media-reclaim.test.ts`: inside grace → untouched, outside grace → reclaimed, rows still present after reclaim, dry-run reports without deleting

### Implementation for User Story 2

- [ ] T018 [US2] Create the `hasLiveReference(mediaId)` predicate in `workers/src/helpers/media-refs.ts` checking all three tables — `shout_media`→`shouts`, `comment_media`→`comments`, `user_gifs` — via Prisma only (research D9)
- [ ] T019 [US2] Create the recurring job `workers/src/jobs/media-reclaim.ts` per contract C4, handling the never-published class only: `runMediaReclaim(deps)` with injected `db`/`fileSystem`/grace periods/`dryRun`/`now`, plus `createMediaReclaimWorker()`
- [ ] T020 [US2] Add cursor-based batching to `workers/src/jobs/media-reclaim.ts` so worker memory stays bounded regardless of media volume (research D6)
- [ ] T021 [P] [US2] Register the `media-reclaim` queue in `workers/src/queues.ts` with retry/backoff matching `originalDowngradeQueue`
- [ ] T022 [P] [US2] Register the daily schedule in `workers/src/scheduler.ts` via `upsertJobScheduler`
- [ ] T023 [US2] Wire the worker and its Bull Board panel into `workers/src/index.ts` (depends on T019, T021)
- [ ] T024 [US2] Add the publish guard to `api/src/helpers/attachments.js` per contract C3: reject the whole publish when a `media_id` has `reclaimed.files === true`, with a Russian error message and correct declensions (Principle II)
- [ ] T025 [P] [US2] Integration test for the publish guard in `api/tests/integration/shouts.test.js`: publishing a reclaimed attachment fails with the Russian message and creates no shout

**Checkpoint**: US1 and US2 both work independently

---

## Phase 5: User Story 3 — Media behind deleted content (Priority: P3)

**Goal**: Extend the job to content soft-deleted past the grace period, making restore text-only rather than broken.

**Independent Test**: Delete a post, pass the grace period, run the job — files gone, tombstone still renders. Restore it — post returns as text-only with no broken image. Repeat inside the grace period — media fully intact.

**⚠️ Only enable after US1 is verified in production.** This is the story that makes administrator restore permanently lossy.

### Tests for User Story 3

- [ ] T026 [P] [US3] Tests for the deleted-content class in `workers/tests/media-reclaim.test.ts`: `is_deleted=1` past grace → reclaimed, inside grace → untouched, `is_deleted=2` (banned) → NEVER reclaimed, media shared by one deleted and one live post → retained
- [ ] T027 [P] [US3] Tests for reclaimed-media omission in `api/tests/unit/media.test.js`: `buildMedia` returns `undefined` when `reclaimed.files` is true; `buildGallery` drops the item and degrades a 2-item gallery to single-media shape

### Implementation for User Story 3

- [ ] T028 [US3] Extend `workers/src/jobs/media-reclaim.ts` with the deleted-content class, treating `is_deleted=2` and live content alike as PROTECTING their media so the fail-safe direction is retention (research D10)
- [ ] T029 [US3] Update `buildMedia` in `api/src/helpers/media.js` to return `undefined` when `media_meta.reclaimed.files` is true (contract C2), so restored content renders media-free instead of broken
- [ ] T030 [US3] Verify `buildGallery` in `api/src/helpers/media.js` degrades correctly when reclaim reduces a gallery below two surviving items (existing sub-2-item behaviour should need no change — confirm, do not assume)
- [ ] T031 [US3] Manually verify admin restore per quickstart Step 6, both inside and outside the grace period — any uncaught error in `admin.js` exits code 1 in production, so this MUST be exercised locally before deploy

**Checkpoint**: All three stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T032 Run the full quickstart validation end to end (`specs/008-reclaim-unused-media/quickstart.md`), including the before/after storage measurement so the reduction can be attributed per class (SC-004)
- [ ] T033 Verify zero `.webp` 404s under `/media/` in the nginx access log after reclaim (SC-005)
- [ ] T034 [P] Update `docs/infra.md` via the `/docs` skill: document the new `media-reclaim` job in the Background Jobs table, and correct the line claiming the `workers/` suite runs via `npm test` (it did not until T001)
- [ ] T035 [P] Update `CLAUDE.md` via the `/docs` skill: add `media-reclaim` to the background-job guidance and note the per-kind variant rule under media handling
- [ ] T036 Run `make test-all` and `cd workers && npm test` to confirm no regressions across api, web, and workers

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T001–T002 block everything.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Foundational only.
- **US2 (Phase 4)**: Depends on Foundational only. Independent of US1.
- **US3 (Phase 5)**: Depends on Foundational and on US2's job existing (T019 creates the file T028 extends).
- **Polish (Phase 6)**: Depends on all desired stories.

### User Story Dependencies

- **US1 (P1)**: Fully independent. Ships alone.
- **US2 (P2)**: Independent of US1.
- **US3 (P3)**: Extends the job file created in US2 — the one genuine cross-story code dependency. Behaviourally still independently testable.

### Within Each Story

- Tests before implementation
- Helpers before jobs; jobs before registration
- API contract change and TypeScript widening in the same commit (T010 + T011)

### Parallel Opportunities

- T003 alongside T001–T002
- T007 and T008 together (different files, different packages)
- T010 and T011 together — but must be committed together
- T016 and T017 together
- T021 and T022 together
- T026 and T027 together
- T034 and T035 together

---

## Parallel Example: User Story 1

```bash
# Tests first, in parallel:
Task: "Unit tests for per-kind variant reachability in workers/tests/reclaim-variants.test.ts"
Task: "Unit tests for buildMedia emission rules in api/tests/unit/media.test.js"

# Then the two contract-side changes, in parallel but committed together:
Task: "buildMedia omits thumb/full per kind in api/src/helpers/media.js"
Task: "Widen thumb/full to optional in web/types.ts"
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1: Setup — repair the test harness
2. Phase 2: Foundational — shared reclaim helper
3. Phase 3: US1
4. **STOP and VALIDATE**: measure storage before and after; confirm no visible change across feed, gallery, lightbox, GIF picker
5. Deploy

US1 alone captures the entire guaranteed-safe reclaim: it touches no user-owned content, needs no constitutional exception, and removes waste that otherwise grows with every upload.

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate → deploy (**MVP**)
3. US2 → validate → deploy
4. **Verify US1 in production for a full grace period** before enabling US3
5. US3 → validate → deploy

### Staged rollout for the destructive steps

Both capabilities dry-run by default. For the one-time script, use `--limit 100` first, verify rendering, then run unbounded. For the job, run with `dryRun: true` and inspect the reported counts before scheduling it live.

---

## Notes

- **There is no rollback for deleted files.** Originals are gone 24h after upload. Reverting the code restores full DTO emission but will then advertise addresses for files that no longer exist — if you revert, keep the nginx fallback (T013) in place.
- `960.webp` is never reclaimed by this feature; the nginx fallback depends on that. A future quality-downgrade feature that removes it must revisit T013 first.
- Rows are never deleted — only files. The tombstone path for a deleted shout with live comments depends on the rows surviving.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
