# Specification Quality Checklist: Multi-Media Gallery Attachments

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-25
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

### Validation result

**All items pass** as of 2026-07-25, on the second iteration.

The three [NEEDS CLARIFICATION] markers raised in the first iteration were
resolved by the user and recorded in the spec's Clarifications section
(Session 2026-07-25), with corresponding requirements added:

1. Over-limit selection in a single action → reject the whole action (FR-033).
2. Partial batch failure → keep successes, report each failure (FR-034).
3. Interim GIF/image interaction during Stages 1–2 → strict mutual exclusivity
   from the first attached image (FR-035), expiring when FR-026 takes effect.

Requirements are numbered FR-001 through FR-035 with no gaps or duplicates.

### Post-analysis revision (2026-07-25)

`/speckit-analyze` was run against the completed spec, plan and tasks. It raised
1 critical, 4 high and 14 medium/low findings. All were resolved:

- **C1 (critical)** — the comment composer is a separate implementation in
  `ShoutCard.tsx` with no drag-and-drop; every composer task had targeted
  `ShoutInput.tsx` alone, making FR-031 unimplementable. Resolved by extracting
  `useMediaAttachments.ts` (research D9) and adding both-composer tasks.
- **C2/D10** — create-response and SSE DTOs are built inline and bypass
  `enrichFeed()`; `gallery` would have been missing from live-appended content.
- **C3** — FR-008 (upload rate limiting, both auth states) had no task, despite
  being a constitution MUST.
- **I1** — FR-009 reworded to describe upload-time rejection, matching the actual
  architecture. Recorded in Clarifications.
- **N1** — constitution bump corrected from MINOR to **MAJOR** (2.0.0), per the
  constitution's own rule reserving MAJOR for redefinitions.
- **A1/A2** — FR-014's vestigial crop clause removed; FR-013 now specifies that
  the indicator counts *additional* items.
- Remaining medium/low items (stale paths, `ShoutMedia` type-name collision,
  video-in-batch rule, per-item compression test, immutability guard) folded into
  the revised plan, contracts and tasks.

Task count grew 58 → 70.

### Stage 1 preview redesign (2026-07-26)

Re-validated after the post-deployment scope change (Clarifications, Session
2026-07-26). **Still 16/16 passing** — no item changed state.

The change replaces the first-item-only preview with an adaptive grid rendering
every item, and makes each tile open the existing single-image viewer in Stage 1.
It closes a genuine spec defect: as previously written, items 2..N were
unviewable by anyone for the whole of Stage 1.

Requirements are now FR-001…FR-036, with **FR-013 retained as a tombstone**
(removed, not renumbered) so existing references in plan.md, tasks.md and the
contracts do not silently retarget a different requirement.

Downstream artifacts are now stale and must be regenerated: `plan.md` (Stage 1
frontend scope, `GalleryPreview` design), `tasks.md` (T030/T037 and the Stage 2
boundary), and `contracts/gallery-dto.md` (its consumer-expectations section
still describes reading `gallery.length` only for a badge).

### Governance flag (not a spec defect)

The spec's Governance Note records that this feature supersedes the
constitution's "Single media per post/comment" Domain Constraint, which requires
a constitution amendment rather than a plan-level deviation. Tracked in the spec
under Dependencies; carry it into `/speckit-plan`.

### Composer preview & upload-timing revision (2026-07-30)

Re-validated after production feedback on the deployed Stage 1 build (Clarifications,
Session 2026-07-30). **Still passing on the first iteration** — no
[NEEDS CLARIFICATION] markers were needed; all open questions raised during scoping
had reasonable defaults (documented as Assumptions) and were resolved directly with
the user rather than left as markers, per the "maximum 3, only when no reasonable
default exists" guidance — none of the three candidate open points (retry scope,
upload concurrency, single- vs two-call upload contract) met that bar: retry scope
had an unambiguous default (whole batch, since nothing partially uploaded exists to
reconcile), and upload concurrency / API contract shape are implementation choices
correctly deferred to `/speckit-plan`, not spec-level ambiguities.

The change pulls FR-024 (per-item removal while composing) forward out of Stage 3
into immediate effect, adds pending-item fullscreen preview (FR-037) and container/
sizing requirements (FR-038–FR-040), and reverses upload timing from
upload-on-select to upload-on-submit with atomic all-or-nothing semantics (FR-041).
FR-009 and FR-034 are reworded/narrowed accordingly, and User Story 3 is retitled and
narrowed to reordering + GIF mixing only, since removal no longer belongs to it.

Requirements are now FR-001…FR-041 with FR-013 still retained as a tombstone.

Downstream artifacts are now stale and must be regenerated: `plan.md` (composer
architecture — upload timing moved off the select-time path, pending-item viewer
wiring), `tasks.md` (Stage 1 composer tasks, the now-narrowed Stage 3 boundary), and
`contracts/gallery-dto.md` if it describes the upload-then-create request sequence.
