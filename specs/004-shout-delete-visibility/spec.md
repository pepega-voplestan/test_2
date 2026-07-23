# Feature Specification: Hide Uncommented Shouts on Delete

**Feature Branch**: `004-shout-delete-visibility`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "currently, if shout is deleted, regardless of number of comments, it will stay with a placeholder. I'd like to introduce a small change, so that when user deletes a shout, it will check for number of comments. If number of comments is 0, then it will be hidden from the main feed as well completely. If at least 1 comment is there upon the action of deletion, then no behaviour change. It should happen live obviously to everybody"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deleting a shout with no comments removes it entirely (Priority: P1)

A user deletes their own shout that has never received any comments. Instead of leaving behind a "deleted" placeholder card, the shout disappears completely from the main feed for every viewer, immediately.

**Why this priority**: This is the entire point of the feature — today every deletion leaves a tombstone placeholder even when there is no discussion attached to preserve. Removing empty, commentless shouts fully declutters the feed and matches user expectation that deleting something with no replies should make it vanish, not leave a ghost card.

**Independent Test**: Can be fully tested by posting a shout, deleting it before anyone comments, and confirming the shout is no longer present anywhere in the main feed (for the author and for other users watching the feed live) — no placeholder card remains.

**Acceptance Scenarios**:

1. **Given** a shout authored by User A with zero comments, **When** User A deletes the shout, **Then** the shout is immediately removed from the main feed for User A, with no placeholder left in its place.
2. **Given** a shout authored by User A with zero comments, and User B is currently viewing the main feed, **When** User A deletes the shout, **Then** the shout disappears from User B's feed in real time, without User B needing to refresh.
3. **Given** a shout with zero comments has just been deleted, **When** any user loads or reloads the main feed afterward, **Then** the deleted shout does not appear at all (no tombstone, no gap placeholder).

---

### User Story 2 - Deleting a shout that already has comments keeps current behavior (Priority: P2)

A user deletes their own shout that already has one or more comments. The shout remains visible in the feed as a "deleted" placeholder, exactly as it behaves today, so the existing comment thread stays reachable and in context.

**Why this priority**: This preserves the existing, already-working behavior for the common case where a discussion exists under the shout. It is lower priority than Story 1 only because it is a "no change" requirement rather than new functionality, but it must be explicitly verified so the new logic doesn't regress it.

**Independent Test**: Can be fully tested by posting a shout, having another user add at least one comment, deleting the shout, and confirming the placeholder still appears in the feed with the comment(s) still reachable, unchanged from current behavior.

**Acceptance Scenarios**:

1. **Given** a shout authored by User A with at least one comment, **When** User A deletes the shout, **Then** the shout remains in the main feed as a deleted placeholder, identical to current behavior.
2. **Given** a shout with at least one comment is deleted, **When** other users are viewing the main feed live, **Then** the shout live-updates in place to the deleted placeholder (not removed, not left unchanged).

---

### Edge Cases

