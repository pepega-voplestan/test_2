---
description: "Task list for Restrict Realtime Updates to Authenticated Users"
---

# Tasks: Restrict Realtime Updates to Authenticated Users

**Input**: Design documents from `/specs/001-restrict-anon-realtime/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/events-endpoint.md, quickstart.md

**Tests**: Included — the plan lists test files as deliverables and the spec defines explicit Independent Test criteria per story. Tests are written first within each story.

**Organization**: Tasks grouped by user story (US1, US2, US3) so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task

## Path Conventions

Web application: Express API under `api/`, React frontend under `web/`. API tests in `api/tests/{unit,integration}/`; web context tests colocated as `web/context/*.test.tsx`. The `authenticatedAgent(user)` helper in `api/tests/helpers.js` is reused for signed-in test sessions.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare test scaffolding; no project initialization needed (existing codebase).

- [X] T001 [P] Banned-session test support — satisfied by existing helpers: `createUser({ is_banned })` (fixtures) + `authenticatedAgent(user)` + a post-login `prisma.user.update({ is_banned: 1 })` (the mid-session ban pattern already used in `likes.test.js`). No new fixture/helper needed; note: the `User` model has no separate soft-delete column, so "soft-deleted account" maps to a deleted row / `is_banned`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared server-side authorization predicate used by every story's gate.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Implemented `getRealtimeUserId(req)` in `api/src/auth.js` — returns the user id only when the session has a user AND a Prisma lookup confirms the account exists and is not `is_banned`; otherwise null. Prisma-only (Constitution IV); no request body so no Zod.
- [X] T003 [P] Added `getRealtimeUserId` unit tests in `api/tests/unit/auth.test.js` (Prisma mocked): anonymous → null (no DB call), active → id, banned → null, deleted/missing → null.

**Checkpoint**: Server can authoritatively decide realtime eligibility for any session.

---

## Phase 3: User Story 1 - Anonymous visitor receives no live updates (Priority: P1) 🎯 MVP

**Goal**: Anonymous visitors establish no SSE connection and see no post-load live updates; direct anonymous subscription attempts are refused.

**Independent Test**: Load the site signed out; from a separate signed-in session create a shout/comment/like; confirm the anonymous view does not change until reload and that no `/api/v1/events` connection is open (or that a direct request returns 401).

### Tests for User Story 1

> Write these tests FIRST and ensure they FAIL before implementation.

- [X] T004 [P] [US1] Integration test in `api/tests/integration/events.test.js`: `GET /api/v1/events` returns **401** `{ error: "Unauthorized" }` with JSON (not `text/event-stream`) for an anonymous request, a banned-after-login session, and a deleted-account session.
- [X] T005 [P] [US1] Unit test in `api/tests/unit/sse.test.js`: `addClient` with no session user writes 401 + registers nothing (a subsequent `broadcast` does not reach it) — no `userId === null` entry is ever stored.
- [X] T006 [P] [US1] Web test in `web/context/SSEContext.test.tsx`: when `useAuth` reports anonymous (no user) or `loading`, `SSEProvider` opens **no** `EventSource`.

### Implementation for User Story 1

- [X] T007 [US1] Gated the SSE route in `api/src/routes/index.js`: `GET /api/v1/events` runs `getRealtimeUserId` and returns **401 JSON** BEFORE any SSE headers; only authorized requests reach `addClient` (wrapped in `asyncHandler`).
- [X] T008 [US1] Updated `addClient` in `api/src/sse.js`: registers a client only when a session user is present (defensive 401 otherwise), removed the `userId || null` anon path and the `user=anon` log branch — no `userId === null` entries.
- [X] T009 [US1] `web/context/SSEContext.tsx` now consumes `useAuth()` and the connect effect returns early while `loading` or when no user is present. Event registration preserved for the authed case; provider order in `web/App.tsx` unchanged (`SSEProvider` still ancestor of `NotificationsProvider`).

**Checkpoint**: Anonymous users open no realtime connection and see no live updates; direct anon/banned subscription is refused (FR-002, FR-003, SC-001, SC-002, SC-004).

---

## Phase 4: User Story 2 - Authenticated user keeps full realtime experience (Priority: P1)

**Goal**: Signed-in users continue to receive live updates (shouts, comments, likes, notifications) with no regression.

**Independent Test**: Sign in, load feed and a shout; from a separate session generate shouts/comments/likes; confirm the signed-in view updates live without reloading.

### Tests for User Story 2

- [X] T010 [P] [US2] Authorized 200 + stream behavior verified at unit level in `api/tests/unit/sse.test.js` (`addClient` writes `text/event-stream` 200 headers + `:ok`, then `broadcast` reaches the client). **Realization note**: this is a unit test rather than an integration test because `helpers.js` globally mocks `sse.js`, so a supertest request on the authorized path would never end the stream — the refusal path is the integration coverage (T004).
- [X] T011 [P] [US2] Unit tests in `api/tests/unit/sse.test.js`: a registered authorized client receives `broadcast()` frames and `broadcastToUser()` frames matched by its `userId`.
- [X] T012 [P] [US2] Web test in `web/context/SSEContext.test.tsx`: when authenticated, `SSEProvider` opens exactly one `EventSource("/api/v1/events")` and dispatches parsed events to subscribers.

### Implementation for User Story 2

- [X] T013 [US2] `api/src/sse.js` stores authorized clients with their real `userId`; `broadcast()` / `broadcastToUser()` are behaviorally unchanged for them (existing + new unit tests green). Connection log line drops the anon case.
- [X] T014 [US2] `web/context/SSEContext.tsx` retains the exponential backoff/reconnect (`onerror`/`onopen`) and event-listener wiring for the authed path (verified by the unchanged, still-green `web/hooks/useSSE.test.ts` backoff suite).

**Checkpoint**: Signed-in users keep the full, regression-free realtime experience (FR-001, FR-004, FR-009, SC-003).

---

## Phase 5: User Story 3 - Transition between signed-out and signed-in states (Priority: P2)

**Goal**: Signing in starts realtime updates; signing out (or session expiry/invalidation) stops them — on both client and server.

**Independent Test**: Start anonymous (no updates), sign in (updates begin), sign out (updates stop) — within one session.

### Tests for User Story 3

- [X] T015 [P] [US3] Web test in `web/context/SSEContext.test.tsx`: anon→user transition opens an `EventSource`; user→null (sign-out) closes it (effect cleanup also clears the reconnect timer).
- [X] T016 [P] [US3] Server-side invalidation tested in `api/tests/unit/sse.test.js` via `reapInvalidClients()`: a client is dropped (and stops receiving broadcasts) when its session no longer resolves to a user (sign-out/expiry), when its account is banned, or when its account is deleted. **Realization note**: unit test against the real `sse.js` (Prisma + session store mocked) rather than integration, since `sse.js` is globally mocked in `helpers.js`.

### Implementation for User Story 3

- [X] T017 [US3] `web/context/SSEContext.tsx` connect effect is keyed on `[user?.id, loading]`: opens on sign-in and, on sign-out/user change, the effect cleanup closes the `EventSource` and clears the reconnect timer (FR-006, FR-007).
- [X] T018 [US3] `api/src/sse.js` heartbeat now calls `reapInvalidClients()` before pinging: each client's session is re-loaded via the stored `sessionStore.get(sid)` (sign-out/expiry) and the account re-checked via Prisma `is_banned` (ban/delete); invalid connections are closed + removed (FR-006, FR-008, SC-005). Heartbeat interval is skipped under `NODE_ENV=test`. See updated [data-model.md](./data-model.md) SSE Client entity.

**Checkpoint**: All three stories independently functional; auth-state boundary handled on client and server.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and cleanup spanning all stories.

- [X] T019 Updated docs via the `/docs` skill: `docs/api.md` — `/events` row now `Auth: Yes` + SSE section documents the `getRealtimeUserId` gate (401 before stream headers), no anonymous clients, and `reapInvalidClients` heartbeat revalidation; `docs/web.md` — `SSEProvider` opens the `EventSource` only when authenticated (connects on sign-in, tears down on sign-out) and `AuthProvider` must stay its ancestor.
- [X] T020 [P] `api/src/sse.js` cleaned up: removed the anonymous `userId || null` path, the `user=anon` connection log, and the now-dead `anon` counter in `getClientStats()`. No code path stores `userId === null`.
- [X] T021 Ran `make test` (API) and the full web suite + lint/tsc. **Web**: 134/134 pass, eslint 0 errors. **API**: my changed/added files pass — `events.test.js` (3), `sse.test.js` (14), `auth.test.js` (12); full API run is 450 passed / 9 skipped with **one pre-existing failure** in `tests/unit/app.setup.test.js` (it mocks `connect-sqlite3` while `app.js` uses `connect-redis`, and the test compose has no Redis — confirmed failing identically on the pre-change baseline, unrelated to this feature). The anonymous-`curl` quickstart check is covered by the `events.test.js` anonymous-401 assertion. Browser-driven manual scenarios in `quickstart.md` were not executed in this environment; their automated equivalents pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (provides the authorization helper).
- **User Stories (Phase 3–5)**: All depend on Foundational completion. US1 is the MVP. US2 and US3 share files with US1 (`sse.js`, `SSEContext.tsx`), so within a single working copy they are best done in priority order P1 → P1 → P2 rather than in parallel.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational. Establishes the server gate + client no-connect-when-anon.
- **US2 (P1)**: After Foundational. Verifies/guards the authed path; logically builds on the same gate but is independently testable.
- **US3 (P2)**: After Foundational. Adds transition + server-side drop; independently testable.

### Within Each User Story

- Tests written first and failing before implementation.
- Server gate (route + `sse.js`) before client wiring where a test depends on it.
- Story complete before moving to next priority.

### Parallel Opportunities

- T003 (foundational unit tests) parallel with nothing blocking it after T002 is drafted.
- Within a story, the test tasks marked [P] touch different files and can run in parallel (e.g. T004/T005/T006).
- Across stories, parallel work is limited because US1–US3 edit the same two implementation files; parallelize the **test** authoring, serialize the shared-file edits.

---

## Parallel Example: User Story 1

```bash
# Author all US1 tests together (different files):
Task: "Integration test 401 for anon/banned in api/tests/integration/events.test.js"
Task: "Unit test no null-userId client in api/tests/unit/sse.test.js"
Task: "Web test no EventSource when anon in web/context/SSEContext.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup.
2. Phase 2: Foundational authorization helper (CRITICAL — blocks all stories).
3. Phase 3: User Story 1.
4. **STOP and VALIDATE**: anonymous opens no connection, direct anon/banned request → 401.
5. Deploy/demo — this alone satisfies the primary requirement ("No SSE for anonymous").

### Incremental Delivery

1. Setup + Foundational → eligibility decided server-side.
2. US1 → anonymous fully restricted → MVP.
3. US2 → confirmed no regression for signed-in users.
4. US3 → clean sign-in/sign-out transitions + server-side drop.
5. Polish → docs + quickstart validation.

---

## Notes

- [P] = different files, no dependencies; the shared files `api/src/sse.js` and `web/context/SSEContext.tsx` are touched by multiple stories, so their edits are NOT marked [P] across stories.
- Constitution gates respected: session-only auth, Prisma-mediated account check, preserved `SSEProvider` ancestry, sequential tests, no new UI copy, docs via `/docs`.
- Verify each test fails before implementing; commit after each task or logical group.
