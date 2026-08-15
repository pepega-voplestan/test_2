---

description: "Task list for anchor-based feed scroll restoration"
---

# Tasks: Anchor-Based Feed Scroll Restoration

**Input**: Design documents from `/specs/009-anchor-scroll-restore/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (no `contracts/` — no new API surface, see plan.md)

**Tests**: Included, but written AFTER each story's implementation, not before — per this project's Constitution Principle VI (Design-First, Tests Second): production shape is not to be driven by test convenience, and tests adapt to a settled design rather than the reverse.

**Organization**: Tasks are grouped by user story (spec.md priorities P1/P2/P3), each independently testable per its own Independent Test / quickstart.md scenario.

**Revision note**: This list incorporates fixes from a `/speckit-analyze` pass run against the first draft, which caught two real defects before any code was written: T004/T005/T011 now use a corrected, mutually-consistent `offsetFromTop` sign convention (research.md/data-model.md previously contradicted each other), and a new `approxItemsAbove` field (T005, used by T011) fixes an estimate formula that would have silently collapsed to a useless constant, since it depended on data that doesn't exist yet at the point it's needed. T009 and the new T010 close two test-coverage gaps the same pass found (FR-008 tab/sort restoration, and SC-002's "no regression when nothing changed" case).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)
- Nearly every task in this feature touches `web/components/ShoutFeed.tsx` or
  `web/tests/unit/ShoutFeed.test.tsx` — the feature is deliberately concentrated
  in one component (see plan.md Structure Decision), so genuine `[P]`
  opportunities are rare here; that's an accurate reflection of scope, not an
  omission.

## Path Conventions

Existing web application, single frontend project at `web/`. All file paths
below are relative to the repository root.

## Phase 1: Setup

**Purpose**: Shared tuning constants used by every later phase.

- [X] T001 Add `ANCHOR_SEARCH_LIMIT_PAGES` (default `8`, per research.md — 8 × `PAGE_SIZE`(25) = 200 items) and `AVERAGE_CARD_HEIGHT_ESTIMATE_PX` (a rough single-card height estimate, per research.md) as named constants near the existing `PAGE_SIZE` constant in `web/components/ShoutFeed.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The new saved-state shape and its live-tracked inputs — every user story below depends on these existing and being correct first.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. In particular, T004 encodes a lesson this project already paid for once this session (see its description) — get it right here so no story has to rediscover it.

- [X] T002 Replace the `SavedFeedState` interface in `web/components/ShoutFeed.tsx` with `SavedFeedAnchor` per data-model.md: `{ kind: 'anchor'; shoutId: string; offsetFromTop: number; approxItemsAbove: number; activeTab: FeedTab; popularSort: 'likes' | 'comments' }`
- [X] T003 Update `readPendingRestore()` in `web/components/ShoutFeed.tsx` to validate `kind === 'anchor'` plus the expected fields on the parsed sessionStorage value; treat anything else (including the old pixel-shaped `{scrollY, count, activeTab, popularSort}` with no `kind`) as `null` — "nothing to restore" — implements FR-009
- [X] T004 Add a `liveAnchorRef` next to the existing `liveScrollYRef` in `web/components/ShoutFeed.tsx`: extend the existing `scroll` listener to also (rAF-throttled, so it coalesces to at most one recomputation per animation frame rather than running on every raw scroll event) scan the existing `shoutRefs` map and set `liveAnchorRef.current = { shoutId, offsetFromTop }` for the LAST rendered shout (top-to-bottom) whose top edge is `<= 0` (already scrolled to/past), falling back to the first rendered shout if none qualifies yet — per research.md's corrected selection rule. **Do not** read shout positions reactively inside the unmount-save effect itself — per research.md's Correction note, that repeats the exact "DOM already mutated before cleanup runs" bug `liveScrollYRef` itself exists to avoid; this ref must be the *only* source the save effect reads from
- [X] T005 Update the unmount-save effect in `web/components/ShoutFeed.tsx` to read `liveAnchorRef.current` (not query the DOM) and write `{ kind: 'anchor', shoutId, offsetFromTop, approxItemsAbove: shouts.findIndex(s => s.id === liveAnchorRef.current.shoutId), activeTab, popularSort }` to `sessionStorage` — `approxItemsAbove` comes from React state (`shouts`), not a DOM read, so it isn't subject to the same clamping timing issue and needs no separate live-tracking; if `liveAnchorRef.current` is `null` (e.g. the feed was still empty when the reader left), write nothing — there is nothing meaningful to restore to

**Checkpoint**: Foundation ready — saved data has the right shape, is written from a live-tracked (not stale) source, and old-shaped data is safely ignored.

---

## Phase 3: User Story 1 - Return to the exact shout despite new content (Priority: P1) 🎯 MVP

**Goal**: Replace count-based restore with identity-based restore — locate the remembered shout by ID across paginated results and position the view on it, immune to items added above it.

