# Specification Quality Checklist: Reclaim Unused Media Storage

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-12
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

### Validation iterations

**Iteration 1** — three issues found and fixed:

1. *Implementation details leaked.* Initial draft named concrete filenames
   (`320.webp`, `1600.webp`, `original.gif`), table names, and job names.
   Rewritten to describe media kinds and display surfaces in domain terms.
   Filenames belong in `plan.md`, not here.
2. *Success criteria were technology-specific.* Early SC items referenced byte
   counts of named variants. Restated as user- and operator-observable outcomes
   (appearance unchanged, storage measurably reduced, zero broken images).
3. *Scope was unbounded on restore interaction.* The original input did not
   account for the administrator restore capability. Added as an explicit
   dependency, an edge case, two acceptance scenarios, and Q1.

**Iteration 2** — both clarifications resolved by the feature owner and recorded
as D1 and D2 in the spec's Resolved Decisions section. All 16 items now pass.

Changes made in this iteration:

- FR-012 rewritten: deleted-content media is reclaimed after a short grace
  period (default 7 days), not retained indefinitely.
- FR-014 added: restore after reclaim must succeed and present the content as
  media-free, so the loss is visible rather than a broken image. Cross-cutting
  requirements renumbered FR-015 through FR-022 accordingly.
- User Story 3 gained an acceptance scenario for restore-after-reclaim.
- SC-006 now covers both sides of the grace period.
- Assumptions record the 7-day default and the accepted irreversibility of D2.

### Constitution dependency — MUST be resolved before implementation

D1 requires amending Principle III (Soft-Delete & Data Preservation), currently
marked NON-NEGOTIABLE and permitting exactly one hard-delete exception
(notifications under a 14-day TTL). The amendment must establish that reclaiming
media *files* while preserving all database records is permitted, and that
administrator restore is content-complete but not media-complete beyond the
grace period. Ban-removed content stays exempt.

This is a redefinition of an existing principle, so under the constitution's own
versioning rules it is a MAJOR bump (3.1.0 → 4.0.0), not a minor one. The
amendment must carry a Sync Impact Report and propagate to `CLAUDE.md` via the
`/docs` skill.

The plan's Constitution Check gate will fail until the amendment lands.
