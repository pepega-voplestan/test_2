# Implementation Plan: Live Comments Feed Sidebar

**Branch**: `012-comments-feed` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-comments-feed/spec.md`

## Summary

Port the VopleXtender live comments sidebar into the React web app as a first-class feature: header toggle, right-side panel (desktop column / mobile overlay), in-memory buffer hydrated from `GET /api/v1/shouts?sortBy=new`, live updates via existing SSE, soft-hide via `IgnoredUsersContext`, compact rows with «[медиа]» labels only. No backend changes. Drop extension-only concerns (chrome.storage, ЧС, sse-bridge).

## Technical Context

**Language/Version**: TypeScript 5.2 on React 18 (existing `web/` app)

**Primary Dependencies**: React 18, Vite 5, existing `SSEProvider` / `useSSE`, `IgnoredUsersProvider`, `navigateTo` — no new runtime packages

**Storage**: In-memory only for buffer/panelOpen/unseen; pin collapse continues to use existing ShoutCard `localStorage` key internally when expanding for jump-to-comment

**Testing**: Vitest 4 + `@testing-library/react` under `web/tests/unit/`

**Target Platform**: Browser, desktop + mobile (≤767px overlay)

**Project Type**: Web frontend only (`web/`); no `api/` or `workers/` changes

**Performance Goals**: Single batched hydrate (limit 40 shouts); buffer cap 50; hydrate throttle ≥60s; no per-row `/shouts/:id` fetches

**Constraints**: Constitution I (no auth in localStorage); II (Russian UI); III (never advertise/render missing media as broken images — label only); provider order `SSEProvider` → `IgnoredUsersProvider` → consumers; Russian `@[username:userId]` mention format

**Scale/Scope**: New context + 2–3 components + small ShoutCard prop + Header/App wiring + shared render helpers; docs via `/docs`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applicability | Assessment |
|---|---|---|
| I. Session-Based Authentication Only | Applies | Feature gated on existing session/`useAuth`; no new token/localStorage auth; buffer not used as auth state |
| II. Russian-Language UI Integrity | Applies | All UI strings Russian; mentions rendered from `@[name:id]`; relative time uses `plural` |
| III. Soft-Delete & Data Preservation | Applies (display) | Feed never hard-deletes rows server-side; client drops soft-deleted via SSE only; media shown as «[медиа]» so reclaim cannot produce broken `<img>` |
| IV. Validated, Prisma-Mediated Data Access | N/A | No new API/DB access; reuses existing shouts feed + SSE |
| V. Optimistic UI with Guaranteed Rollback | N/A | Sidebar is read-only; no mutations initiated from this UI |
| VI. Design-First, Tests Second | Applies | Context/panel designed for clarity; shared helpers extracted for reuse with ShoutCard render logic |
| VII. Minimal, Meaningful Comments | Applies | Comment WHY for hydrate upsert invariant, media-label choice, pin-expand ownership |
| Domain constraints | Applies | Gallery cap/exclusivity respected by treating any attachment as a boolean «has media»; single-level comments already in feed DTO |
| Dev workflow | Applies | Docs only via `/docs`; SSE consumer under correct providers; sequential tests |

**Result**: PASS — no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/012-comments-feed/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/comment-feed-client.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
web/
├── App.tsx                          # MODIFIED: CommentFeedProvider + panel mount
├── components/
│   ├── Header.tsx                   # MODIFIED: CommentFeedToggle before bell
│   ├── CommentFeedToggle.tsx        # NEW
│   ├── CommentFeedPanel.tsx         # NEW
│   └── ShoutCard.tsx                # MODIFIED: forcePinnedExpanded prop
├── context/
│   └── CommentFeedContext.tsx       # NEW
├── utils/
│   ├── commentFeedPreview.ts        # NEW: previewText / hasAttachment helpers
│   ├── commentFeedTime.ts           # NEW: relative time via plural
│   └── renderContent.tsx            # NEW: InlineSpoiler + mention/URL render (extracted)
└── tests/unit/
    └── CommentFeed.test.tsx         # NEW
```

**Structure Decision**: Frontend-only. State lives in `CommentFeedContext` (sibling under `IgnoredUsersProvider`) so Header toggle and Panel share one buffer/SSE subscription. Compact content rendering is extracted to `web/utils/renderContent.tsx` so ShoutCard can later adopt it without blocking this feature (CommentFeed imports it first; ShoutCard may keep local copies until a follow-up if extract risk is high — prefer extract-and-reuse for CommentFeed at minimum).

## Complexity Tracking

*No violations — table intentionally omitted.*