- What happens if a comment is added to a shout in the same instant it is being deleted (race between "add comment" and "delete shout")? The comment count used for the live-broadcast decision (which SSE event fires — see FR-001) MUST be the count at the moment the deletion is processed; if a comment is recorded before deletion completes, that broadcast follows the "has comments" (placeholder) path, not the "hidden" path. In the same narrow window, the deleting user's own client may briefly reflect a different outcome locally than what the server just decided (e.g. it locally believed there were zero comments and removed the shout from its own view, while the server, seeing the new comment, broadcast the placeholder update to everyone else). This is accepted as a rare, self-healing inconsistency — a subsequent reload reconciles the deleting user's view with the server's authoritative state — and is not addressed with an extra round-trip or response payload.
- What happens if all comments are later deleted from a shout that is showing as a placeholder (deleted with comments)? On the next main-feed load/reload, that shout's comment count is now zero, so it is fully hidden from that point on — per FR-006, feed visibility is evaluated live on each read, not fixed permanently at the original deletion time. This is accepted, intended behavior, not a regression.
- What happens if a comment is somehow added to a shout after it was already fully hidden (e.g., someone with a stale direct link to the shout, viewing it before this feature's exclusion applied to that view, submits a reply)? On the next main-feed load/reload, that shout now has a non-zero comment count, so it reappears as a placeholder — per FR-006, the same live-evaluation logic. This is accepted, intended behavior; the comment-creation path is not modified to guard against it as part of this feature.
- What happens to comments on a shout that gets fully hidden (the zero-comment case)? By definition this case has zero comments, so there is nothing additional to hide or clean up.
- What happens if a user has a direct link open to a shout (outside the main feed) that gets fully hidden after deletion? It should behave consistently with a removed/unavailable shout rather than showing the deleted-placeholder view, since the placeholder view is reserved for shouts with comments.
- What happens to a pinned shout with zero comments when it is deleted? It is removed entirely like any other zero-comment shout, and no longer occupies the pinned slot.
- What happens to a pinned shout with one or more comments when it is deleted? This feature preserves the placeholder for it, same as any non-pinned has-comments shout — however, the pinned-shout prefetch query already unconditionally excludes all deleted shouts on reload (a pre-existing behavior, independent of this feature), so today it already loses its placeholder and simply stops being prepended after a reload. This asymmetry with the "new" tab's non-pinned query predates this feature and is not introduced or fixed by it.
- What happens when a shout is deleted through the moderator/admin panel instead of by its author? This path is out of scope for this feature (FR-007) and is not modified by it. However, the admin deletion path already soft-deletes all of that shout's comments as part of its existing behavior, independent of this feature. As an accepted side effect of this feature's feed-visibility rule (FR-002/FR-006), an admin-deleted shout — having no remaining non-deleted comments by the time the rule is evaluated — will also be fully hidden from the main feed rather than showing the placeholder, regardless of how many comments it had before the admin deleted it. This is a known, accepted consequence of not modifying the admin path, not a defect to fix as part of this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a user deletes their own shout, the system MUST determine, at the time of deletion, how many comments exist on that shout. This determination decides which live broadcast is sent (see FR-004/FR-005); it is a point-in-time decision for that broadcast only, not a permanently stored record (see FR-006 note on live re-evaluation).
- **FR-002**: If the shout has zero comments at the time of deletion, the system MUST remove it from the main feed entirely for all users, rather than showing a "deleted" placeholder.
- **FR-003**: If the shout has one or more comments at the time of deletion, the system MUST preserve current behavior exactly: the shout remains visible in the main feed as a deleted placeholder.
- **FR-004**: The removal (zero-comment case) MUST be reflected live, in real time, to all users currently viewing the main feed, without requiring them to refresh or navigate away.
- **FR-005**: The live-update behavior for the has-comments case (placeholder) MUST continue to work exactly as it does today, for all users currently viewing the main feed.
- **FR-006**: On each main-feed load, reload, or pagination request, feed visibility for a deleted shout MUST be evaluated from its *current* non-deleted comment count at read time, not from a permanently stored decision. Under normal operation this keeps a zero-comment deletion hidden indefinitely (FR-002) and a has-comments deletion visible as a placeholder indefinitely (FR-003). It is an accepted consequence of this live evaluation — not a defect — that a shout's visibility can change later if its comment count changes after deletion (see Edge Cases: a placeholder shout whose only comment(s) are later deleted will subsequently disappear; a fully-hidden shout that somehow receives a new comment afterward — e.g. via a stale direct link — will subsequently reappear as a placeholder). Both cases resolve on the next feed load/reload.
- **FR-007**: This feature's comment-count-based branching (FR-001–FR-006) applies to author-initiated shout deletion. The system MUST continue to enforce that only the shout's author can trigger it. Moderator/admin-initiated deletion is a separate, pre-existing path that this feature does not modify; its interaction with the new feed-visibility rule is documented as an accepted, known side effect rather than a guarantee (see Edge Cases and Assumptions).
- **FR-008**: Underlying comment data and deletion records MUST be preserved per existing soft-delete/data-retention rules; "hidden from the feed" refers to feed visibility only, not destruction of the underlying record.

### Key Entities

- **Shout**: A post in the main feed; has an author, content, an associated comment collection, and a deleted state. This feature adds a distinction in how a deleted shout is presented, based on whether its comment collection is currently empty — evaluated once (for the live broadcast) at deletion time, and again on every subsequent feed read (see FR-006).
- **Comment**: A reply attached to a shout. Its live, non-deleted count on a given shout — at the moment of deletion, and again at each later feed read — determines which presentation (full removal vs. placeholder) applies at that moment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of shouts deleted with zero comments are absent from the main feed via the same SSE broadcast path and latency as the existing deleted-placeholder update (i.e., no new or additional delay is introduced beyond what today's live update already takes).
- **SC-002**: 100% of shouts deleted by their author with one or more comments continue to display the deleted placeholder exactly as before, with zero regressions in existing placeholder behavior. (Moderator/admin-initiated deletion is out of scope — see FR-007 and Edge Cases.)
- **SC-003**: Users viewing the main feed at the moment a zero-comment shout is deleted see it disappear without performing any manual action (no refresh, no re-navigation).
- **SC-004**: A reload of the main feed after a zero-comment deletion never shows a placeholder or gap for that shout, under normal operation (i.e., as long as its live non-deleted comment count remains zero — see FR-006).

## Assumptions

- "Main feed" refers to the primary shout feed/timeline (all its tabs, e.g. "new"/"popular"), not a per-user profile page or a direct single-shout permalink view; behavior for those other surfaces should be reasonably consistent with this rule but is not the primary focus of this feature. In particular, the profile page's own shout listing (`GET /users/:id`, in `api/src/routes/users.js`) already unconditionally excludes all deleted shouts — with or without comments — on reload, and its client-side `removeShout` callback (`web/components/ProfilePage.tsx`) is not wired to any live SSE update for other viewers. This feature intentionally does not touch either of those, so immediately after a profile-page author deletes a zero-comment shout they may briefly see the existing local placeholder until they reload/navigate, at which point it already disappears under the profile page's pre-existing behavior. This is accepted as a bounded, cosmetic inconsistency, analogous to a pre-existing one on the "popular" tab and the pinned-shout prefetch (both already unconditionally exclude all deleted shouts on reload, with or without comments, independent of this feature), not a defect this feature must fix.
- Only top-level comments on the shout count toward the "zero comments" check; the platform does not support nested replies, so there is no deeper reply tree to consider.
- Comments that are themselves already deleted/soft-deleted do not count toward the comment total used for this decision — the check reflects currently-visible comments, consistent with how comment counts are computed elsewhere in the app.
- The real-time update mechanism already used to push other live feed changes (e.g., today's deleted-placeholder update, new-shout inserts) is reused for this new "fully remove" update; no new delivery channel is introduced.
- A pinned shout with zero comments follows the same full-removal rule as any other shout; no special-cased exemption is assumed.
- Feed visibility for deleted shouts is intentionally implemented as a live, continuously-re-evaluated check against current non-deleted comment count on every read — not a decision frozen/stored once at deletion time. No schema change (e.g. a stored "hidden" flag) is introduced to make the decision permanent. This is a deliberate simplicity choice: it keeps the feature to a query-level change with no migration, and the two resulting edge cases (a placeholder shout can later disappear if its comments are all removed; a hidden shout can later reappear if a comment is somehow added to it) are accepted as self-healing on next reload rather than treated as defects.
- The moderator/admin deletion path (AdminJS panel) is intentionally left unmodified by this feature. It already soft-deletes all comments on the shout it deletes, and does not broadcast a live update — both pre-existing behaviors. Because it always leaves the shout with zero non-deleted comments, this feature's feed-visibility rule will, as a side effect, also fully hide admin-deleted shouts rather than showing the placeholder that appears today; this is accepted as reasonable given the admin path's own comment-cascade behavior, not treated as a regression to prevent.
