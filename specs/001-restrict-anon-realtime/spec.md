# Feature Specification: Restrict Realtime Updates to Authenticated Users

**Feature Branch**: `001-restrict-anon-realtime`

**Created**: 2026-06-23

**Status**: Draft

**Input**: User description: "Restrict not authorized users from seeing any realtime updates, e.g new posts, comments, likes. No SSE"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Anonymous visitor receives no live updates (Priority: P1)

A visitor who is not signed in opens the site and browses the feed and individual shouts. While they are viewing a page, other people create new shouts, add comments, and add likes. The anonymous visitor's view does **not** change in real time: counts and lists stay exactly as they were when the page loaded. To see anything newer, the visitor must reload the page or navigate.

**Why this priority**: This is the core of the feature. Without it, unauthenticated visitors continue to receive live pushed updates, which is the exact behavior the feature exists to remove. Delivering only this story already satisfies the primary requirement.

**Independent Test**: Open the site in a browser without signing in, load the feed, then (from a separate signed-in session) create a new shout, comment, and like. Confirm the anonymous view shows no live change until it is manually reloaded, and that no realtime/streaming connection is established for the anonymous session.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor is viewing the feed, **When** another user publishes a new shout, **Then** the new shout does not appear in the anonymous visitor's feed until they reload or navigate.
2. **Given** an anonymous visitor is viewing a shout with its comments, **When** another user adds a comment to that shout, **Then** the comment count and comment list shown to the anonymous visitor do not change until they reload.
3. **Given** an anonymous visitor is viewing a shout, **When** another user likes that shout, **Then** the like count shown to the anonymous visitor does not change until they reload.
4. **Given** an anonymous visitor loads any page, **When** the page initializes, **Then** no persistent realtime/streaming connection is opened for that visitor.

---

### User Story 2 - Authenticated user keeps full realtime experience (Priority: P1)

A signed-in user continues to receive live updates exactly as before: new shouts, comment activity, like changes, and personal notifications appear without a manual reload.

**Why this priority**: The feature must restrict only unauthenticated visitors. If the change degraded the realtime experience for signed-in users, it would break existing, expected behavior. This guards against over-applying the restriction and is therefore equally critical (P1).

**Independent Test**: Sign in, load the feed and a shout, then from a separate session generate new shouts, comments, and likes. Confirm the signed-in view updates live without reloading.

**Acceptance Scenarios**:

1. **Given** a signed-in user is viewing the feed, **When** another user publishes a new shout, **Then** the signed-in user sees the update live without reloading (subject to existing realtime behavior such as pinned/new-tab rules).
2. **Given** a signed-in user is viewing a shout, **When** another user comments or likes it, **Then** the signed-in user sees the updated counts/content live.
3. **Given** a signed-in user's session ends or they sign out, **When** the session is no longer authenticated, **Then** the realtime connection stops delivering further updates to that now-unauthenticated client.

---

### User Story 3 - Transition between signed-out and signed-in states (Priority: P2)

A visitor who signs in during a session begins receiving realtime updates from that point forward without needing extra steps; a user who signs out stops receiving them.

**Why this priority**: Correct behavior at the auth-state boundary prevents both a degraded experience (a user signs in but stays "stuck" with no live updates) and a leak (a user signs out but keeps receiving live updates). It is important but secondary to the two core flows.

**Independent Test**: Start anonymous (no live updates), sign in, and confirm live updates begin; then sign out and confirm live updates stop — all within the expected behavior of an established session.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor with no realtime updates, **When** they successfully sign in, **Then** they begin receiving realtime updates without manual intervention beyond normal post-login flow.
2. **Given** a signed-in user receiving realtime updates, **When** they sign out, **Then** realtime updates stop for that client.

---

### Edge Cases

