# Phase 0 Research: Restrict Realtime Updates to Authenticated Users

All Technical Context items were resolvable from the existing codebase and
constitution; no open NEEDS CLARIFICATION remain. The decisions below resolve the
design questions raised by the spec's edge cases and functional requirements.

## Decision 1 — Where to enforce the authorization gate

- **Decision**: Enforce server-side at SSE connection time. Reject
  `GET /api/v1/events` with **401** when the session has no active user; only
  call `addClient` for authenticated sessions. The client-side change (not
  opening `EventSource` when anonymous) is a UX optimization, **not** the
  security boundary.
- **Rationale**: FR-003, FR-008, and Constitution I require the server to be the
  authoritative guard. Today `routes/index.js:23` calls `addClient(req, res)`
  unconditionally and `sse.js` stores `userId: null` for anonymous clients —
  meaning anonymous clients receive every `broadcast()`. The existing
  `requireAuth` middleware (`api/src/auth.js`) already returns
  `401 { error: "Unauthorized" }`, matching the project pattern used across
  domain routes.
- **Alternatives considered**:
  - *Client-only gate (don't open EventSource when anon)*: rejected — a crafted
    request would still connect and receive broadcasts (violates FR-003/FR-008).
  - *Keep accepting anon connections but skip them in `broadcast()`*: rejected —
    FR-002 requires **not establishing/maintaining** a channel for anon visitors;
    holding an open, silent connection wastes resources and still leaks
    connection existence. Refusing the connection is cleaner and satisfies SC-001.

## Decision 2 — Refusal mechanism for the SSE request

- **Decision**: Apply `requireAuth` as middleware on the events route (or an
  equivalent guard inside `addClient` that writes a 401 before any
  `text/event-stream` headers). The 401 must be sent **before** the SSE
  `writeHead(200, …)` so the browser `EventSource` receives a normal error, not
  an open stream.
- **Rationale**: `EventSource` treats a non-200/`text/event-stream` response as
  an error and will not establish the stream. Reusing `requireAuth` keeps the
  refusal consistent with the rest of the API and avoids duplicating session
  logic.
- **Alternatives considered**: Returning 204/empty stream — rejected; it still
  opens a stream (fails SC-001/FR-002) and `EventSource` would retry-loop.

## Decision 3 — Banned / soft-deleted accounts (edge case)

- **Decision**: Treat a session whose user is banned or soft-deleted as
  unauthorized for realtime. Validate the account is active via Prisma at
  connection time (analogous to the fresh `is_banned` check already done in
  `routes/shouts.js` on shout creation). If invalid, refuse with 401.
- **Rationale**: Spec edge case "Banned or soft-deleted account" and the
  Assumptions section require it. `req.session.user` alone can be stale, so a
  point-of-connection Prisma read on `is_banned` / soft-delete markers is the
  authoritative check. Constitution IV requires this read go through Prisma.
- **Alternatives considered**: Trusting only `req.session.user` presence —
  rejected; would let a freshly-banned user keep/open a realtime channel.

## Decision 4 — Session becomes unauthenticated while connected (FR-006)

- **Decision**: Two-layer approach. (a) **Client**: on sign-out, `SSEProvider`
  closes the `EventSource` immediately (driven by `useAuth` state change). (b)
  **Server**: do not rely on the client alone — on sign-out/expiry the held
  connection must stop receiving updates. Implement a lightweight server-side
  revalidation so a connection whose session is no longer valid is dropped within
  one update/heartbeat cycle (SC-005). The existing 30s heartbeat loop in
  `sse.js` is the natural place to re-check liveness and close stale connections.
- **Rationale**: FR-006 + SC-005 require delivery to cease "within one update
  cycle" after the session is invalid, and FR-008 forbids relying solely on the
  client. The heartbeat already iterates all clients every 30s, giving a bounded,
  cheap revalidation point without new infrastructure.
- **Alternatives considered**: Re-checking the session on *every* `broadcast()` —
  rejected as higher overhead with little benefit over the heartbeat cadence;
  may be reconsidered if SC-005's "one update cycle" is interpreted more strictly
  than the heartbeat interval (flagged for the tasks phase).

## Decision 5 — Client connection lifecycle tied to auth state (US3, FR-007)

- **Decision**: In `web/context/SSEContext.tsx`, replace the mount-only
  (`[]` deps) `EventSource` setup with an effect keyed on the authenticated user
  from `useAuth()`. Open the connection only when `loading === false` **and** a
  user is present; tear it down (and clear reconnect timers) when the user
  becomes `null`. Preserve the existing exponential backoff/reconnect for the
  authenticated case.
- **Rationale**: FR-002 (no anon channel), FR-007 (sign-in starts updates),
  FR-006 (sign-out stops them). `AuthProvider` is already an ancestor of
  `SSEProvider` in `web/App.tsx`, so `SSEProvider` may consume `useAuth()` while
  preserving the constitution-mandated provider order (`SSEProvider` stays an
  ancestor of `NotificationsProvider` and all `useSSE` consumers).
- **Alternatives considered**: Keeping a single mount-time connection and merely
  ignoring events when anon — rejected; it still opens the channel (fails
  FR-002/SC-001) and contradicts "No SSE" for anonymous visitors.

## Decision 6 — UI/UX for stale anonymous views

- **Decision**: No new UI. Anonymous visitors see static page-load content and
  must reload to see newer content; no "new content available" banner or polling
  fallback is added.
- **Rationale**: Spec Assumptions explicitly scope this out. Avoids introducing
  English copy and keeps the change behavior-only (Constitution II).

## Summary of resolved unknowns

| Item | Resolution |
|------|------------|
| Enforcement location | Server-authoritative at `/api/v1/events`; client gate is UX-only |
| Refusal mechanism | 401 before SSE headers via `requireAuth`-style guard |
| Banned/soft-deleted | Prisma active-account check at connect → 401 if invalid |
| Mid-session invalidation | Client closes on sign-out + server drops stale connections on heartbeat |
| Client lifecycle | `EventSource` opened only when authenticated; torn down on sign-out |
| Anonymous UX | No new UI; manual reload is the remedy |
