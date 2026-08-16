# Feature Specification: Anchor-Based Feed Scroll Restoration

**Feature Branch**: `009-anchor-scroll-restore`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Anchor-based feed scroll restoration (supersedes/upgrades the just-shipped pixel-based scroll restoration)"

## Background — supersedes a shipped feature, not greenfield

A pixel-offset-based version of this feature already shipped earlier in the same session (2026-08-15). It works and is live: leaving the feed saves the raw scroll pixel offset (`window.scrollY`) plus how many items were loaded, and returning re-loads that many items and scrolls back to that pixel offset, with an instant (no-flash) positioning mechanism built on a height-reserving placeholder rendered synchronously on first paint.

**The gap this feature closes**: pixel offset is "scroll to pixel Y," not "scroll to shout X." The "Все" (new) tab is a live feed — new shouts can appear above the reader's previous position while they're away (via organic reloads or live updates). When that happens, restoring to the old pixel offset lands the reader in the wrong place, since everything shifted down. This feature replaces the pixel anchor with an identity anchor: remember *which specific shout* was at the top, and relocate that same shout on return, immune to items being added above it.

**What is NOT changing**: tab (Все/Популярные) and sort (лайки/комментарии) restoration behavior, the "Назад" button's use of real browser back navigation, and the overall goal of appearing already-positioned with no visible jump to the top. These are carried forward unchanged from the shipped feature and are back-compat constraints on this one, not new work.

## Clarifications

### Session 2026-08-15

- Q: How should the system locate the page of content containing the remembered shout when it isn't in the first page loaded? → A: Keep searching by loading additional pages of content, the same way the reader would have gotten there originally, up to a defined limit — no new lookup capability is added for this. Rejected: adding a way to jump directly to the page containing a specific item, since it would require new work the reader-facing benefit doesn't clearly justify, and the existing paging approach already the shipped feature uses is proven.
- Q: Since the exact position of the remembered shout can't be known until it has actually rendered (its position depends on the height of everything above it, which varies with avatars/images/content), should the reader ever see a correction jump, or should the feed stay hidden until the position is exact? → A: Show an estimated position immediately (consistent with the shipped feature's no-visible-empty-feed guarantee), then correct precisely once the remembered shout has actually rendered. A small correction jump is an acceptable trade for never showing a blank or default-positioned feed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Return to the exact shout after new content has appeared (Priority: P1)

A reader scrolls partway down the "Все" feed, opens a shout to read its comments, and while they're reading, other users post new shouts. When the reader taps "Назад," they land back on the same shout they were reading before — not on whatever now occupies that pixel offset.

**Why this priority**: This is the entire reason for this feature over the already-shipped pixel-based version — without it, the existing feature silently drifts on exactly the feed (the live "new" tab) where readers most need it to work.

**Independent Test**: Load the feed, scroll to a specific shout, open a different browser tab (or wait) for a new shout to be posted by someone else, open a shout from the feed, tap "Назад" — the originally-viewed shout, not a neighbor, is at the top.

**Acceptance Scenarios**:

1. **Given** a reader scrolled to shout X on the "Все" tab, **When** a new shout is posted by another user and the reader then opens a different shout and returns via "Назад," **Then** shout X (not the new shout, and not whatever pixel offset X used to occupy) is positioned at the top of the viewport.
2. **Given** no new content was posted while the reader was away, **When** the reader returns via "Назад," **Then** the feed is positioned identically to how the existing pixel-based behavior already positions it (no regression for the common case).

---

### User Story 2 - No visible flash or empty-feed moment while restoring (Priority: P2)

The instant, no-flash positioning experience of the shipped pixel-based feature is preserved: the reader should never see the feed jump to the top and then jump back down, and should never see a default/empty feed state during restoration.

