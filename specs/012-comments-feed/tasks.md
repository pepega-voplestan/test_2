# Tasks: Live Comments Feed Sidebar

**Input**: Design documents from `/specs/012-comments-feed/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/comment-feed-client.md](./contracts/comment-feed-client.md), [quickstart.md](./quickstart.md)

**Tests**: Included (Vitest + Testing Library), per research.md.

**Organization**: Phases by user story (US1–US5 from spec.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Create branch `012-comments-feed` and Spec Kit tree under `specs/012-comments-feed/` (this folder).
- [X] T002 [P] Add `web/utils/commentFeedPreview.ts` with `previewText`, `sanitizeShoutPreviewText`, `hasAttachment`.
- [X] T003 [P] Add `web/utils/commentFeedTime.ts` with relative Russian time via `plural`.
- [X] T004 [P] Add `web/utils/renderContent.tsx` exporting `InlineSpoiler` + `renderCommentContent` (mentions/URLs/spoilers).

---

## Phase 2: Foundational

- [X] T005 Implement `web/context/CommentFeedContext.tsx`: in-memory buffer, hydrate upsert, throttle, SSE listeners, ignore-aware helpers, panel/unseen/stick state.
- [X] T006 Wire `CommentFeedProvider` in `web/App.tsx` under `IgnoredUsersProvider` (inside `SSEProvider`); mount `CommentFeedPanel` at app shell level.
- [X] T007 Add CSS/layout class `comment-feed-open` (340px desktop; ≤767px overlay) affecting `main` margin / visibility.

**Checkpoint**: Provider mounts without UI toggle; hydrate can be triggered programmatically.

---

## Phase 3: User Story 1 — Open the feed (P1) 🎯 MVP

- [X] T008 [US1] Implement `web/components/CommentFeedToggle.tsx` (chat icon + badge slot).
- [X] T009 [US1] Implement `web/components/CommentFeedPanel.tsx` rows (quote, name, time, body clamp, «[медиа]», empty copy, jump button).
- [X] T010 [US1] Insert toggle in `web/components/Header.tsx` between Search and NotificationDropdown (auth-only).
- [X] T011 [US1] Write failing/passing tests in `web/tests/unit/CommentFeed.test.tsx` for toggle open/close + empty state + guest hidden.

**Checkpoint**: Signed-in user can open/close a hydrated sidebar.

---

## Phase 4: User Story 2 — Live updates (P1)

- [X] T012 [US2] Ensure SSE path prepends/edits/deletes; badge increments when closed and clears on open; stick-to-top + «К новым ↑».
- [X] T013 [US2] Extend `CommentFeed.test.tsx` for badge + simulated new/edit/delete (mock useSSE / context API).

**Checkpoint**: Live buffer behaves per contract.

---

## Phase 5: User Story 3 — Soft-hide (P2)

- [X] T014 [US3] Soft-hide overlay in panel rows via `isIgnored`; session reveal; clear reveals when user newly ignored.
- [X] T015 [US3] Test overlay + reveal in `CommentFeed.test.tsx`.

---

## Phase 6: User Story 4 — Jump + pin expand (P2)

- [X] T016 [US4] Add `forcePinnedExpanded?: boolean` to `ShoutCard`; clear collapse state + `localStorage` inside component.
- [X] T017 [US4] Panel navigation via `navigateTo`; pass force-expand through ShoutPage/feed when `?comment=` targets a pinned shout as needed.
- [X] T018 [US4] On mobile MQ, close panel on navigate from a row.

---

## Phase 7: User Story 5 — Mobile overlay (P3)

- [X] T019 [US5] Verify/adjust overlay CSS for ≤767px; document in quickstart (manual).
- [ ] T020 [US5] Optional test: matchMedia mock asserts close-on-navigate calls `setPanelOpen(false)`. — deferred (covered by navigate unit path + CSS contract)

---

## Phase 8: Docs & PR

- [X] T021 Update `docs/web.md` + CLAUDE ESSENTIAL via `/docs` skill; SPECKIT block → `specs/012-comments-feed/plan.md`.
- [ ] T022 Push branch and open GitHub PR with implementation description + test plan.

---

## Dependencies

```text
T001 → T002/T003/T004 → T005 → T006/T007 → T008/T009/T010 → T011
T005 → T012 → T013
T009 → T014 → T015
T009 → T016 → T017 → T018
T007 → T019
T011..T020 → T021 → T022
```

## Parallel opportunities

- T002, T003, T004 after T001
- T008 || T009 after T005
- T014 || T016 after panel exists
