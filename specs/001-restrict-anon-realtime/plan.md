# Implementation Plan: Restrict Realtime Updates to Authenticated Users

**Branch**: `001-restrict-anon-realtime` | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-restrict-anon-realtime/spec.md`

## Summary

Gate the Server-Sent Events (SSE) realtime channel so only authenticated sessions
receive live updates (new shouts, comments, like/count changes, notifications).
Anonymous visitors must establish **no** SSE connection and see no post-load live
changes; authenticated users keep the full realtime experience without regression.

Technical approach: enforce authorization **authoritatively on the server** by
rejecting `GET /api/v1/events` for sessions without an active, non-banned user
(401), and stop streaming to a connection once its session is no longer valid. On
the client, the `SSEProvider` only opens an `EventSource` when the auth state is
authenticated, and tears it down on sign-out — eliminating the anonymous
connection entirely while preserving the existing reconnect/backoff behavior for
signed-in users.

## Technical Context

**Language/Version**: Node.js (ESM) on the API; React 18 + TypeScript on the web

**Primary Dependencies**: Express + `express-session` (session auth), Prisma
(PostgreSQL), browser `EventSource` API. No new dependencies expected.

**Storage**: PostgreSQL via Prisma. **No new persisted data** — this is an
access-control change over existing session/auth state (`User.is_banned`,
soft-delete markers).

**Testing**: API tests (Vitest/Supertest per `docs/testing.md`), web unit tests
(Vitest). Tests run sequentially; `bcrypt` rounds 4 in tests via `tests/setup.js`.

**Target Platform**: Linux server (Docker + Nginx) + browser SPA.

**Project Type**: Web application (Express API + React/Vite web).

**Performance Goals**: No regression in realtime latency for authenticated users
(SC-003). Fewer open SSE connections overall (anonymous connections removed).

**Constraints**: Session auth is authoritative (Constitution I, FR-008). SSE
provider order must be preserved (`SSEProvider` ancestor of `NotificationsProvider`
and all `useSSE` consumers). No new user-visible UI copy (spec assumption).

**Scale/Scope**: Two files at the core (`api/src/sse.js` + route mount in
`api/src/routes/index.js`; `web/context/SSEContext.tsx`), plus tests. The Steam
proxy, `/me`, and domain routes are untouched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| I. Session-Based Authentication Only | **PASS** — gate uses the existing `req.session.user` server-side session; no JWT/localStorage introduced. Reinforces the principle. |
| II. Russian-Language UI Integrity | **PASS** — no new user-visible copy (spec assumption). 401 is a status code, not UI text. |
| III. Soft-Delete & Data Preservation | **N/A** — no deletes; banned/soft-deleted accounts are only *read* to deny realtime eligibility. |
| IV. Validated, Prisma-Mediated Data Access | **PASS** — any account-active/ban check goes through Prisma. The events endpoint takes no request body, so no new Zod schema is required. |
| V. Optimistic UI with Guaranteed Rollback | **N/A** — no optimistic mutations added. |
| SSE provider order (Workflow gate) | **PASS** — `AuthProvider` is already an ancestor of `SSEProvider`, which remains an ancestor of `NotificationsProvider`; consuming `useAuth` inside `SSEProvider` keeps this order. |
| Test isolation (Workflow gate) | **PASS** — new tests follow sequential, no-shared-state convention. |
| Rate-limit auth states (Workflow gate) | **N/A** — events endpoint is not rate-limited; but both auth states are explicitly tested for the new gate. |

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/001-restrict-anon-realtime/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── events-endpoint.md
├── checklists/          # Pre-existing
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
api/
├── src/
│   ├── sse.js                 # addClient gate; drop/refuse unauthenticated connections
│   ├── auth.js                # requireAuth (reused); optional active-account helper
│   └── routes/
│       └── index.js           # GET /api/v1/events mount — apply auth gate
└── tests/
    └── events.test.js         # NEW: anon refused (401), authed accepted, ban/expiry

web/
├── context/
│   └── SSEContext.tsx         # open EventSource only when authenticated; teardown on sign-out
└── context/
    └── SSEContext.test.tsx    # NEW/updated: no connection when anon, connects when authed
```

**Structure Decision**: Existing web-application layout (`api/` Express backend +
`web/` React frontend). The feature edits existing files in place rather than
introducing new modules; the only new files are tests and feature documentation.

## Complexity Tracking

> No constitution violations — section intentionally empty.