**Why this priority**: This was a significant, hard-won fix in the pixel-based version (multiple root causes: browser scroll clamping, native scroll restoration, effect-ordering). Losing it while switching to an identity anchor — where the exact final position is knowable only after the target shout has rendered — would be a visible regression, not a neutral trade.

**Independent Test**: Repeat User Story 1's test while recording the screen; confirm no visible jump to the top occurs at any point, only (at most) a small settling adjustment once the target shout renders.

**Acceptance Scenarios**:

1. **Given** a reader returns to the feed via "Назад," **When** the page first paints, **Then** the feed is already showing content positioned at or near the remembered shout, not the top of a freshly-loading feed.
2. **Given** the remembered shout's actual rendered position differs slightly from the initial estimate, **When** it finishes rendering, **Then** the view adjusts to the exact position — this adjustment is visibly smaller than a full return-to-top-and-back.

---

### User Story 3 - Graceful fallback when the remembered shout can't be found (Priority: P3)

If the remembered shout was deleted while the reader was away, or the reader had scrolled deep enough that locating it would mean loading an excessive number of pages, the reader still lands somewhere reasonable instead of seeing an error, a permanently blank feed, or an infinite loading state.

**Why this priority**: Necessary for correctness and to avoid a broken experience in edge cases, but affects a small minority of return visits compared to User Story 1's everyday case.

**Independent Test**: Delete a shout the reader was anchored to (or simulate scrolling deep enough to exceed the search limit), then return via "Назад" — confirm the reader lands at a defined, reasonable fallback position rather than an error or hang.

**Acceptance Scenarios**:

1. **Given** the remembered shout was deleted while the reader was away, **When** the reader returns via "Назад," **Then** the system stops searching within a bounded amount of loading and falls back to a defined position (see Assumptions) rather than continuing indefinitely.
2. **Given** the reader had scrolled deep enough that the remembered shout is beyond the defined search limit, **When** the reader returns via "Назад," **Then** the same bounded fallback applies — the feature degrades gracefully rather than loading an unbounded amount of content.

---

### Edge Cases

- The remembered shout's author was ignored/blocked by the reader in the meantime, and its content is now hidden in the feed — does hidden-but-present content still count as "found" for positioning purposes?
- The remembered shout gets pinned or unpinned (pin status affects feed ordering) while the reader is away.
- The reader was on the "Популярные" tab (not the live "Все" tab) — sort order is stable there, so drift is far less likely, but the same identity-anchor mechanism should apply uniformly rather than only to one tab.
- The reader returns via a route other than the "Назад" button (e.g. a different in-app link back to the feed) — restoration should behave the same regardless of navigation path, matching the shipped feature's current behavior (it saves on any feed unmount, not specifically the "Назад" click).
- A sessionStorage entry saved by the OLD (pixel-shape) version of this feature is still present in a reader's open tab at the moment this new (identity-shape) version is deployed — must not crash or restore to a nonsensical position.
- The reader rapidly navigates away and back multiple times in quick succession, potentially starting a second restoration before the first has finished.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST identify and remember which specific shout was positioned at, or nearest to, the top of the visible feed at the moment the reader navigates away from it.
- **FR-002**: System MUST, upon the reader's return to the feed, attempt to locate the remembered shout among the feed's current content.
- **FR-003**: When the remembered shout is found, system MUST position the view so that shout appears in the same place at the top of the viewport that it occupied when the reader left (accounting for how far into it they had scrolled, not just "shout X is visible somewhere").
- **FR-004**: Restoration accuracy MUST NOT depend on the number of items loaded matching what was loaded before — the system locates the remembered shout by its identity, so results remain correct even when unrelated content has been added ahead of it since the reader left.
- **FR-005**: System MUST search progressively further into the feed's content (loading more, the same way the reader originally reached that point) if the remembered shout is not present in what's initially loaded, up to a bounded search limit.
- **FR-006**: System MUST apply a defined fallback behavior when the remembered shout cannot be located within the bounded search limit (see Assumptions for the specific fallback), rather than searching indefinitely or leaving the reader on an error/blank state.
- **FR-007**: System MUST NOT show the reader a default (top-of-feed) position, or an empty feed, at any point while restoration is in progress — an estimated position must be shown immediately, refined to the exact position once the remembered shout has rendered (per Clarifications).
- **FR-008**: System MUST continue to restore the previously-selected feed tab (Все/Популярные) and, when applicable, sort order (лайки/комментарии), unchanged from the already-shipped behavior.
- **FR-009**: System MUST treat a saved restoration entry that does not match the current (identity-based) data shape — including one saved by the prior pixel-based version — as if there were nothing to restore, without error.
- **FR-010**: System MUST NOT change feed behavior for a reader who arrives at the feed by any means other than returning from a saved-position navigation (e.g. a first visit, or navigating in from somewhere that never had a feed position to remember).

