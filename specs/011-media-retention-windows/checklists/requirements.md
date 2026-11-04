# Specification Quality Checklist: Time-Limited Media Retention

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-19
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

- Iteration 1 (2026-08-19): the source description named the file paths, variant
  names, and helper functions involved. These were translated into
  capability-level language ("display copy", "full-size copy", "serving layer")
  so the spec stays implementation-neutral; the concrete names belong in the
  plan.
- Iteration 2 (2026-08-19, /speckit-clarify): all three [NEEDS CLARIFICATION]
  markers are resolved and the checklist is fully passing. FR-011 takes the
  placeholder at two layers — the media description marks the video expired so
  the card renders a Russian tombstone, and the serving layer answers stale
  cached addresses with a shared placeholder file. FR-013 is a text tombstone
  with no play control and no imagery; the question's other half was moot,
  because video has no poster to retain (upload writes only the mp4, so the
  advertised thumbnail address has never resolved — recorded under Dependencies
  and Out of Scope). FR-014 ships silently, satisfied by the tombstone the
  author sees on their own post. A fourth question closed a gap the markers did
  not cover: FR-015a now requires a sweep to refuse to run on a zero, negative,
  or unparseable retention window.
- **Superseded**: earlier iterations recorded the three markers as blocking and
  said User Stories 1 and 3 could proceed to planning independently "if the
  video class is deferred". That was true of planning but wrong about
  implementation, and the reason was the constitution rather than the markers —
  see the next note.
- Iteration 3 (2026-08-19, /speckit-analyze): analysis found the design violated
  §III's absolute personal-library exemption. FR-004 exempted *animated* media
  and the sweep guarded on `meta.animated`, but `gifs.js` derives that flag from
  `pages > 1`, so a **single-frame** library GIF is stored as a still, is written
  a `1600.webp`, and was eligible for expiry. `data-model.md` had asserted the
  opposite — that the animated check was what kept such a GIF whole. Added
  FR-004a as an independent library exemption, corrected the data-model
  invariant, added the library step to the sweep's decision order, and added
  T005a (`libraryMediaIds`) plus a T014 regression case. Recorded here because
  the checklist's "requirements are testable and unambiguous" box passed while
  FR-004 was silently narrower than the constitutional rule it implemented.
- **Constitutional block: RESOLVED.** Constitution v5.0.0 (2026-08-19) adds
  age-based retention as a fourth permitted ground for reclaiming files and
  scopes the live-content exemption to wholesale reclamation. Earlier notes here
  described the v4.0.0 block as specific to User Story 2; it was not. The
  exemption was written per-media rather than per-file, so expiring a still
  image's full-size copy on a live post was barred on exactly the same clause as
  expiring its video — User Story 1 was equally blocked. The single amendment
  unblocks both. v5.0.0 also attaches four binding limits to the new ground
  (attachment survives, loss visible and never a failure, crash-safe with a
  preview mode, misconfigured window fails closed); the spec satisfies all four,
  the last via FR-015a.
