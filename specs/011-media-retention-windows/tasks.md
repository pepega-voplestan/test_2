---

description: "Task list for Time-Limited Media Retention"
---

# Tasks: Time-Limited Media Retention

**Input**: Design documents from `/specs/011-media-retention-windows/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED. Not TDD-requested, but [quickstart.md](./quickstart.md) specifies "coverage to assert" per area, and every comparable worker job already ships a test file (`media-reclaim.test.ts`, `original-downgrade.test.ts`, `reclaim.test.ts`).

**Test ordering — deliberate deviation from the template**: the template says "Write these tests FIRST, ensure they FAIL". Constitution §VI ("Design-First, Tests Second") states that tests adapt to a well-designed component, not the reverse. Tests therefore follow implementation within each phase. Every task remains independently verifiable.

**Gate status**: Constitution v5.0.0 (2026-08-19) lifted the §III block on both user stories; v5.1.0 (2026-08-20) rewrote the fourth ground's window-form MUST so the hardcoded constants of T003 are compliant. See [plan.md](./plan.md) Constitution Check.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3, mapping to spec.md priorities

## Path Conventions

Web application, three packages plus an nginx tier: `workers/src/`, `api/src/`, `web/`, and `media-nginx.conf` at the repository root. No new package, no new service, **no schema migration**.

---

## ⚠️ Cross-story file conflicts (read before parallelising)

US1 and US2 are independently *testable* but not independently *editable* — they touch four of the same files. These pairs MUST be sequenced, never run in parallel:

| File | US1 task | US2 task |
|---|---|---|
| `api/src/helpers/media.js` | T011 (image branch) | T020 (video branch) |
| `web/components/ShoutCard.tsx` | T013 (image `full` fallback) | T022 (video tombstone) |
| `workers/src/queues.ts`, `scheduler.ts`, `index.ts` | T009 | T019 |

Everything else marked [P] is genuinely conflict-free.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: A known-good baseline

- [x] T002 Establish a green baseline: run `make test-workers`, `make test`, and `make test-web` and record any pre-existing failures so later runs are attributable

> No configuration task: the retention windows are hardcoded constants (FR-015), so there is nothing to add to the Compose files or `.env.example`. Do **not** wire these to `process.env` — see T003.

**Checkpoint**: Baseline known

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The window constants both sweeps depend on

**⚠️ CRITICAL**: T003 blocks both US1 and US2

- [x] T003 Create `workers/src/helpers/retention.ts` exporting exactly two constants — `IMAGE_RETENTION_DAYS = 7` and `VIDEO_RETENTION_DAYS = 30` — with a comment stating they are deliberately not environment-driven and why. **MUST NOT read `process.env`** and MUST NOT use the neighbouring `Number(env) || DEFAULT` convention from `media-reclaim.ts:35-36`: `Number("-1") || 7` evaluates to `-1`, and a negative window puts the age cutoff in the future, making every file including same-day uploads eligible for irreversible removal (FR-015, FR-015a). If a future feature needs per-environment windows, a strict fail-closed resolver has to come back with them

> No resolver test: the constants have no branches to cover. T014 and the US2 equivalents exercise the windows through the sweeps themselves.

**Checkpoint**: Foundation ready — US1 and US2 may begin

---

## Phase 3: User Story 1 - Operator reclaims the full-size copy of week-old images (Priority: P1) 🎯 MVP

**Goal**: Expire `1600.webp` for still images past the image retention window, with no post losing its picture — only its full-size resolution.

**Independent Test**: Publish a photo, advance past the window, run the sweep. Feed renders identically; the full-size view still opens, at the display copy's resolution; `1600.webp` is gone from storage; a freshly published photo still opens at full resolution.

### Implementation for User Story 1

- [x] T005 [US1] Create `workers/src/jobs/image-variant-expiry.ts` with `runImageVariantExpiry(deps?)`, every dependency injectable with a real default, mirroring `runMediaReclaim`'s shape. Candidate query: `media_type: "image"`, `created_at` older than the window, cursor-paged by `id` at 500 per batch
- [x] T005a [P] [US1] Add `libraryMediaIds(db, mediaIds): Promise<Set<string>>` to `workers/src/helpers/media-refs.ts`, querying `user_gifs` by `media_id: { in: mediaIds }` with **no** `is_deleted` filter (a missed protection retains data, a missed filter destroys it — the file's own stated principle). Batch-shaped by design: one query per sweep page, never per item. Do NOT reuse `hasLiveReference`/`hasAnyReference` here — both OR in `shout_media`/`comment_media` and would skip every image on a live post, turning the sweep into a silent no-op
- [x] T006 [US1] Implement the per-item decision order in `workers/src/jobs/image-variant-expiry.ts` exactly as specified in [contracts/sweep-jobs.md](./contracts/sweep-jobs.md): unparseable meta → `failed`/`unreadableMeta`; `reclaimed.files` → `alreadyReclaimed`; `meta.animated` → `animated`; id in the batch's library set → `library` (fetch the set once per batch via `libraryMediaIds` from T005a); `meta.orig && meta.converted !== true` → `pendingOriginal`; `variants` already contains `"1600"` → `alreadyExpired`; otherwise reclaim
- [x] T007 [US1] Wire the removal in `workers/src/jobs/image-variant-expiry.ts` through the existing `performReclaim` from `workers/src/helpers/reclaim.ts` with `filesToRemove: ["1600.webp"]`, `survivor: "960.webp"`, `markerPatch: { variants: ["1600"] }`. Do not open-code the unlink — `performReclaim` owns the marker-before-unlink ordering and the compare-and-set
- [x] T008 [US1] Add `summarize()` to `workers/src/jobs/image-variant-expiry.ts` reporting scanned/expired/skipped with the `retained` breakdown, window, and cutoff; log unconditionally so a zero-expiry run is distinguishable from a job that never ran
- [x] T009 [US1] Register the job: add `imageVariantExpiryQueue` to `workers/src/queues.ts`, an `upsertJobScheduler` entry at `0 4 * * *` in `workers/src/scheduler.ts`, and the worker plus Bull Board panel in `workers/src/index.ts`
- [x] T010 [US1] In `workers/src/jobs/image-variant-expiry.ts`, write both `summarize()` output and the return value to `job.log` and the worker return respectively — Bull Board's Logs and Return Value are separate panels
- [x] T011 [US1] In `api/src/helpers/media.js`, make `buildMedia`'s still-image branch omit `full` entirely when `reclaimed.variants` contains `"1600"`, evaluated after the existing `pendingOriginal` check. MUST NOT substitute `url` for `full` — see [contracts/media-dto.md](./contracts/media-dto.md)
- [x] T012 [P] [US1] In `web/components/Lightbox.tsx`, fall back to the display copy when `full` is absent at lines 98, 564, and 586 (`activeItem.full ?? activeItem.url`), so a mixed-age gallery pages end to end
- [x] T013 [US1] In `web/components/ShoutCard.tsx`, apply the same fallback for a shout's image (line 1438) and a comment's image (line 931)

### Tests for User Story 1

- [x] T014 [P] [US1] Create `workers/tests/image-variant-expiry.test.ts`: every skip reason reachable and counted; `dryRun` frees nothing; a completed re-run reclaims zero; a CAS mismatch counts `raced` not `failed`; a missing or empty `960.webp` refuses the removal; **a single-frame GIF in a personal library, older than the window, is retained as `library` and keeps its `1600.webp`** (the FR-004a case: `meta.animated` is false for it, so a guard resting on that check alone would delete it)
- [x] T015 [P] [US1] Add `buildMedia` cases under `api/tests/unit/` asserting `full` is omitted on `variants: ["1600"]`, still present for a fresh image, still the original while `pendingOriginal`, and that `reclaimed.files` still yields `undefined`
- [x] T016 [P] [US1] Add cases under `web/tests/unit/` asserting Lightbox and ShoutCard render the display copy when `full` is absent, and that a gallery of mixed-age members pages without a gap

**Checkpoint**: US1 fully functional and independently testable — the MVP. No post has lost a picture; storage for `1600.webp` past the window is reclaimed.

---

## Phase 4: User Story 2 - Operator reclaims month-old video files (Priority: P2)

**Goal**: Expire `original.mp4` past the video retention window, including on live posts, with the loss shown explicitly in Russian rather than as a broken player.

**Independent Test**: Publish a video post, advance past the window, run the sweep, open the post as a reader. Text, likes and comments unchanged; an explicit Russian message replaces the player; no broken player, no error. A second video inside the window still plays.

### Implementation for User Story 2

- [x] T017 [US2] Extend `ReclaimedMarker` in `workers/src/helpers/reclaim.ts` with `video?: boolean`, and carry it through `mergeReclaimed` alongside `variants` and `files` (`...(patch.video || prior?.video ? { video: true } : {})`). Do NOT push `"original.mp4"` into `variants` — that array is keyed by width strings and unions across runs
- [x] T018 [US2] Create `workers/src/jobs/video-expiry.ts` with `runVideoExpiry(deps?)`: candidate query `media_type: "video"`, cursor-paged; per item — unparseable → `failed`; `reclaimed.files` → `alreadyReclaimed`; `reclaimed.video` → `alreadyExpired`; otherwise `performReclaim` with `filesToRemove: ["original.mp4"]`, `survivor: null`, `markerPatch: { video: true }`
- [x] T018a [US2] Add `summarize()` to `workers/src/jobs/video-expiry.ts` reporting scanned/expired/skipped with the `retained` breakdown, window, and cutoff, formatted through the same shared `formatResult` T008 uses so the two sweeps' reports stay readable side by side. The video breakdown is its own smaller set — `inWindow`, `alreadyExpired`, `alreadyReclaimed`, `raced`, `unreadableMeta` ([data-model.md](./data-model.md)); there is no `animated`, `library`, `pendingOriginal`, or `noSurvivor`, since `survivor` is `null` by design. Log unconditionally so a zero-expiry run is distinguishable from a job that never ran
- [x] T018b [US2] In `workers/src/jobs/video-expiry.ts`, write both `summarize()` output and the return value to `job.log` and the worker return respectively — Bull Board's Logs and Return Value are separate panels, and filling only one leaves an operator staring at a blank tab. Mirrors T010
- [x] T019 [US2] Register the job: `videoExpiryQueue` in `workers/src/queues.ts`, an `upsertJobScheduler` entry at `30 4 * * *` in `workers/src/scheduler.ts`, and the worker plus Bull Board panel in `workers/src/index.ts`
- [x] T020 [US2] In `api/src/helpers/media.js`, make `buildMedia`'s video branch return `{ type: "video", expired: true, width, height }` with **no** `url` and **no** `thumb` when `reclaimed.video` is true. Note the existing `thumb` for video points at a `320.webp` that upload never writes ([research.md](./research.md) R10) — do not carry it into the new path
- [x] T021 [P] [US2] In `web/types.ts`, make `url` optional on the video DTO variant and add `expired?: boolean`, so every `<video src=…>` call site is forced to be revisited rather than silently receiving `undefined`
- [x] T022 [US2] In `web/components/ShoutCard.tsx`, render the Russian tombstone in place of `<video>` when `media.expired` is set, for a shout (line 1444) and a comment (line 937). The message is an inline Russian string literal with correct declension (the project has no i18n layer — see the surrounding copy in this file). No play control, no imagery, no disabled player chrome — see [contracts/media-dto.md](./contracts/media-dto.md)
- [x] T023 [P] [US2] **Done 2026-08-20.** Placeholder asset committed at `media-assets/_deleted.mp4` (H.264 baseline, 1280×720, 4s, silent, `+faststart`, 8.6 KB, `Срок хранения видео истёк`) and bind-mounted read-only at `/assets` on the media service in all three compose files. Deliberately **not** at the media volume root as originally written: `/media` is a named volume populated only by uploads, mounted `:ro` on the media service, with no build context anywhere — an asset "shipped at the volume root" had no mechanism to arrive and would have 404'd on every fresh deploy. See [contracts/media-serving.md](./contracts/media-serving.md)
- [x] T024 [US2] In `media-nginx.conf`, **split** the shared extension location: give `.mp4` its own `location ~* ^/.+\.mp4$` carrying `try_files $uri /_deleted.mp4`, and leave the remaining `(webp|jpg|jpeg|png|gif)` location at `=404`. Then add an **exact-match** `location = /_deleted.mp4` with `root /assets` and `Cache-Control: no-store`. Both details are load-bearing: putting the fallback on the shared location would answer a stale `original.gif` with an MP4 body under an image URL, and `nosniff` guarantees the browser cannot recover from that; and `try_files` performs an internal redirect that re-runs location matching, so a regex match would re-apply `immutable` to the placeholder — see [contracts/media-serving.md](./contracts/media-serving.md)

### Tests for User Story 2

- [x] T025 [P] [US2] Create `workers/tests/video-expiry.test.ts`: each skip reason; `dryRun` frees nothing; re-run is a no-op; `raced` counted correctly; media already wholesale-reclaimed is skipped and its bytes not double-counted; and a run with nothing due still emits a `summarize()` line with its `retained` breakdown (T018a) rather than logging nothing
- [x] T026 [P] [US2] Extend `workers/tests/reclaim.test.ts` to assert `mergeReclaimed` carries `video` through, that `variants` still unions across runs, and that `files` still dominates
- [x] T027 [P] [US2] Add `buildMedia` cases under `api/tests/unit/` for the expired-video shape, asserting no `url` and no `thumb` are advertised
- [x] T028 [P] [US2] Add cases under `web/tests/unit/` asserting an expired video renders the Russian tombstone and never a `<video>` with an undefined `src`
- [ ] T028a [P] [US2] Verify the serving layer against a running media container, per the table in [contracts/media-serving.md](./contracts/media-serving.md). Two cases carry the weight: an expired `original.mp4` answers `200` with `Cache-Control: no-store` and the placeholder body; a missing `original.gif` answers `404` and **never** the placeholder — an MP4 body under an image URL is unrecoverable once `nosniff` is applied

**Checkpoint**: US1 and US2 both independently functional. Both heavy file classes reclaimable.

---

## Phase 5: User Story 3 - Operator verifies and tunes retention safely (Priority: P3)

**Goal**: Make the first, highest-risk backlog run previewable, tunable, and legible.

**Independent Test**: Run both sweeps in preview against real data — they report file count and bytes and change nothing. Change each window constant and rebuild, re-run preview, confirm the reported set changes. Run for real and confirm the report accounts for every candidate.

> Much of US3 is already satisfied structurally: `performReclaim` short-circuits on `dryRun`, batching lands in T005/T018, and per-class reporting in T008 and T018a. These tasks make it operator-reachable and verify it against real data rather than reimplementing it.

### Implementation for User Story 3

- [x] T029 [P] [US3] Expose a manual preview trigger for both sweeps (a documented `dryRun: true` invocation path against `workers/src/jobs/image-variant-expiry.ts` and `workers/src/jobs/video-expiry.ts`) so an operator can preview without editing code
- [ ] T030 [P] [US3] Verify per-class reporting end to end in Bull Board at `/workers`: both the Logs tab and the Return Value tab populated for each sweep, and a run with nothing due still logging with `retained` explaining every skip

### Validation for User Story 3

- [ ] T031 [US3] Validate a window change: edit `IMAGE_RETENTION_DAYS` to `14` and `VIDEO_RETENTION_DAYS` to `60`, rebuild workers, re-run both previews, confirm the candidate set changes accordingly, then revert
- [x] T032 [US3] Confirm the windows never became configuration: grep the worker sources for `RETENTION_DAYS` and assert no hit reads `process.env`, and that neither name appears in any Compose file or `.env.example` (FR-015, FR-015a) — see [quickstart.md](./quickstart.md)
- [ ] T033 [US3] Validate backlog behaviour: with a backlog present, browse the feed while a sweep runs and confirm no perceptible degradation (FR-019, SC-007)
- [ ] T034 [US3] Validate interruption safety: kill the workers container mid-sweep, restart, re-run; confirm at most an unreferenced stray file and zero addresses resolving to nothing (FR-018, SC-008)

**Checkpoint**: All three stories independently functional and operationally verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T035 Validate the composition case from [quickstart.md](./quickstart.md): an original-quality upload expired *before* downgrade must be skipped as `pendingOriginal` and its `1600.webp` left intact; then after `original-downgrade` converts it, expiry proceeds. Regression here silently wedges `original-downgrade` forever and increases net storage — see [research.md](./research.md) R2
- [ ] T036 Run the full [quickstart.md](./quickstart.md) validation for all three stories, including every negative case
- [x] T037 Run `make test-all` and `npm run lint` in `workers/`, `api/`, and `web/`
- [x] T038 Update `docs/infra.md` Background Jobs with the two new sweeps, their schedules, retention constants (noting they are compile-time, not env), and report format — **via the `/docs` skill only**; `CLAUDE.md` and `docs/*.md` MUST NOT be edited directly (Constitution, Development Workflow)
- [x] T039 Update the `CLAUDE.md` "Soft-delete everywhere" and "Only reachable image variants exist" bullets to drop the "ratified but NOT implemented" qualifier once both sweeps ship — **via the `/docs` skill only**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks US1 and US2**
- **US1 (Phase 3)**: depends on T003
- **US2 (Phase 4)**: depends on T003; independent of US1 in behaviour, but shares four files (see conflict table)
- **US3 (Phase 5)**: depends on at least one sweep existing; T031–T034 are most meaningful once both do
- **Polish (Phase 6)**: depends on all desired stories

### Within User Story 1

T005 → T006 → T007 → T008 → T010 (same file, sequential). T005a is [P] against all of them (different file) but must land before T006 completes. T009 after T005. T011 independent of the worker tasks. T012 and T013 after T011 (they consume the DTO change). Tests T014–T016 after their subjects.

### Within User Story 2

T017 → T018 (the marker field must exist first) → T018a → T018b → T019 (same file, sequential). T020 after T017. T021 → T022. T023 is done, so T024 is unblocked. Tests T025–T028 after their subjects.

### Parallel Opportunities

- **Within US1**: T005a and T012 are [P] against the worker tasks; T014, T015, T016 are [P] with each other
- **Within US2**: T021 is [P] with the worker tasks (T022 is not — it shares `ShoutCard.tsx` with US1's T013); T025–T028 are [P] with each other
- **Across stories**: US1 and US2 may proceed together **only** if the four shared files in the conflict table are sequenced. The safest split is one developer on `workers/`, another on `api/` + `web/`
- **US3**: T029 and T030 are [P]; T031–T034 are validation runs and are sequential against a live stack

---

## Parallel Example: User Story 1 tests

```bash
# After T005–T013 land, launch the three test tasks together:
Task: "workers/tests/image-variant-expiry.test.ts — sweep logic and skip reasons"
Task: "api/tests/unit/ — buildMedia omits full on variants:['1600']"
Task: "web/tests/unit/ — Lightbox/ShoutCard fall back to the display copy"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1
2. **STOP and VALIDATE**: T035's composition case first, then the US1 independent test
3. US1 is the right MVP: it is the larger cumulative storage win, it is invisible to readers, it needs no Russian copy, no nginx change, and no new asset

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate → deploy (MVP: image storage reclaimed, zero user-visible change)
3. US2 → validate → deploy (video storage reclaimed, visible tombstone)
4. US3 → operator tooling verified against real data
5. Polish → docs via `/docs`, full quickstart

### Risk Notes

- **T005a is a correctness guard, not a filter.** Two ways to get it wrong, in opposite directions: omit it and the sweep deletes personal-library files that Constitution §III exempts absolutely (irreversible); implement it with `hasLiveReference`/`hasAnyReference` and the sweep silently skips everything attached to a live post, deleting nothing while reporting success. T014's library case is what distinguishes the two.
- **T007 and T018 must route through `performReclaim`.** It is the single place the marker-before-unlink ordering and the compare-and-set against `original-downgrade` live. Open-coding either is the most expensive mistake available here.
- **T003 and T032 are a pair.** The constants are safe only for as long as they stay constants. The moment a window is read from the environment with the house `Number(env) || DEFAULT` convention, `-1` survives the `||`, the age cutoff moves into the future, and every file — including same-day uploads — becomes eligible for irreversible removal. T032's grep is what keeps that from creeping back in.
- **T035 guards a silent failure.** Nothing breaks visibly if image expiry runs ahead of `original-downgrade` — the original is simply never reclaimed, forever, while the hourly job logs a failure for that media on every run.

---

## Notes

- [P] = different files, no dependencies
- Tests follow implementation per Constitution §VI, not TDD order
- No database migration, no row deletion, no new package or service
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