**Independent Test**: quickstart.md Scenario 1 — scroll to a shout, have a second user post while away, open a different shout and return via "Назад"; the original shout (not the new one, not a pixel-offset neighbor) is at the top.

### Implementation for User Story 1

- [X] T006 [US1] In the restore-on-mount effect in `web/components/ShoutFeed.tsx`, change the paging loop's stop condition from `loaded < saved.count` to "the anchor's `shoutId` is present in the accumulated `shouts` list," bounded by `ANCHOR_SEARCH_LIMIT_PAGES` (T001) — implements FR-002, FR-004, FR-005
- [X] T007 [US1] Once the anchor shout is found in `shouts`, wait for its DOM node to actually render (via `shoutRefs`, reusing the existing rAF-polling pattern from `scrollWhenTallEnough`), measure it with `getBoundingClientRect()`, and scroll so it lands at `restoreState.offsetFromTop` — implements FR-003
- [X] T008 [US1] Remove the now-dead `count`/`scrollY`-based branches left over from the pixel-based loop in the restore effect, so there is exactly one (identity-based) code path

### Tests for User Story 1

- [X] T009 [US1] In `web/tests/unit/ShoutFeed.test.tsx`, add a test: the anchor shout is only present on page 2 of paginated results (simulating new content having pushed it down) — restore pages until found and positions on it, regardless of total item count; also assert `activeTab`/`popularSort` from the saved anchor are restored correctly in this same scenario (FR-008 — no dedicated mechanism changed here, but this is the first test exercising `restoreState` consumption under the new shape, so it's the natural place to confirm the carry-over didn't break)
- [X] T010 [US1] In `web/tests/unit/ShoutFeed.test.tsx`, add a test for SC-002 (no regression vs. the shipped pixel-based feature): the anchor shout is found on the very first page (no intervening posts, the common case) — restore positions correctly with a single fetch, no extra paging
- [X] T011 [US1] In `web/tests/unit/ShoutFeed.test.tsx`, add a test: the unmount-save writes `liveAnchorRef`'s last tracked value, not a value freshly queried from (possibly already-removed) DOM at unmount time — mirror the existing `liveScrollYRef` clamp-simulation test's structure (simulate the DOM already reflecting a different state than what was live-tracked, assert the saved value matches the live-tracked one)

**Checkpoint**: User Story 1 is functional — the reader lands on the correct shout by identity. It may still flash/jump visibly while locating it (User Story 2 removes that).

---

## Phase 4: User Story 2 - No visible flash while restoring (Priority: P2)

**Goal**: Preserve the shipped pixel-based feature's no-flash guarantee under the new mechanism, where the exact final position isn't knowable until the anchor has actually rendered.

**Independent Test**: quickstart.md Scenario 2 — repeat Scenario 1 while watching closely; no visible jump to the top at any point, at most a small settling correction once the anchor's real content renders.

### Implementation for User Story 2

- [X] T012 [US2] Replace the placeholder `minHeight` and the immediate `useLayoutEffect` `scrollTo` target in `web/components/ShoutFeed.tsx` (currently `restoreState.scrollY`, from the pixel-based version) with `restoreState.approxItemsAbove × AVERAGE_CARD_HEIGHT_ESTIMATE_PX + window.innerHeight` (T001's constant; `approxItemsAbove` comes from `SavedFeedAnchor` itself, so it's available synchronously — NOT "however many items happen to be loaded so far," which is always zero at this synchronous point and was an earlier, broken version of this task) — this is the initial, approximate position shown before the anchor has been located
- [X] T013 [US2] Wire the exact-position correction from T007 to also flip `restoring` to `false` (swapping the placeholder for real content) only once positioning is final, matching the shipped feature's existing `setRestoring(false)` timing semantics — implements FR-007

### Tests for User Story 2

- [X] T014 [US2] In `web/tests/unit/ShoutFeed.test.tsx`, add a test: `scrollTo` is called immediately on mount with the `approxItemsAbove`-derived estimate (before any network fetch resolves), then again with the corrected exact position once the anchor shout renders — extends the existing "scrolls immediately, before fetch resolves" test from the pixel-based work to assert both calls
- [X] T015 [US2] In `web/tests/unit/ShoutFeed.test.tsx`, add a test: the placeholder reserves the estimated height and is removed once the found anchor's real content has rendered — adapt the existing placeholder-reservation test from the pixel-based work to the estimate-based height

**Checkpoint**: User Stories 1 and 2 together — correct AND flash-free.

---

## Phase 5: User Story 3 - Graceful fallback when the anchor can't be found (Priority: P3)

**Goal**: Bounded, defined behavior when the remembered shout is unreachable (deleted, or beyond the search limit) — never an indefinite load or a broken state.

**Independent Test**: quickstart.md Scenario 3 — delete the shout the reader was anchored to (or scroll deep enough to exceed the search limit) before returning via "Назад"; lands at the top of fresh content, same as a first visit.

