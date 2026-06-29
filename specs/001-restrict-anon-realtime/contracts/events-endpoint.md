# Contract: Realtime Events Endpoint

**Endpoint**: `GET /api/v1/events`
**Type**: Server-Sent Events (SSE) stream
**Mount**: `api/src/routes/index.js`
**Handler**: `addClient(req, res)` in `api/src/sse.js`

This is the only contract changed by the feature. All domain broadcast event
payloads (`new_shout`, `new_comment`, `shout_like`, `notification`, etc.) keep
their existing shapes; only **who may open the stream** changes.

## Authorization

The connection is authorized **only** when the request carries a valid
session whose user is an **active, non-banned, non-soft-deleted** account.
Authorization is evaluated authoritatively on the server (FR-008,
Constitution I).

## Request

| Aspect | Value |
|--------|-------|
| Method | `GET` |
| Path | `/api/v1/events` |
| Body | none |
| Auth | session cookie (existing `express-session`) |
| `Accept` | `text/event-stream` (browser `EventSource` default) |

## Responses

### Authorized (authenticated, active user)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

:ok

event: new_shout
data: {"shoutId":"...","userId":"...","shout":{...}}

:ping        ← heartbeat every 30s
```

- Stream stays open; client receives `broadcast()` and `broadcastToUser()` events
  as before (FR-004, no regression — SC-003).

### Unauthorized (anonymous, OR banned/soft-deleted session)

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{ "error": "Unauthorized" }
```

- **MUST** be returned **before** any `text/event-stream` headers are written, so
  the browser `EventSource` surfaces an error and does **not** establish a stream
  (FR-002, FR-003, SC-001, SC-004).
- Matches the existing `requireAuth` refusal shape used across the API.

### Session invalidated while connected (FR-006, SC-005)

- When a connection's backing session becomes invalid (sign-out, expiry, ban),
  the server **MUST** stop delivering further events and close the connection
  within one update/heartbeat cycle. No further `event:`/`data:` frames are
  written to that client after invalidation.

## Client behavior (web `SSEProvider`)

| State | Behavior |
|-------|----------|
| Auth `loading` | Do not open `EventSource` yet |
| Authenticated user present | Open `EventSource("/api/v1/events")`; existing backoff/reconnect applies |
| No user (anonymous) | Do **not** open any `EventSource` (FR-002, SC-001) |
| Transition anon → authed (sign-in) | Open the connection (FR-007) |
| Transition authed → anon (sign-out) | Close the connection and clear reconnect timers (FR-006) |

## Invariants

- No SSE client entry is ever created with `userId === null`.
- The set of clients receiving any `broadcast()` is exactly the set of
  authenticated, active sessions (FR-001, FR-009).
