# Implementation Plan: Donation Footer in Announcements

**Branch**: `main` (no dedicated feature branch — small, low-risk frontend-only addition) | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-donation-footer/spec.md`

## Summary

Add a small, always-visible footer to the Объявления (announcements) tab of the existing notification dropdown (`web/components/NotificationDropdown.tsx`): a divider matching the app's existing composer/attachment divider style, a Russian call-to-support message, and a button matching the app's existing button styling. Activating the button opens a new, small centered dialog — following the app's existing overlay/dialog convention (as seen in `AuthModal.tsx`) — that embeds the external YooMoney fundraising widget iframe, sized to avoid horizontal overflow on mobile. No backend, database, or auth changes.

## Technical Context

**Language/Version**: TypeScript 5.2 on React 18 (existing `web/` app)

**Primary Dependencies**: React 18, Vite 5 — no new runtime dependency needed; reuses the existing hand-styled utility-class CSS system already used throughout `web/components/` (no CSS framework build step exists — utility-like class names are project-defined, not Tailwind-compiled)

**Storage**: N/A — no persisted data; the footer text and iframe URL are static, and the donation widget's own state/data lives entirely on YooMoney's side

**Testing**: Vitest 4 + `@testing-library/react` (existing `web/tests/unit/` suite and conventions, e.g. `PendingMediaStrip.test.tsx`, `ShoutFeed.test.tsx`)

**Target Platform**: Browser, existing responsive web app (desktop + mobile viewports, no native app involved)

**Project Type**: Web application — this feature touches only the existing `web/` frontend; no `api/` or `workers/` changes

**Performance Goals**: N/A — static footer render adds negligible cost; the third-party iframe loads only on demand (button click), not on every dropdown open

**Constraints**: Modal/dialog must not cause horizontal page scroll at common mobile widths (≤430px) despite the vendor iframe's fixed 500×480 intrinsic size; no changes to `NotificationDropdown`'s existing notifications-tab behavior, scroll/pagination state, or SSE wiring

**Scale/Scope**: One existing component modified (`NotificationDropdown.tsx`, announcements-tab branch only) + one new small dialog component; no other surfaces in the app reference "Объявления," so blast radius is fully contained to this one dropdown panel

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applicability | Assessment |
|---|---|---|
| I. Session-Based Authentication Only | N/A | No auth state touched; footer/button shown regardless of sign-in state (per spec Assumptions) |
| II. Russian-Language UI Integrity | Applies | The only new user-visible string is the exact Russian text specified in the spec (FR-003); no English copy introduced; no `@mention` tokens involved |
| III. Soft-Delete & Data Preservation | N/A | No rows or media files created, modified, or deleted |
| IV. Validated, Prisma-Mediated Data Access | N/A | No database access; no new API endpoint — the iframe points directly at the external YooMoney URL from the client |
| V. Optimistic UI with Guaranteed Rollback | N/A | No mutation — opening/closing the dialog is pure local UI state, nothing to roll back |
| VI. Design-First, Tests Second | Applies | New dialog is designed as a small, focused component matching existing dialog conventions; not shaped around test convenience |
| VII. Minimal, Meaningful Comments | Applies | Standard project-wide discipline; no unusual invariants expected here that would require comments beyond perhaps noting *why* the iframe wrapper is sized the way it is (fixed vendor dimensions) |
| Domain constraints (galleries, single-level comments, one pinned shout, notif dedup) | N/A | Feature does not touch shouts, comments, media galleries, pinning, or notification/reply logic |
| Dev workflow (test isolation, admin safety, SSE order, docs discipline) | Applies (docs discipline only) | No admin.js or SSE changes. `CLAUDE.md`/`docs/*.md` will not be hand-edited — if documentation needs updating after implementation, that goes through `/docs`, not this plan |

**Result**: PASS — no violations, no entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/010-donation-footer/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command) — expected empty/N/A, no entities
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command) — expected omitted, no new API surface
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
web/
├── components/
│   ├── NotificationDropdown.tsx   # MODIFIED: announcements-tab branch gets a new footer block
│   ├── DonationModal.tsx          # NEW: small centered dialog embedding the YooMoney iframe
│   └── AuthModal.tsx              # REFERENCE ONLY: existing overlay/centering convention to follow
└── tests/
    └── unit/
        └── NotificationDropdown.test.tsx  # NEW or EXTENDED: footer visibility + modal open/close behavior
```

**Structure Decision**: Single-project web frontend change inside the existing `web/` app. No backend/`api/` or `workers/` directories are touched. The footer is added directly in `NotificationDropdown.tsx`'s existing announcements-tab JSX branch (the only place "Объявления" exists today, confirmed by reading lines 302–364 of that file); the donation dialog is extracted as its own small component (`DonationModal.tsx`) rather than inlined, so it can be unit-tested in isolation and reused if a second entry point is ever added.

## Complexity Tracking

*No violations — table intentionally omitted.*