- **Expired/invalid session while connected**: If a session expires or is invalidated while a realtime connection is open, the system MUST stop delivering further updates to that client rather than continuing to stream to a now-unauthenticated session.
- **Anonymous client attempts to subscribe directly**: If an unauthenticated client attempts to open the realtime channel directly (e.g. by crafting the request), the system MUST refuse the connection rather than accept it and silently send nothing.
- **Banned or soft-deleted account**: A request whose session does not correspond to a valid, active account MUST be treated as unauthorized for realtime purposes.
- **Stale view after long idle**: An anonymous visitor who leaves a page open for a long time sees stale content; the expected remedy is a manual reload. No live "new content available" prompt is shown to anonymous visitors.
- **Initial page content**: Static content already present at page load (the feed and counts as of the request) is unaffected — the restriction applies only to *live* updates after load, not to the visitor's ability to read public content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST deliver realtime updates (new shouts, new comments, comment-count changes, like-count changes, and other live activity) only to authenticated sessions.
- **FR-002**: The system MUST NOT establish or maintain a realtime update channel for unauthenticated (anonymous) visitors.
- **FR-003**: The system MUST reject any attempt by an unauthenticated client to open or subscribe to the realtime update channel.
- **FR-004**: The system MUST continue to deliver the existing realtime experience to authenticated users without regression, including new shouts, comment activity, like changes, and personal notifications.
- **FR-005**: Unauthenticated visitors MUST still be able to view public content that is present at page load; only post-load live updates are withheld from them.
- **FR-006**: When a session that holds an open realtime connection becomes unauthenticated (sign-out, expiry, or invalidation), the system MUST stop delivering further realtime updates to that client.
- **FR-007**: When an anonymous visitor signs in during a session, the system MUST begin delivering realtime updates to them as part of the normal authenticated experience, without requiring steps beyond the standard sign-in flow.
- **FR-008**: Authorization for the realtime channel MUST be evaluated authoritatively on the server; the absence of a client-side connection alone MUST NOT be the only thing preventing delivery to unauthorized clients.
- **FR-009**: The behavior MUST be consistent across all places realtime updates are surfaced (feed views, individual shout/comment views, and like indicators).

### Key Entities *(include if feature involves data)*

- **Visitor session**: Represents the current viewer's authentication state (authenticated vs. anonymous). Determines eligibility for realtime updates. No new persisted data is required beyond the existing session/authentication state.
- **Realtime update**: A live event describing a change to public activity (new shout, new comment, count change). Relevant attribute for this feature: the eligibility gate that determines which sessions may receive it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of unauthenticated page sessions establish zero realtime update connections.
- **SC-002**: For an anonymous visitor, 0 of newly created shouts, comments, or likes appear in their already-loaded view without a manual reload, across repeated tests.
- **SC-003**: Authenticated users experience no measurable regression in realtime updates: new activity continues to appear live within the same latency as before the change (no slower than the prior realtime experience).
- **SC-004**: 100% of direct realtime-subscription attempts from unauthenticated clients are refused.
- **SC-005**: When a connected session transitions to unauthenticated (sign-out/expiry), further realtime updates to that client cease within one update cycle (no continued delivery after the session is no longer valid).

## Assumptions

- "Not authorized" / "not authenticated" refers to anonymous visitors who are **not signed in**. Banned or soft-deleted accounts whose sessions are not valid active accounts are likewise treated as unauthorized for realtime purposes.
- The feature restricts **live (push) updates only**. Anonymous visitors retain their existing ability to read public content rendered at page load; gating general public read access is out of scope.
- The intended remedy for anonymous visitors to see newer content is a normal page reload or navigation. No new "new content available" banner, polling fallback, or alternative refresh mechanism is introduced for anonymous visitors as part of this feature.
- Personal notifications are inherently per-user and already require authentication; they are unaffected except insofar as they remain unavailable to anonymous visitors.
- The existing session-based authentication mechanism is the authoritative source for determining whether a viewer is authorized to receive realtime updates.
- This is a behavior/access-control change; no new user-visible UI copy is required for anonymous visitors. If any messaging is later added, it must follow the project's Russian-language UI requirements.
