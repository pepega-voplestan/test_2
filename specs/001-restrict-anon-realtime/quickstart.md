# Quickstart: Validate Restricted Realtime Updates

Validation guide proving the feature end-to-end. For data details see
[data-model.md](./data-model.md); for the endpoint behavior see
[contracts/events-endpoint.md](./contracts/events-endpoint.md).

## Prerequisites

- Local dev running: `cd web && npm run dev` (API on :3000, Vite on :5173), or
  `make local` (Docker on :3006).
- Two browser contexts (e.g. a normal window + an incognito window) so you can
  hold an **anonymous** session and a **signed-in** session simultaneously.

## Automated tests

```sh
make test        # API tests — includes events.test.js (auth gate)
make test-web    # web tests — includes SSEContext connection-lifecycle tests
make test-all    # both
```

Expected: new API tests assert 401 for anonymous and banned/soft-deleted sessions
on `GET /api/v1/events`, and 200 + stream for an authenticated active user. Web
tests assert no `EventSource` is opened while anonymous and one is opened after
sign-in / closed after sign-out.

## Manual scenario 1 — Anonymous receives no live updates (US1, SC-001/SC-002)

1. In an incognito window (signed out), open the feed.
2. Open DevTools → Network → filter `events`. Confirm **no** open
   `/api/v1/events` request (or, if attempted, it returns **401** and does not
   stay pending). → FR-002, FR-003, SC-001.
3. From the signed-in window, create a new shout, add a comment, and like a
   shout.
4. In the incognito window, confirm the feed, comment counts/list, and like
   counts **do not change**. Reload → newer content now appears. → SC-002.

## Manual scenario 2 — Authenticated keeps realtime (US2, SC-003)

1. Sign in (first window) and open the feed + a shout.
2. Confirm a single open `/api/v1/events` connection (200, pending) in Network.
3. From a second signed-in session, create a shout / comment / like.
4. Confirm the first window updates **live** without reload, at the same latency
   as before the change. → FR-004, SC-003.

## Manual scenario 3 — Auth transitions (US3, FR-006/FR-007, SC-005)

1. Start anonymous → confirm no `/api/v1/events` connection.
2. Sign in → confirm a connection opens and live updates begin **without** extra
   steps. → FR-007.
3. Sign out → confirm the `/api/v1/events` connection closes and live updates
   stop within one cycle. → FR-006, SC-005.

## Edge-case checks

- **Direct anonymous subscribe**: `curl -i http://localhost:3000/api/v1/events`
  (no session cookie) → **401**, no stream. → FR-003, SC-004.
- **Banned/soft-deleted session**: with a session whose user is banned, hit the
  endpoint → **401**. → edge case "Banned or soft-deleted account".
- **Expiry while connected**: with an open authenticated stream, invalidate the
  session server-side → further events stop within one heartbeat cycle. → SC-005.
