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

- [ ] T001 [P] Add a banned/soft-deleted user fixture and a `bannedAgent`-style helper (authenticated session backed by an `is_banned`/soft-deleted user) to `api/tests/helpers.js` and `api/tests/fixtures`, for use by the realtime authorization tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared server-side authorization predicate used by every story's gate.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Implement a realtime-authorization helper in `api/src/auth.js` (e.g. `getRealtimeUserId(req)` / `requireActiveSession`) that returns the user id only when the session has a user AND a Prisma lookup confirms the account is active (not `is_banned`, not soft-deleted); otherwise null. Use Prisma only (Constitution IV); no Zod needed (no request body).
- [ ] T003 [P] Add unit tests for the authorization helper in `api/tests/unit/auth.test.js`: anonymous → null, active user → id, banned user → null, soft-deleted user → null.

**Checkpoint**: Server can authoritatively decide realtime eligibility for any session.

---

## Phase 3: User Story 1 - Anonymous visitor receives no live updates (Priority: P1) 🎯 MVP

**Goal**: Anonymous visitors establish no SSE connection and see no post-load live updates; direct anonymous subscription attempts are refused.

**Independent Test**: Load the site signed out; from a separate signed-in session create a shout/comment/like; confirm the anonymous view does not change until reload and that no `/api/v1/events` connection is open (or that a direct request returns 401).

### Tests for User Story 1

> Write these tests FIRST and ensure they FAIL before implementation.

- [ ] T004 [P] [US1] Integration test in `api/tests/integration/events.test.js`: `GET /api/v1/events` with no session returns **401** `{ error: "Unauthorized" }` and does NOT open a `text/event-stream`; a banned/soft-deleted session also returns 401 (uses helper from T001).
- [ ] T005 [P] [US1] Unit test in `api/tests/unit/sse.test.js`: `addClient` is never invoked for / never stores a client with `userId === null` (no anonymous client entry).
- [ ] T006 [P] [US1] Web test in `web/context/SSEContext.test.tsx`: when `useAuth` reports anonymous (no user) or `loading`, `SSEProvider` opens **no** `EventSource`.

### Implementation for User Story 1

- [ ] T007 [US1] Gate the SSE route in `api/src/routes/index.js`: apply the T002 authorization helper to `GET /api/v1/events` so unauthorized sessions receive a **401 JSON** response BEFORE any SSE headers are written; only authorized requests reach `addClient`.
- [ ] T008 [US1] Update `addClient` in `api/src/sse.js` to require an authorized user id (registering a client only for authorized sessions; remove the `userId || null` anonymous path and the "user=anon" log branch) so no `userId === null` entries exist.
- [ ] T009 [US1] In `web/context/SSEContext.tsx`, consume `useAuth()` and gate the `EventSource` creation so it is NOT opened while `loading` or when no user is present (anonymous). Preserve existing event registration for the authorized case. Keep `SSEProvider` an ancestor of `NotificationsProvider` (provider order unchanged in `web/App.tsx`).

**Checkpoint**: Anonymous users open no realtime connection and see no live updates; direct anon/banned subscription is refused (FR-002, FR-003, SC-001, SC-002, SC-004).

---

## Phase 4: User Story 2 - Authenticated user keeps full realtime experience (Priority: P1)

**Goal**: Signed-in users continue to receive live updates (shouts, comments, likes, notifications) with no regression.

**Independent Test**: Sign in, load feed and a shout; from a separate session generate shouts/comments/likes; confirm the signed-in view updates live without reloading.

### Tests for User Story 2

- [ ] T010 [P] [US2] Integration test in `api/tests/integration/events.test.js`: an authenticated active session (via `authenticatedAgent`) on `GET /api/v1/events` receives **200** with `Content-Type: text/event-stream`, the `:ok` preamble, and a subsequently `broadcast()`-ed event frame.
- [ ] T011 [P] [US2] Unit test in `api/tests/unit/sse.test.js`: a registered authorized client receives `broadcast()` events and `broadcastToUser()` events matched by its `userId`.
- [ ] T012 [P] [US2] Web test in `web/context/SSEContext.test.tsx`: when authenticated, `SSEProvider` opens exactly one `EventSource("/api/v1/events")`, registers all `ALL_EVENTS` listeners, and dispatches parsed events to subscribers.

### Implementation for User Story 2

- [ ] T013 [US2] Verify/adjust `api/src/sse.js` so authorized clients are stored with their real `userId` and that `broadcast()` / `broadcastToUser()` behavior is unchanged for them (no regression to FR-004); update the connection log line to drop the anon case.
- [ ] T014 [US2] In `web/context/SSEContext.tsx`, ensure the authenticated path retains the existing exponential backoff/reconnect (`onerror`/`onopen`) and event-listener wiring so signed-in latency/behavior is unchanged (SC-003).

**Checkpoint**: Signed-in users keep the full, regression-free realtime experience (FR-001, FR-004, FR-009, SC-003).

---

## Phase 5: User Story 3 - Transition between signed-out and signed-in states (Priority: P2)

**Goal**: Signing in starts realtime updates; signing out (or session expiry/invalidation) stops them — on both client and server.

**Independent Test**: Start anonymous (no updates), sign in (updates begin), sign out (updates stop) — within one session.

### Tests for User Story 3

- [ ] T015 [P] [US3] Web test in `web/context/SSEContext.test.tsx`: an auth-state transition anon→user opens an `EventSource`, and user→null (sign-out) closes it and clears any pending reconnect timer.
- [ ] T016 [P] [US3] Integration test in `api/tests/integration/events.test.js`: when a connected session is invalidated/expired (or its user becomes banned), the server stops writing further event frames to that client within one heartbeat/update cycle (SC-005).

### Implementation for User Story 3

- [ ] T017 [US3] Key the `web/context/SSEContext.tsx` connection effect on the authenticated user from `useAuth()`: open on sign-in, and on sign-out tear down the `EventSource`, clear reconnect timers, and reset backoff (FR-006, FR-007).
- [ ] T018 [US3] In `api/src/sse.js`, extend the 30s heartbeat loop to revalidate each client's session/account and drop (close + delete) connections whose session is no longer valid (sign-out, expiry, ban), so delivery ceases within one cycle without relying on the client alone (FR-006, FR-008, SC-005).

**Checkpoint**: All three stories independently functional; auth-state boundary handled on client and server.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and cleanup spanning all stories.

- [ ] T019 Update SSE auth behavior in docs via the `/docs` skill (do NOT edit `docs/*.md` or `CLAUDE.md` directly): note in `docs/api.md` that `/api/v1/events` requires an active authenticated session (401 otherwise) and in `docs/web.md` that `SSEProvider` connects only when authenticated.
- [ ] T020 [P] Remove now-dead anonymous-client handling/logging and confirm no remaining code path stores `userId === null` in `api/src/sse.js`.
- [ ] T021 Run the full suite (`make test-all`) and the `quickstart.md` manual scenarios (incl. `curl -i /api/v1/events` with no cookie → 401) to validate FR-001…FR-009 and SC-001…SC-005.

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
