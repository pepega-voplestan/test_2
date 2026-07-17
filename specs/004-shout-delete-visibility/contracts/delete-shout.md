# Contract: `DELETE /shouts/:id`

Existing endpoint (`api/src/routes/shouts.js:137-154`). Contract changes are additive — the request shape, auth, and success response are unchanged; only the side effects diverge based on comment count.

## Request

Unchanged.

```
DELETE /api/v1/shouts/:id
Cookie: session (required — requireAuth)
```

## Authorization (unchanged)

- 404 `{ "error": "Запись не найдена" }` if the shout doesn't exist or is already deleted.
- 403 `{ "error": "Можно удалять только свои записи" }` if the caller is not the shout's author.

## Behavior (changed)

1. Within a single transaction:
   a. Count comments on the shout where `is_deleted = 0`.
   b. Set `shouts.is_deleted = 1`.
2. If the counted comments == 0:
   - Broadcast SSE event `remove_shout` (see `sse-remove-shout.md`) instead of `delete_shout`.
3. If the counted comments >= 1:
   - Broadcast SSE event `delete_shout` exactly as today: `{ shoutId, userId }`.

## Response (unchanged)

```
200 OK
{ "ok": true }
```

The response body does not indicate which branch was taken — the caller's own optimistic UI already removes/updates its local copy of the shout on successful delete regardless of comment count; the branching only matters for *other* connected clients, delivered via the SSE broadcast.

## Non-goals

- No new query parameters or request body fields.
- No change to who may delete a shout (author only, per existing check).
- No change to what happens to the comments themselves (they remain soft-deletable independently, per existing comment-deletion behavior).
