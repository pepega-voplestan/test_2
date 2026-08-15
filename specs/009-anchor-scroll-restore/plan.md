# Implementation Plan: Anchor-Based Feed Scroll Restoration

**Branch**: `009-anchor-scroll-restore` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-anchor-scroll-restore/spec.md`

## Summary

Replace the just-shipped pixel-offset feed scroll restoration (save
`window.scrollY`, restore to that same pixel) with an identity-based anchor
(save which specific shout was at the top, relocate that shout on return) —
eliminating drift when new content is prepended above the reader's position
while they're away, which the pixel approach cannot avoid. Frontend-only:
reuses the existing `shoutRefs` map, the existing paginated `/api/v1/shouts`
endpoint (no new backend surface), and the shipped feature's no-flash
positioning mechanism (synchronous read, reserved placeholder,
`useLayoutEffect` scroll, rAF-polling correction), adapted from a pixel target
to an estimate-then-measure target. See research.md for the resolved design
questions and data-model.md for the new saved-state shape.

## Technical Context

**Language/Version**: TypeScript (React 18), same as the rest of `web/` —
no version change.

**Primary Dependencies**: None new. Reuses existing `ShoutFeed.tsx`,
`ShoutCard.tsx` (rendered card whose DOM node is measured), `useRoute.ts`,
`App.tsx`, and the existing `/api/v1/shouts` list endpoint's cursor/offset
pagination.

**Storage**: `sessionStorage` (client-side, single-tab, already in use by the
shipped feature — shape changes, mechanism doesn't). N/A for the database —
no schema, migration, or Prisma changes.

**Testing**: Vitest + `@testing-library/react`, same as the existing
`web/tests/unit/ShoutFeed.test.tsx` and `web/hooks/useRoute.test.ts` — this
feature extends those files' existing scroll-restore test suites rather than
introducing new tooling.

**Target Platform**: Web (existing Vopley.net frontend, `web/`), no new
platform surface.

**Project Type**: Web application — this feature is confined to the existing
frontend project (`web/`); no backend (`api/`) or workers changes (confirmed
in research.md: no new lookup endpoint, per the resolved clarification).

**Performance Goals**: No explicit new target beyond "no regression" —
the shipped feature already achieves instant (no-flash) positioning; this
feature must preserve that property (FR-007, SC-003) while swapping the
targeting mechanism. The bounded search limit (research.md: 8 pages / 200
items default) exists specifically to keep worst-case restore cost bounded
and small.

**Constraints**: Must not regress the shipped pixel-based feature's fixes
(native scroll-restoration disabled, live-scrollY tracking instead of
unmount-time `window.scrollY`, synchronous first-render data read) — see
research.md's "Existing shipped mechanism this feature must not regress."

**Scale/Scope**: Single feature area (`ShoutFeed.tsx`'s save/restore effects
and the small amount of new measurement logic they need); no change to
feed size, pagination page size, or read volume beyond the bounded search
limit during restoration only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applicability | Status |
|---|---|---|
| I. Session-Based Authentication Only | N/A — `sessionStorage` here holds scroll-position UI state (a shout ID and pixel offsets), never auth/credential data. Does not touch the session/auth mechanism at all. | PASS |
| II. Russian-Language UI Integrity | Applicable only if this feature introduces new user-visible text. It does not — the fallback path (anchor not found) reuses the existing fresh-feed-load UI verbatim, no new copy. | PASS |
| III. Soft-Delete & Data Preservation (NON-NEGOTIABLE) | Applicable: the "anchor shout was deleted" edge case (User Story 3) touches soft-deleted content. No new deletion/reclamation logic is introduced — an anchor pointing to a soft-deleted (`is_deleted=1`) shout is simply absent from feed list results (existing backend behavior, unchanged), which this feature's search-limit fallback already handles as "not found." No row or file is read, written, or reclaimed by this feature. | PASS |
| IV. Validated, Prisma-Mediated Data Access | N/A — no new backend endpoint, query, or input surface (research.md decision: reuse existing `/api/v1/shouts` pagination as-is). No new Zod schema needed. | PASS |
| V. Optimistic UI with Guaranteed Rollback | N/A — this feature has no mutation; it only reads and positions. | PASS |
| VI. Design-First, Tests Second | Applicable: design (reuse `shoutRefs`, ID-based search-and-stop pagination, estimate-then-correct positioning) is chosen on its own merits per research.md, before test shape is considered. Existing test harness (`mockFetchShouts`, `wrapper`, `MockEventSource`) is reused as-is, not restructured to fit this feature. | PASS |
| VII. Minimal, Meaningful Comments | Applicable, ongoing discipline: new code (anchor-detection, search-and-stop loop, estimate/correction positioning) gets comments only where non-obvious WHY exists (e.g. why cursor pagination tolerates concurrent inserts, why the placeholder height is an estimate) — matching the density already established in the shipped code this session. | PASS (to verify at review) |
| Domain: Bounded media galleries / single-level comments / notification dedup | N/A — this feature doesn't touch media, comments, or notifications. | N/A |
| Domain: One pinned shout maximum | Applicable, no new logic needed: research.md confirms the anchor mechanism is identity-based and orthogonal to the existing pinned-shout prepend behavior; no interaction to design beyond what already exists. | PASS |
| Dev Workflow: Test isolation | Applicable: reuses and extends the `sessionStorage.clear()` `beforeEach` already added to `ShoutFeed.test.tsx` during the pixel-based work (fixed a real cross-test-pollution bug) — must not regress that fix. | PASS |
| Dev Workflow: SSE provider order | N/A — no new SSE listener or provider interaction. | N/A |

No violations. Complexity Tracking section below is empty (nothing to
justify).

## Project Structure

### Documentation (this feature)

```text
specs/009-anchor-scroll-restore/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` directory — this feature adds no new external interface (no
new API endpoint, no new public component contract beyond `ShoutFeed.tsx`'s
own internals); see research.md.

### Source Code (repository root)

This is an existing web application (Vopley.net); the relevant slice is the
existing `web/` frontend project. No new top-level directories.

```text
web/
├── components/
│   ├── ShoutFeed.tsx        # PRIMARY: anchor detection (save), search-and-stop
│   │                         # paging + estimate/correction positioning (restore).
│   │                         # Replaces the pixel-based SavedFeedState logic
│   │                         # shipped earlier this session in the same file.
│   ├── ShoutCard.tsx         # UNCHANGED — its rendered DOM node (via shoutRefs)
│   │                         # is what gets measured; no prop/behavior changes.
│   └── ShoutPage.tsx         # UNCHANGED — "Назад" → goBack() wiring already
│                              # correct from the shipped feature; not touched.
├── hooks/
│   └── useRoute.ts           # UNCHANGED — goBack()/navigateTo()/scrollRestoration
│                              # = 'manual' already correct; not touched.
├── App.tsx                   # UNCHANGED — its route-change scroll-reset guard
│                              # already checks sessionStorage presence generically
│                              # (shape-agnostic); not touched.
└── tests/unit/
    └── ShoutFeed.test.tsx    # EXTENDED — existing scroll-restore describe block
                               # (14 tests from the pixel-based work) gets new
                               # cases for anchor-finding, search-limit fallback,
                               # and estimate/correction positioning; existing
                               # sessionStorage.clear() beforeEach is kept.

api/                          # NOT TOUCHED — confirmed in research.md: no new
                               # endpoint, no new query param, existing
                               # /api/v1/shouts pagination reused as-is.
```

**Structure Decision**: Single-project change confined to `web/components/ShoutFeed.tsx`
plus its existing test file. No backend, no new files at the top level, no new
shared modules — the smallest surface area that satisfies the spec, consistent
with reusing (not replacing) as much of the just-shipped mechanism as possible.

## Complexity Tracking

*No entries — Constitution Check reported no violations.*
