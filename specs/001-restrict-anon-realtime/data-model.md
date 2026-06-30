# Phase 1 Data Model: Restrict Realtime Updates to Authenticated Users

**No new persisted entities, tables, columns, or migrations are introduced by
this feature.** It is an access-control change layered over existing session and
user state. The entities below are conceptual (in-memory or session-scoped) and
describe how existing data gates realtime eligibility.

## Entity: Visitor Session (existing — `express-session`)

Represents the current viewer's authentication state.

| Field | Source | Used for |
|-------|--------|----------|
| `session.user.id` | Existing session set at login | Identifies the user for `broadcastToUser` and eligibility |
| `session.user` (presence) | Existing session | Authenticated vs. anonymous determination |

- **Validation rule**: A session is eligible for realtime **only if** it has a
  `session.user` AND that user is an active, non-banned, non-soft-deleted account
  (see User entity).
- **State transitions** (eligibility):
  - `anonymous → authenticated` (sign-in): becomes eligible → client opens SSE
    (FR-007).
  - `authenticated → anonymous` (sign-out/expiry): becomes ineligible → client
    closes SSE and server drops the connection (FR-006, SC-005).

## Entity: User (existing — Prisma `User`)

Only read for this feature; not modified.

| Field | Type | Used for |
|-------|------|----------|
| `id` | existing | Match for targeted/user broadcasts |
| `is_banned` | existing boolean | Deny realtime eligibility when true |
| soft-delete marker(s) (`is_deleted` semantics: `1` user-removed, `2` banned) | existing | Deny realtime eligibility when not an active account |

- **Validation rule**: A user backing a session must be active (not banned, not
  soft-deleted) to receive realtime updates. Checked via Prisma at connection
  time.

## Entity: SSE Client (existing — in-memory `Map` in `api/src/sse.js`)

Represents an open realtime connection. Previously `clientId → { res, userId }`.
To make server-side invalidation (FR-006) authoritative, each entry now also
carries a reference back to its session so the heartbeat can re-check liveness.

| Field | Previous | Change for this feature |
|-------|----------|-------------------------|
| `clientId` | counter string | unchanged |
| `res` | HTTP response stream | unchanged |
| `userId` | user id **or `null` (anon)** | **Never `null`** — anonymous connections are no longer added |
| `sid` | — | **NEW** — `req.sessionID`, used to re-load the session on the heartbeat |
| `sessionStore` | — | **NEW** — `req.sessionStore` reference, used to look the session up |

- **Validation rule**: Entries are created **only** for authorized sessions; the
  `userId: null` (anonymous) case is eliminated. `addClient` defensively refuses
  (401) and registers nothing if no session user is present.
- **Lifecycle**: created on authorized connect; removed on client `close`, on
  client-side sign-out (the browser closes the `EventSource`), and on
  server-side revalidation (`reapInvalidClients`) when the stored session no
  longer resolves to a user OR the account is banned/deleted.
- **Server-side revalidation** (FR-006, SC-005): the 30s heartbeat calls
  `reapInvalidClients()`, which for each client loads the session via
  `sessionStore.get(sid)` (sign-out/expiry detection) and checks the account via
  Prisma `is_banned` (ban/delete detection), closing and dropping any connection
  that is no longer valid before pinging the survivors. Worst-case continued
  delivery after invalidation is therefore bounded by the ~30s heartbeat
  interval.

## Entity: Realtime Update (existing event payloads)

The broadcast events (`new_shout`, `new_comment`, `shout_like`, etc.) are
unchanged in shape. The only change is the **eligibility gate**: `broadcast()`
now necessarily reaches only authenticated clients because no anonymous clients
exist in the `Map`.
