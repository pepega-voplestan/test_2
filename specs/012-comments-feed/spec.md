# Feature Specification: Live Comments Feed Sidebar

**Feature Branch**: `012-comments-feed`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Port the live comments sidebar from the VopleXtender Chrome extension (`comment-sidebar.js`) into the Vopley.net React web app. Drop chrome.storage persistence, hard-ignore (ЧС), and the SSE bridge; use React + existing SSEProvider / IgnoredUsersProvider. Compact rows without avatars; attachments shown only as the Russian label «[медиа]». Auth-required header toggle before the notifications bell."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open the live comments feed (Priority: P1)

A logged-in user clicks the comments icon in the header (immediately before the notifications bell) and a right-hand sidebar opens showing the newest comments across recent shouts. Each row quotes the parent shout (text and/or «[медиа]»), then shows the comment author name, relative time, body text (with spoilers/mentions), and «[медиа]» when the comment has attachments. Closing the panel hides it; reopening keeps working against the live buffer.

**Why this priority**: Without the toggle + initial list, there is no feature. This is the MVP slice.

**Independent Test**: Sign in, click the comments icon, verify the panel opens with rows (or the empty Russian placeholder) and closes again on a second click.

**Acceptance Scenarios**:

1. **Given** a logged-in user, **When** they look at the header, **Then** they see a comments-feed button between search and the notifications bell.
2. **Given** the panel is closed, **When** they activate the button, **Then** a sidebar opens with aria-label «Лента комментов» and either comment rows or «Пока нет комментов — ждём обновления…».
3. **Given** the panel is open, **When** they activate the button again, **Then** the panel closes and the main feed returns to full width.
4. **Given** a guest (not logged in), **When** they view the header, **Then** the comments-feed button is absent.

---

### User Story 2 - Receive live comment updates (Priority: P1)

While the user is signed in, new comments appear at the top of the feed in real time; edits update the matching row; deletes remove it. If the panel is closed, an unread badge counts new comments (capped display «9+»). Opening the panel clears the badge.

**Why this priority**: Live updates are the core value over a static list; without SSE the port is incomplete.

**Independent Test**: With the panel open, create/edit/delete a comment from another session (or simulated SSE) and verify the sidebar reflects each change; with the panel closed, verify the badge increments and clears on open.

**Acceptance Scenarios**:

1. **Given** the panel is open and stick-to-top is active, **When** a `new_comment` event arrives, **Then** a new row is prepended and the list stays scrolled to the newest items.
2. **Given** a comment is already in the buffer, **When** an `edit_comment` event arrives with new content, **Then** that row's body updates in place.
3. **Given** a comment is in the buffer, **When** a `delete_comment` event arrives, **Then** that row is removed; if the buffer becomes empty, the empty placeholder is shown.
4. **Given** the panel is closed, **When** new comments arrive, **Then** the badge shows the unseen count (or «9+» above 9); **When** the user opens the panel, **Then** the badge clears.

---

### User Story 3 - Soft-hide ignored authors (Priority: P2)

Comments from users on the site's ignore list appear as a soft-hide overlay («Контент от этого пользователя скрыт») matching CommentCard; clicking reveals that row for the session. Removing someone from ignore restores full rows.

**Why this priority**: Parity with the rest of the site; without it ignored users leak into the sidebar.

**Independent Test**: Ignore a user who has a comment in the buffer; verify overlay; reveal; un-ignore and verify full content returns.

**Acceptance Scenarios**:

1. **Given** an author is ignored and the comment is not yet revealed, **When** the row renders, **Then** only the shout quote and the soft-hide overlay are shown (no body/media label).
2. **Given** the overlay is visible, **When** the user clicks it, **Then** the full comment row is shown for that comment id until ignore state changes.
3. **Given** a user is newly added to ignore, **When** their comments are in the buffer, **Then** those rows return to the overlay (previous reveals cleared for that user).

---

### User Story 4 - Jump from a feed row to the comment (Priority: P2)

Clicking a comment body (or its «[медиа]» label) navigates to `/shout/:shoutId?comment=:commentId`. Clicking the shout quote navigates to `/shout/:shoutId`. If the target shout is the pinned shout and collapsed, it expands so the comment node can be scrolled into view. On mobile overlay layout, navigating closes the panel.

**Why this priority**: Discovery without navigation is incomplete; pin expand is required for jump reliability.

**Independent Test**: Click a row → land on shout page focused on the comment; with a collapsed pin, verify expand + scroll; on a narrow viewport, verify the overlay closes after navigate.

**Acceptance Scenarios**:

1. **Given** a visible comment row, **When** the user clicks the comment text (not a spoiler/mention/url), **Then** they navigate to `/shout/:id?comment=:commentId`.
2. **Given** a visible shout quote, **When** the user clicks it, **Then** they navigate to `/shout/:id`.
3. **Given** the target shout is pinned and collapsed, **When** the user jumps to a comment on it, **Then** the pin expands and the comment element is scrolled into view.
4. **Given** a mobile viewport (≤767px) with the overlay open, **When** the user navigates from a row, **Then** the overlay closes.