### Implementation for User Story 3

- [X] T016 [US3] In the restore loop (T006), when `ANCHOR_SEARCH_LIMIT_PAGES` is reached without finding the anchor's `shoutId`, stop paging, clear the sessionStorage entry, and reveal the already-loaded content positioned at the top — i.e. fall through to exactly the same state a fresh visit would produce, with no secondary fallback mechanism — implements FR-006

### Tests for User Story 3

- [X] T017 [US3] In `web/tests/unit/ShoutFeed.test.tsx`, add a test: the anchor's `shoutId` never appears across `ANCHOR_SEARCH_LIMIT_PAGES` pages of results (simulating deletion) — restore gives up, clears sessionStorage, and lands at the top rather than at the (now-meaningless) estimated position
- [X] T018 [US3] In `web/tests/unit/ShoutFeed.test.tsx`, add a test: a sessionStorage entry in the old pixel-based shape (`{scrollY, count, activeTab, popularSort}`, no `kind` field) present at mount time is treated as nothing-to-restore — normal fresh load, no error (regression test for T003 / FR-009 / SC-005)

**Checkpoint**: All three user stories complete — correct, flash-free, and robust when the anchor is unreachable.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T019 Run `cd web && npx tsc --noEmit` and `npx vitest run`; fix any regressions across the full suite, not just the scroll-restore tests
- [X] T020 Update the describe-block names and stale comments in `web/tests/unit/ShoutFeed.test.tsx`'s scroll-restore section that still describe the superseded count/pixel-based mechanism (e.g. "re-pages until the previous count is reached") to describe the identity-based behavior accurately
- [ ] T021 Manually run through all four `quickstart.md` scenarios end-to-end (two real sessions for Scenario 1) before considering the feature done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001 (constants used by T004/T005/T012's sizing, though not their core logic) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (T002–T005) — the save/read plumbing must exist before the restore loop can consume it
- **User Story 2 (Phase 4)**: Depends on User Story 1 (T006–T008) — the estimate/correction positioning in T012/T013 replaces the *found* handling T007 introduces; cannot be built against the old count-based loop
- **User Story 3 (Phase 5)**: Depends on User Story 1's T006 (extends the same loop with a give-up branch) — does NOT depend on User Story 2, so it could be built in parallel with Phase 4 by a second contributor, at the cost of both touching the same restore-loop function
- **Polish (Final Phase)**: Depends on all three user stories being complete

### Within Each User Story

- Implementation before its own tests (Constitution Principle VI — design first)
- T007 (US1) depends on T006 (US1) — needs the found-anchor case to exist before it can position on it
- T012/T013 (US2) depend on T007 (US1) — correction timing hooks into the exact-position logic T007 establishes
- T016 (US3) depends on T006 (US1) — extends the same loop's stop condition with a give-up branch

### Parallel Opportunities

- Realistically limited, see the note under Format above — this feature is concentrated in `ShoutFeed.tsx` and its one test file
- T009/T010/T011 (US1 tests) could be split across contributors once T006–T008 land, if careful about merge conflicts in the same test file
- T016 (US3) could start as soon as T006 (US1) lands, in parallel with Phase 4 (US2) — different concern (give-up vs. flash-free), same function, so coordinate on the restore-loop shape before both land

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational)
2. Complete Phase 3 (User Story 1)
3. **STOP and VALIDATE**: run quickstart.md Scenario 1 — confirm identity-based restoration actually works, even with a visible flash
4. This alone already fixes the drift bug that motivated this feature; User Stories 2 and 3 are polish and robustness on top of a working core

### Incremental Delivery

1. Setup + Foundational → data shape and live-tracking ready
2. Add User Story 1 → validate Scenario 1 → the core fix is live (flash acceptable at this point)
3. Add User Story 2 → validate Scenario 2 → flash eliminated
4. Add User Story 3 → validate Scenario 3 → edge cases (deleted/unreachable anchor) handled gracefully
5. Polish → validate Scenario 4 (old-shape data across a deploy) and the full regression suite

## Notes

- No `[P]` markers appear on most tasks in this feature — nearly everything
  lives in `web/components/ShoutFeed.tsx` or its single test file, so marking
  tasks parallel would misrepresent real merge-conflict risk rather than
  reflect genuine independence
- Commit after each checkpoint (end of each phase), not after every single task
- T004 exists specifically to avoid reintroducing, for per-shout position,
  the same bug class this session already found and fixed once for
  `window.scrollY` — treat its description as load-bearing, not decorative
- FR-010 ("no behavior change for a reader who arrives by any means other
  than a saved-position return") has no dedicated task — it's the negative/
  no-op case already covered by the pre-existing "falls back to a normal
  fresh load when there is nothing saved" test (kept as-is, not modified by
  any task above), which is sufficient coverage for a requirement that is
  really "don't do anything new here."
