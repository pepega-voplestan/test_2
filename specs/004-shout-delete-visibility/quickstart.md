# Quickstart: Validate Hide Uncommented Shouts on Delete

## Prerequisites

- Local dev environment running: `cd web && npm run dev` (API on :3000, Vite on :5173) — see root `CLAUDE.md` Quick Start.
- Two logged-in browser sessions (or one normal + one incognito), User A and User B, both viewing the main feed ("new" tab).

## Scenario 1 — Zero-comment shout: full live removal (User Story 1 / FR-001, FR-002, FR-004, SC-001, SC-003)

1. As User A, post a new shout. Confirm it appears at the top of both User A's and User B's feeds.
2. As User A, delete the shout (no comments added).
3. **Expected**: On User A's screen, the shout is gone immediately (no placeholder). On User B's screen — without B refreshing — the shout disappears from the feed within the same live-update latency as any other real-time feed change (e.g. a new shout appearing).
4. As User B, reload the page / re-fetch the "new" tab from the top.
5. **Expected** (FR-006, SC-004): The deleted shout does not reappear anywhere — no placeholder, no visible gap in the list.

## Scenario 2 — Shout with a comment: unchanged placeholder behavior (User Story 2 / FR-003, FR-005, SC-002)

1. As User A, post a new shout.
2. As User B, add one comment to it.
3. As User A, delete the shout.
4. **Expected**: On both User A's and User B's screens, the shout remains in the feed, rendered as the existing "Этот вопль был удалён" placeholder — identical to current behavior, comment still reachable underneath it.
5. Reload the page as either user.
6. **Expected**: The placeholder is still present after reload (existing "new"-tab behavior, unchanged).

## Scenario 3 — Race: comment lands right at deletion (Edge Case)

1. As User A, post a new shout.
2. As User B, submit a comment on it at (as close as practical to) the same moment User A submits the delete request.
3. **Expected**: Whichever write is durably applied first wins — if the comment is recorded before the delete transaction completes, the broadcast follows the has-comments placeholder path (Scenario 2), not the full-removal path. No corrupted/partial state (e.g. a comment attached to a fully-removed shout) should result. It's acceptable, in this narrow window, for User A's own screen to briefly show a different outcome than what was actually broadcast to everyone else (e.g. A's client, using its own local comment count, removes the shout while B and other viewers correctly see the placeholder) — a reload reconciles A's view with the server's state. This is accepted, not treated as a bug.

## Scenario 3b — Comments removed after a placeholder shout was deleted (Edge Case, accepted behavior)

1. As User A, post a shout. As User B, comment on it.
2. As User A, delete the shout — confirm the placeholder appears (Scenario 2).
3. As User B, delete their own comment on that shout.
4. As either user, reload the main feed.
5. **Expected**: The shout is now fully absent from the feed (no placeholder, no gap) — because feed visibility is re-evaluated from the *current* comment count on every read (FR-006), and that count is now zero. This is intended, accepted behavior, not a regression — do not file it as a bug.

## Scenario 3c — Comment added to an already-hidden shout (Edge Case, accepted behavior)

1. As User A, post a shout with zero comments and copy its direct permalink URL before deleting it.
2. As User A, delete the shout (Scenario 1 — it's fully hidden).
3. As User B, using the previously-copied permalink URL, submit a reply/comment directly (simulating a stale link or race where the comment-creation endpoint doesn't reject comments on deleted shouts).
4. As either user, reload the main feed.
5. **Expected**: The shout reappears as a deleted placeholder, since it now has a live, non-deleted comment (FR-006). This is intended, accepted behavior given the deliberate choice to keep feed visibility a live, continuously re-evaluated check rather than a permanent decision — do not file it as a bug.

## Scenario 4 — Direct link to a hidden shout (Edge Case)

1. As User A, post a shout with no comments and copy its direct permalink URL.
2. As User A, delete the shout.
3. As User B, open the copied permalink URL directly (fresh navigation, not live).
4. **Expected**: User B sees an "unavailable"/not-found state, not the deleted-placeholder view (which is reserved for shouts that had comments).

## Scenario 5 — Pinned, zero-comment shout (Edge Case)

1. As an admin, pin a shout that has zero comments.
2. As the shout's author, delete it.
3. **Expected**: The shout is fully removed (per Scenario 1) and the pinned slot is simply empty afterward — no other shout is auto-promoted into it, no placeholder occupies the pinned position.

## Scenario 6 — Admin-panel deletion (accepted side effect, not a bug)

1. As User A, post a shout and have User B add a comment to it.
2. As an admin, delete the shout via the AdminJS panel (not the author-facing delete button).
3. **Expected**: No live update on connected clients (the admin path does not broadcast — pre-existing behavior, unchanged by this feature). On reload, the shout is now fully absent from the feed rather than showing the deleted placeholder, because the admin path also soft-deletes all of the shout's comments as part of its existing behavior, leaving it indistinguishable from a zero-comment deletion once this feature's feed-visibility filter is applied. This is documented, accepted behavior (see spec.md Edge Cases / research.md Decision 6) — do not file it as a regression.

## Automated coverage pointers

- Extend `api/tests/integration/shouts.test.js` (or the shout-delete section of the existing shout integration suite) to cover: zero-comment delete → shout absent from a subsequent `GET /shouts` and `GET /shouts/:id` (404); has-comments delete → shout still present with placeholder fields, no regression.
- Extend `web/tests` coverage for `ShoutFeed.tsx` and `ShoutPage.tsx` to assert the new `remove_shout` SSE handler removes/redirects correctly, and that the existing `delete_shout` handler test(s) still pass unmodified.
