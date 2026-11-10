# Research: Live Comments Feed Sidebar

**Feature**: `012-comments-feed` | **Date**: 2026-11-04

## Decisions

### 1. Data source for initial fill

**Decision**: Reuse `GET /api/v1/shouts?limit=40&sortBy=new` and flatten nested `comments` from `enrichFeed()`.

**Rationale**: Extension already proved this path avoids N× `/shouts/:id` 429s; backend already returns comment DTOs with media/gallery.

**Alternatives considered**: New `/comments/recent` endpoint — rejected (extra API surface for a frontend port; Spec says no backend change).

### 2. Live transport

**Decision**: `useSSE` against shared `SSEProvider` for `new_comment`, `edit_comment`, `delete_comment`, `new_shout`, `edit_shout`.

**Rationale**: Extension used an injected sse-bridge because it lived outside React; site already owns EventSource.

**Alternatives considered**: Polling — rejected (latency + load). Duplicate EventSource — rejected (docs mandate single shared connection).

### 3. Persistence

**Decision**: In-memory only for buffer, panelOpen, unseen. Cold start rehydrates from API.

**Rationale**: Extension port notes explicitly drop chrome.storage; Constitution I discourages new client persisted state adjacent to auth; panel preference is low-value vs complexity.

**Alternatives considered**: `sessionStorage` for panelOpen — rejected for this feature (FR-013).

### 4. Hard ignore (ЧС)

**Decision**: Do not port. Soft-hide only via `IgnoredUsersContext`.

**Rationale**: ЧС is extension-only chrome.storage; site already has native ignore.

### 5. Media presentation

**Decision**: Boolean attachment → Russian «[медиа]» label; never render `<img>` / video / YouTube in the sidebar.

**Rationale**: Constitution III — reclaimed media must not surface as broken images; matches extension compact mode.

### 6. Content rendering helpers

**Decision**: Extract compact spoilers/mentions/URLs into `web/utils/renderContent.tsx` for CommentFeed; leave full ShoutCard `ContentWithReadMore` in place for this PR unless extract is trivial.

**Rationale**: Design-first reuse without a risky mega-refactor of ShoutCard in the same PR. CommentFeed needs clamp-to-4-lines, not read-more.

**Alternatives considered**: Duplicate DOM string builders from extension — rejected (React site should use JSX). Full ShoutCard extract in this PR — deferred if it balloons the diff.

### 7. Pin expand for jump-to-comment

**Decision**: Add `forcePinnedExpanded` prop on `ShoutCard` that clears internal collapse state + `localStorage` key inside the component.

**Rationale**: Extension poked localStorage from outside — port notes forbid that from the feed module.

### 8. Layout

**Decision**: CSS class on `document.documentElement` (e.g. `comment-feed-open`) with `--comment-feed-width: 340px`; desktop `main` margin-right; mobile ≤767px full overlay.

**Rationale**: Parity with proven extension CSS; sticky header stays full width.

### 9. Provider placement

**Decision**: `CommentFeedProvider` inside `IgnoredUsersProvider` (needs `isIgnored`) and inside `SSEProvider` (needs `useSSE`), mounted from `App.tsx` so Header + Panel share state.

## Test coverage approach

Vitest + Testing Library: mock `useSSE` / fetch hydrate; assert toggle, badge, soft-hide, media label, merge rules. Manual quickstart for mobile overlay and pin jump.
