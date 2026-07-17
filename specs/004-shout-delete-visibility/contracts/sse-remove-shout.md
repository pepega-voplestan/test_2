# Contract: SSE event `remove_shout`

New event, broadcast alongside the existing set defined in `api/src/sse.js` and consumed via `web/context/SSEContext.tsx`. Mirrors the delivery mechanism of the existing `delete_shout` event exactly — same transport (`broadcast()`, no room/topic scoping, sent to all connected SSE clients), different payload semantics and different frontend handling.

## Payload

```json
{
  "shoutId": "string (uuid)",
  "userId": "string (uuid) — id of the user who deleted the shout"
}
```

Same shape as `delete_shout`'s payload today — deliberately kept identical so the only thing that differs between the two events is *what the client does with it*, not what data it needs to look up.

## When it fires

Fired instead of `delete_shout` (never both) when `DELETE /shouts/:id` determines, at deletion time, that the shout had zero non-deleted comments. See `delete-shout.md`.

## Registration requirement

Must be added to `ALL_EVENTS` in `web/context/SSEContext.tsx` — events not in this list are silently dropped by the provider (see project SSE conventions).

## Client handling contract

- **`ShoutFeed.tsx`**: on receipt, remove the shout with matching `shoutId` from the in-memory feed list entirely (no placeholder, no gap retained). If the removed shout was the pinned shout, the pinned slot is simply left empty — no auto-promotion of another shout into it.
- **`ShoutPage.tsx`** (direct single-shout view): on receipt for the currently-viewed shout, transition to the same "not found"/unavailable state used when a shout doesn't exist, rather than rendering the deleted-placeholder view used for `delete_shout`.
- Both handlers MUST ignore the event if `data.userId` matches the current user (consistent with the existing `delete_shout` handlers' self-suppression, since the deleting user's own optimistic UI already reflects the outcome).

## Non-goals

- Does not replace or alter `delete_shout` in any way — both events coexist, mutually exclusive per deletion.
- Does not introduce a new transport, room, or per-user targeting — reuses the existing global `broadcast()`.