### Key Entities

- **Feed position anchor**: The remembered state describing where a reader was in the feed — which shout was at the top, how far scrolled into it they were, and which tab/sort was active. Replaces the prior pixel-offset-based saved state.
- **Shout**: An existing entity (a post in the feed); this feature only reads its identity and position, it does not change what a shout is or how it's created/edited/deleted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader who returns to the feed after new content was added above their previous position lands with the same shout they were viewing at the top of the screen, every time, regardless of how much new content appeared.
- **SC-002**: A reader who returns to the feed with no new content added sees positioning at least as accurate as the already-shipped pixel-based behavior (no regression).
- **SC-003**: No reader sees the feed visibly jump to the top before settling at the correct position — at most a small settling adjustment, distinctly smaller than the full scroll distance, occurs after content renders.
- **SC-004**: When the remembered shout genuinely cannot be found (deleted, or beyond the search limit), the reader reaches a stable, defined position within a bounded amount of loading — never an indefinite loading state or a broken/blank page.
- **SC-005**: A reader's open tab that still holds a saved position from the prior (pixel-based) version of this feature at the moment this version deploys experiences a normal fresh feed load, not an error or a nonsensical scroll position.

## Assumptions

- **Search limit / fallback (FR-005, FR-006, SC-004)**: a specific bounded number of pages/items to search before giving up is an implementation-level tuning decision, not a product decision — a reasonable default (e.g., comparable to a typical single reading session's worth of content) will be chosen during planning rather than specified here. The fallback position when giving up is: land at the top of the freshest content, exactly as a reader arriving at the feed for the first time would — no secondary attempt to approximate the old pixel-based behavior as a fallback (rejected during clarification: keeping two restoration mechanisms alive long-term adds ongoing complexity for a rare edge case).
- **Hidden-but-present content**: a remembered shout whose author was since ignored, but which is still present in the loaded data, counts as "found" for positioning purposes — the reader lands where it is even though its content is visually collapsed, consistent with how ignored users' content is handled elsewhere in the feed today (collapsed, not removed).
- **Existing shipped feature as the baseline**: this feature modifies, not replaces from scratch, the pixel-based scroll restoration that shipped earlier in the same session (2026-08-15) — specifically the save/restore mechanism, the instant no-flash positioning approach (reserved placeholder + immediate positioning + settle correction), the tab/sort restoration, and the "Назад" button's use of real browser back navigation. Those mechanisms' proven pieces (why raw `window.scrollY` can't be read at unmount time, why native browser scroll restoration must stay disabled, why restoration data must be read synchronously on first render rather than in a later effect) continue to apply and must not be reintroduced as bugs.
- **Single mechanism, not two**: the shipped pixel-based mechanism is fully replaced by the identity-based one for feed-scroll restoration — the two are not intended to run side by side long-term.
- **Scope boundary**: this feature governs feed scroll-position restoration only. It does not change how shouts are created, deleted, paginated, or displayed, and does not add any new capability for looking up a specific shout by ID outside of this restoration flow.