---

### User Story 5 - Mobile full-width overlay (Priority: P3)

On viewports ≤767px the open panel covers the full width as an overlay (main content hidden/non-interactive) instead of shrinking the feed beside a 340px column.

**Why this priority**: Desktop sidebar already delivers value; mobile layout is required for usable phones but secondary to P1/P2.

**Independent Test**: Open the panel at ≤767px width; verify full-bleed overlay and that closing restores the main content.

**Acceptance Scenarios**:

1. **Given** a viewport ≤767px, **When** the panel opens, **Then** it spans the full width below the sticky header and the main feed is not interactable behind it.
2. **Given** a viewport >767px, **When** the panel opens, **Then** main content shifts left by the sidebar width (~340px) and the sticky header stays full width.

---

### Edge Cases

- Hydrate from `GET /api/v1/shouts` must upsert into the buffer and MUST NOT drop rows that arrived via SSE during the fetch; deletes remain exclusive to `delete_comment`.
- Buffer capped at 40 newest comments; older rows fall off.
- Hydrate requests are throttled (≥60s between non-forced calls) to avoid 429 storms on reopen/visibility.
- Media-only shouts/comments show «[медиа]» with empty or dash quote text — never broken image tags.
- While shout quote meta is still resolving, do not flash a premature «—»; show a blank placeholder until resolved or given up.
- Sticky «К новым ↑» appears when the user scrolls away from the top; clicking jumps to newest.
- Tab visibility / coming back online triggers a throttled rehydrate and refreshes dirty UI.
- Extension-only ЧС (hard ignore) and chrome.storage persistence are out of scope — not ported.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Logged-in users MUST see a comments-feed toggle in the header immediately before the notifications bell; guests MUST NOT.
- **FR-002**: Activating the toggle MUST open/close a right-side panel labeled «Лента комментов».
- **FR-003**: Initial fill MUST come from flattening comments on a recent `sortBy=new` shouts page (limit 40), keeping at most the 40 newest comments.
- **FR-004**: Live add/edit/delete MUST be driven exclusively by site SSE events `new_comment`, `edit_comment`, `delete_comment` (via existing `SSEProvider` / `useSSE`).
- **FR-005**: Shout quote meta MAY be updated from `new_shout` / `edit_shout` SSE and from hydrate payloads; the client MUST NOT N× fetch `/shouts/:id` per row.
- **FR-006**: Rows MAY render a compact Discord-style avatar (≈ nick glyph height) next to the author name; attachments MUST render only as the Russian label «[медиа]», never as embeds/thumbnails.
- **FR-015**: When a comment has `replyToId`/`quote`, the row MUST show a reply bar (site QuoteBlock semantics: ignored / deleted / `@name:` + text; clickable jump to parent comment when allowed).
- **FR-016**: Sidebar bodies and shout quotes MUST keep `||spoiler||` / `@[name:id]` tokens for rich render; URLs in the sidebar MUST stay plain text (no external navigation from the panel).
- **FR-017**: Buffer MUST keep at most the 40 newest comments (no pagination).
- **FR-007**: Comment bodies MUST render `@[username:userId]` mentions, URLs, and `||spoiler||` tokens consistently with the site.
- **FR-008**: Ignored authors MUST soft-hide like CommentCard; hard-ignore from the Chrome extension MUST NOT be implemented.
- **FR-009**: Unseen comments while the panel is closed MUST update a badge (display cap «9+»); opening clears unseen.
- **FR-010**: Desktop open state MUST shift main content by the sidebar width; mobile (≤767px) MUST use a full-width overlay.
- **FR-011**: Navigation from a row MUST use the existing SPA router; mobile overlay MUST close on navigate.
- **FR-012**: Jumping to a comment on a collapsed pinned shout MUST expand that pin via ShoutCard React state/props (not by poking `localStorage` from the feed module).
- **FR-013**: Panel open state and buffer MUST be in-memory only (no chrome.storage / no new localStorage keys for this feature).
- **FR-014**: All new user-visible strings MUST be Russian with correct declensions.

### Key Entities

- **CommentFeedItem**: Client-side row — comment id, shout id, author id/name, content, timestamp, comment attachment flags, shout preview text, shout attachment flags.
- **ShoutMeta (cache)**: Per-shout preview text + attachment flags used by quote strips.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user can open the comments feed and see recent comments within one hydrate round-trip of opening (or immediately if already hydrated).
- **SC-002**: New comments from other users appear in the open panel without a page reload.
- **SC-003**: No row ever renders a broken media image; attachment presence is always the «[медиа]» label.
- **SC-004**: Guests never see the toggle; ignored authors are soft-hidden.
- **SC-005**: Jump-to-comment works for normal and collapsed-pinned shouts on desktop and mobile.

## Assumptions

- Existing `GET /api/v1/shouts` + `enrichFeed()` already nests comments suitable for hydrate; no new API endpoint is required.
- `SSEProvider` already emits the needed events for authenticated users.
- Russian UI copy matches the extension strings already in production use on VopleXtender.
- Pin collapse continues to use its existing `localStorage` key inside ShoutCard only.
