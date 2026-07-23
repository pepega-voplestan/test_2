# Specification Quality Checklist: Per-User Media Posting Restriction

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-18
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

- All items pass on first validation pass. No [NEEDS CLARIFICATION] markers were required — reasonable defaults were used and documented in the Assumptions section (binary flag scope, admin-only mutation).
- Updated 2026-07-18 via `/speckit-clarify`: two clarifications integrated (boolean flag semantics; link-preview resolution is live/retroactive against the author's current permission, unlike attached-media blocking which stays non-retroactive). Re-validated against the updated spec — all items still pass, no regressions.
- Updated 2026-07-18 via `/speckit-analyze`: resolved a HIGH-severity self-contradiction the analysis found between FR-013 and User Story 2 Scenario 1 (FR-013's old wording implied a restricted user's text+media submission should save the text and only drop the media; the actual design and every other artifact reject the whole submission). FR-013 and the related `spoiler`/`nsfw`-tag Edge Case were reworded to unambiguously match the whole-request-rejection design already built into research.md/contracts/tasks.md. No downstream artifact changes were needed — they were already correct; only spec.md's wording was inconsistent.
- **Implementation complete (2026-07-19) via `/speckit-implement`**: T001-T022 and T024 done (schema, all four server-side guards, session/UI gating, live embed suppression, full test coverage — 668 tests passing across `api/` and `web/`). One real gap surfaced during coding that neither the spec nor `contracts/shout-comment-creation.md` had explicitly called out: `shouts.js`/`comments.js` both silently auto-convert a bare YouTube URL found in plain `content` into an attached video (no explicit `mediaId`/`youtubeUrl` param needed) — this path had to be separately gated (skip conversion for a restricted user, per FR-009's embed-suppression intent) rather than triggering the FR-013 whole-request-rejection path, since it isn't an explicit "attach" attempt. Contract/plan docs were not retroactively updated with this nuance; it's recorded here and in the T004/T005 code comments instead.
- **Still open** (not addressed this pass, require either manual browser access or an explicit go-ahead): T002 (visual admin-panel checkbox confirmation — no browser automation tooling available in this environment) and T023/T026 (manual `quickstart.md` walkthroughs). Also still open from the prior `/speckit-analyze` pass: E1 (no automated test for the full is_banned × is_media_allowed combination matrix, nor for attached-media staying byte-identical across a permission toggle), E2 (FR-008's edit-time exclusion has no restricted-user-specific regression test, only the generic T024 finding), B1 (SC-001/SC-004 remain unmeasured outcome-style claims with no instrumentation).
- **Scope revision (2026-07-23)**: Per explicit user direction, the restriction was narrowed from "all media attachment + link-preview embeds" to "physically-stored media only" (direct image/video upload, personal GIF upload/reuse). YouTube attachment, Giphy search-and-attach, and all link-preview embeds are now permanently unaffected by this flag. Spec, plan, data-model, all four contracts, and quickstart.md were updated to match; the `isMediaAllowed`-DTO/embed-suppression mechanism and its dedicated test file (`web/tests/unit/ShoutCard.test.tsx`) were removed as dead code. `api/tests/integration/{shouts,comments,gifs}.test.js` were updated: tests asserting the old (now-wrong) 403-on-youtubeUrl/giphy-reference/DTO-field behavior were rewritten or removed, and new tests cover the `PHYSICAL_MEDIA_TYPES`-conditional `mediaId` gate. Full api suite re-verified green (519 tests) after the revision. Requirement-completeness re-validated against the revised spec — all checklist items above still pass; no new gaps introduced by the narrower scope.
- **Scope refinement (2026-07-23, same day)**: Per explicit user follow-up ("gif picker that are already uploaded — it's fine to let them through, only new uploads should be forbidden"), narrowed further: reusing/re-selecting any already-existing `mediaId` — most visibly, picking a previously-uploaded GIF from "Мои GIF" — is no longer gated at all, regardless of `media_type`. Only `POST /upload/media` and `POST /gifs/upload` (the two routes that write a new file) remain gated; the `mediaId` branch of `shouts.js`/`comments.js` now has zero `is_media_allowed` involvement, and `PHYSICAL_MEDIA_TYPES` was removed from `helpers/media.js` as dead code (its only caller was the removed check). Frontend: `ShoutInput.tsx`'s `handleGifSelect` no longer blocks the `'mygif'` (reuse) branch; `GifPicker.tsx`'s `uploadAllowed` prop now gates only the "Загрузить GIF" button, not the "Мои GIF" thumbnails. Two api tests that asserted 403 on existing-mediaId reuse were flipped to expect success. Full api suite (519 tests) and web suite (143 tests) re-verified green.
