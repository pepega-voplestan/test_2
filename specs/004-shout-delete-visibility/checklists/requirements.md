# Specification Quality Checklist: Hide Uncommented Shouts on Delete

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-17
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
- Validation pass 1: all items pass. No [NEEDS CLARIFICATION] markers were needed — the feature description was unambiguous enough to resolve remaining details (scope of "main feed", race-condition handling, pinned-shout interaction) via reasonable defaults, documented in the spec's Assumptions section.
- Validation pass 2 (post `/speckit-analyze`, after plan.md/tasks.md existed): `/speckit-analyze` flagged a CRITICAL coverage gap (E1) — FR-007 named "moderator/admin" deletion as in-scope but no task addressed `admin.js`, and its comment-cascading admin-delete path would be silently affected by the new feed-visibility query filter. Resolved by narrowing FR-007 to author-initiated deletion only and documenting the admin-path side effect (full hiding of admin-deleted shouts, since admin delete always cascades all comments to deleted) as an accepted, known consequence rather than a regression to prevent — see updated FR-007, Edge Cases, SC-002, and Assumptions. All items still pass after this revision.
- Validation pass 3 (post second `/speckit-analyze`): flagged two more CRITICAL findings (I1, I2) — the feed-visibility exclusion filter re-derives "zero comments" live on every read rather than freezing the decision at deletion time, so (a) a placeholder shout could later disappear if all its comments are deleted, and (b) a fully-hidden shout could later reappear if a comment is somehow added to it (the comment-creation endpoint has no guard against commenting on deleted shouts). Also flagged a HIGH finding (I3) — the deleting user's own client re-derives the hide-vs-placeholder branch from local state, which can race against the server's authoritative decision. User explicitly decided (not the recommended stored-flag alternative): keep the live filter by design, accept both edge cases as self-healing on next reload, do not guard the comment-creation endpoint, and do not push any of this into the SSE layer — the existing SSE handlers already serve as an adequate safety net. Resolved by reframing FR-001/002/006, SC-004, Key Entities, and Assumptions to describe live/continuously-re-evaluated visibility rather than a one-time frozen decision, and adding the corresponding accepted-behavior Edge Cases and quickstart scenarios (3, 3b, 3c). Also fixed two lower-severity findings from the same pass: U1 (T009/T012 implied extending non-existent test files — corrected to say "create") and I1-adjacent doc-accuracy issues in plan.md (Constitution Check V rationale was factually wrong about the delete flow being optimistic; SSE "backend registration" wording was inaccurate). All items still pass after this revision.
- Post-implementation review (T015, after T001-T012): implementation matched the plan/research decisions exactly — transaction-wrapped comment count in `DELETE /shouts/:id`, the new `remove_shout` SSE event registered and handled per contracts/sse-remove-shout.md, the Prisma relation-filter exclusion in both read paths, and the author's-own-delete branching in `ShoutFeed.tsx`/`ShoutPage.tsx`. No new gaps surfaced during implementation that the spec/plan/research hadn't already anticipated. Full API suite (503 tests) and full web suite (143 tests, including new `ShoutFeed.test.tsx`/`ShoutPage.test.tsx`) pass. T013/T014/T016 (live two-browser manual verification) were not performed — no browser automation tooling is available in this environment — and remain for the user to verify manually.
