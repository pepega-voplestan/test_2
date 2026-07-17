---

description: "Task list for Hide Uncommented Shouts on Delete"
---

# Tasks: Hide Uncommented Shouts on Delete

**Input**: Design documents from `/specs/004-shout-delete-visibility/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Not explicitly requested as a TDD gate in the spec. Test-file updates are included as normal implementation tasks within each story rather than a separate "write failing tests first" phase.

**Organization**: Tasks are grouped by user story (US1 = P1, US2 = P2) to enable independent implementation and testing.

## Path Conventions

Web application: `api/src/...` (Express + Prisma backend), `web/...` (React + TypeScript frontend) — per `plan.md` Project Structure.

---

## Phase 1: Setup

No setup tasks required. This feature introduces no new dependencies, migrations, or infrastructure — it is a behavior/query change within already-established files (`api/src/routes/shouts.js`, `web/context/SSEContext.tsx`, `web/components/ShoutFeed.tsx`, `web/components/ShoutPage.tsx`). Work begins at Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the comment-count check both user stories branch from.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 In `api/src/routes/shouts.js`, inside the `DELETE /shouts/:id` handler (currently lines 137-154), wrap the existing `prisma.shout.update({ where: { id: shoutId }, data: { is_deleted: 1 } })` together with a new `prisma.comment.count({ where: { shout_id: shoutId, is_deleted: 0 } })` in a single `prisma.$transaction`, exposing the resulting count as a local `commentCount` variable. Do not change the broadcast yet — it should still always call `broadcast("delete_shout", { shoutId, userId })` at this point, so this task alone introduces no observable behavior change.

**Checkpoint**: `commentCount` is available at the exact moment of deletion — both stories can now proceed.

---

## Phase 3: User Story 1 - Deleting a shout with no comments removes it entirely (Priority: P1) 🎯 MVP

**Goal**: When a shout with zero comments is deleted, it disappears completely and live from the main feed for every viewer (including the deleting user), and never reappears on reload.

**Independent Test**: Post a shout, delete it before anyone comments, and confirm it is absent everywhere (author's own screen immediately, a second live-viewing user's screen without refresh, and any subsequent feed/direct-link reload) — no placeholder remains.

### Implementation for User Story 1

- [X] T002 [US1] In `api/src/routes/shouts.js`, branch the `DELETE /shouts/:id` handler on `commentCount` from T001: when `commentCount === 0`, broadcast `remove_shout` with payload `{ shoutId, userId }` instead of `delete_shout`; when `commentCount >= 1`, keep the existing `delete_shout` broadcast unchanged. (Depends on T001; same file.)
- [X] T003 [P] [US1] Add `"remove_shout"` to the `ALL_EVENTS` array in `web/context/SSEContext.tsx` (currently lines 12-20), alongside the existing `"delete_shout"`, so the provider forwards it instead of silently dropping it.
- [X] T004 [P] [US1] In `web/components/ShoutFeed.tsx`: (a) add a `remove_shout` SSE handler next to the existing `delete_shout` handler (currently lines 244-250) that, when `data.userId` is not the current user, removes the shout with matching `shoutId` from the `shouts` state array entirely (no placeholder); (b) update the `removeShout` callback (currently lines 186-190, invoked on the author's own delete via `onDelete`) to branch on the target shout's current `(comments || []).length` (guard for the optional `comments` field, matching the pattern already used at `ShoutFeed.tsx:177`): if `0`, remove it from `shouts` state entirely; otherwise keep the existing placeholder patch (`isDeleted: true, content: '', media: undefined, user: null`) unchanged. This local branch is a best-effort immediate reflection for the deleting user only — see spec.md Edge Cases for the accepted narrow race where it can briefly diverge from what's broadcast to others; no server round-trip is added to reconcile it.
- [X] T005 [P] [US1] In `web/components/ShoutPage.tsx`: (a) add a `remove_shout` SSE handler next to the existing `delete_shout` handler (currently lines 96-103) that, for the currently-viewed `shoutId` and when `data.userId` is not the current user, transitions the page to the same not-found/unavailable state used when a shout doesn't exist (e.g. `setError('Запись не найдена')` and clear `shout`); (b) update the `handleDelete` callback (currently lines 88-93, invoked on the author's own delete via `onDelete`) to branch on the current `(shout?.comments || []).length`: if `0`, transition to that same not-found state; otherwise keep the existing placeholder patch unchanged. Same accepted-race caveat as T004(b).
- [X] T006 [US1] In `api/src/routes/shouts.js`, add a Prisma relation-filter condition to the "new"-tab non-pinned query (currently lines 61-73, which today has no `is_deleted` filter at all) to exclude rows where `is_deleted = 1 AND` the shout has no comments with `is_deleted = 0` (e.g. via `comments: { none: { is_deleted: 0 } }` combined with `is_deleted: 1` under a `NOT`/`AND`), so a zero-comment deleted shout does not reappear on pagination/reload under normal operation (see spec.md FR-006 for the accepted live-re-evaluation caveat). (Same file as T002; sequential.)
- [X] T007 [US1] In `api/src/routes/shouts.js`, apply the same relation-filter exclusion to `GET /shouts/:id` (currently lines 92-104, which today has no `is_deleted` filter either), so a direct-link fetch of a zero-comment deleted shout returns the existing 404 (`{ "error": "Запись не найдена" }`) instead of the enriched shout. (Same file as T006; sequential.)
- [X] T007a [US1] Update two existing tests in `api/tests/integration/shouts.test.js` that will break once T006/T007 ship: `"returns soft-deleted shouts with isDeleted: true and masked content"` (currently ~lines 48-62, fixture-creates a zero-comment shout via `createShout({ ..., is_deleted: 1 })` and asserts it's still returned) and `"returns shout with isDeleted: true and masked fields when soft-deleted"` (currently ~lines 132-141, same pattern via `GET /shouts/:id`). For each, either (a) attach a comment to the fixture shout so it exercises the has-comments/placeholder path this feature preserves, or (b) split it into two cases — a has-comments case that keeps the original assertions, and a zero-comment case updated to assert absence/404. Do this before or alongside T008 so the suite isn't left red mid-implementation. (Depends on T006, T007.)
- [X] T008 [US1] Extend `api/tests/integration/shouts.test.js` to cover: deleting a zero-comment shout broadcasts `remove_shout` (not `delete_shout`) with `{ shoutId, userId }`; the shout is absent from a subsequent `GET /shouts` ("new" tab) response; `GET /shouts/:id` returns 404 for it afterward. (Depends on T002, T006, T007, T007a.)
- [X] T009 [P] [US1] Create `web/tests/unit/ShoutFeed.test.tsx` and `web/tests/unit/ShoutPage.test.tsx` (no prior test files exist for these components — use `renderWithProviders` from `web/tests/helpers.tsx` and mock `AuthContext`/`SSEContext`/`fetch` as needed, following the pattern in `web/hooks/useSSE.test.ts`) asserting: the new `remove_shout` handler removes/redirects correctly; the updated `removeShout`/`handleDelete` branching removes the shout locally (not a placeholder) when `comments.length === 0`. (Depends on T004, T005; different file from T008.)

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the MVP.

---

## Phase 4: User Story 2 - Deleting a shout that already has comments keeps current behavior (Priority: P2)

**Goal**: No regression — a shout with one or more comments still becomes a live "deleted" placeholder for everyone, exactly as before T001-T009 were introduced.

**Independent Test**: Post a shout, have another user comment on it, delete it, and confirm the placeholder still appears (with the comment still reachable) for the author, for a second live-viewing user, and after reload — unchanged from current behavior.

### Implementation for User Story 2

- [X] T010 [US2] In `api/src/routes/shouts.js`, confirm (and correct if the T002 branching introduced any drift) that the `commentCount >= 1` path of `DELETE /shouts/:id` still broadcasts `delete_shout` with the unchanged `{ shoutId, userId }` payload. (Depends on T002.)
- [X] T011 [US2] Extend `api/tests/integration/shouts.test.js` with a regression test: an **author-initiated** delete (`DELETE /shouts/:id`) of a shout that has at least one comment still broadcasts `delete_shout` (not `remove_shout`); the shout remains fetchable via `GET /shouts` and `GET /shouts/:id`; `enrichFeed`'s existing `isDeleted` placeholder branch (`api/src/helpers/feed.js` lines 148-182) still renders it with blanked `content`/`user`/`media`. This test is scoped to the author-delete route only — moderator/admin deletion (`api/src/admin.js`) is explicitly out of scope (see spec.md FR-007, research.md Decision 6) and must not be asserted as unchanged here. (Depends on T010.)
- [X] T012 [P] [US2] In the same new `web/tests/unit/ShoutFeed.test.tsx`/`ShoutPage.test.tsx` files from T009, add cases confirming the pre-existing `delete_shout` handlers, and the `comments.length >= 1` branch of the updated `removeShout`/`handleDelete` (from T004/T005), still produce the placeholder patch unchanged. (Different file from T011; depends on T009 for the test scaffolding.)

**Checkpoint**: Both user stories are independently functional; the has-comments path is regression-verified.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T013 [P] Run all six `quickstart.md` scenarios end-to-end manually (two browser sessions) per `specs/004-shout-delete-visibility/quickstart.md`.
- [ ] T014 [P] Manually verify the pinned zero-comment shout edge case: pin a zero-comment shout, delete it, and confirm the pinned slot is simply left empty with no auto-promotion, exercising the existing `pin_shout`/`unpin_shout` handlers in `web/components/ShoutFeed.tsx` alongside the new removal path.
- [X] T015 Review `specs/004-shout-delete-visibility/checklists/requirements.md` against the finished implementation and update notes if anything surfaced during implementation that the spec didn't anticipate.
- [ ] T016 [P] Manually verify quickstart.md Scenario 6 (admin-panel deletion): confirm this is accepted, documented behavior (full hiding on reload, no live broadcast) rather than something to fix — do not open a bug for it.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — no tasks.
- **Foundational (Phase 2)**: No dependencies — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational (T001) only.
- **User Story 2 (Phase 4)**: Depends on Foundational (T001) and on User Story 1's T002 (it verifies/regression-tests the branch T002 introduces) — not independent of US1's code, though it is independently *testable* once T002 exists.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Within User Story 1

- T002 depends on T001 (same file, sequential).
- T003, T004, T005 depend only on T001 and can proceed in parallel with T002 and each other (three different files).
- T006 depends on T002 (same file, sequential); T007 depends on T006 (same file, sequential); T007a depends on T006, T007 (same test file as T008, sequential).
- T008 depends on T002, T006, T007, T007a. T009 depends on T004, T005 and can run in parallel with T008 (different files).

### Within User Story 2

- T010 depends on T002. T011 depends on T010. T012 depends on T004/T005 and T009 (shares its test files) and can run in parallel with T011 (different files).

### Parallel Opportunities

- T003, T004, T005 (SSEContext.tsx, ShoutFeed.tsx, ShoutPage.tsx) can be done in parallel once T001 is complete.
- T008 and T009 can be done in parallel (backend test file vs. frontend test files).
- T011 and T012 can be done in parallel (backend test file vs. frontend test files).
- T013 and T014 (both manual verification) can be done in parallel.

---

## Parallel Example: User Story 1

```bash
# After T001 (Foundational) and T002 (backend branching) are done, these can run together:
Task: "Add remove_shout to ALL_EVENTS in web/context/SSEContext.tsx"
Task: "Add remove_shout handler + branch removeShout in web/components/ShoutFeed.tsx"
Task: "Add remove_shout handler + branch handleDelete in web/components/ShoutPage.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001).
2. Complete Phase 3: User Story 1 (T002-T009).
3. **STOP and VALIDATE**: Run quickstart.md Scenarios 1, 3, 4, 5 — confirm zero-comment deletes fully disappear, live, everywhere, with no reappearance on reload.
4. This alone is deployable — it is the entire user-facing value of the feature.

### Incremental Delivery

1. Foundational → User Story 1 (MVP) → validate → deploy/demo.
2. User Story 2 → regression-verify the unchanged placeholder path → validate with quickstart.md Scenario 2 → deploy/demo.
3. Polish (manual full quickstart pass + pinned-shout edge case + checklist review).

---

## Notes

- [P] tasks touch different files with no ordering dependency on each other.
- [US1]/[US2] labels map tasks to the spec's User Story 1 / User Story 2.
- T002, T006, T007 all touch `api/src/routes/shouts.js` and are intentionally sequential (no [P]) to avoid conflicting concurrent edits to the same file.
- T004 and T005 each bundle two related edits to the *same* file (new SSE handler + updated optimistic-delete branch) rather than being split into two tasks, since splitting them would create same-file conflicts between "parallel" tasks.
- Commit after each task or logical group; stop at either checkpoint to validate that story independently before continuing.
