# Implementation Plan: Time-Limited Media Retention

**Branch**: `011-media-retention-windows` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-media-retention-windows/spec.md`

## Summary

Two new recurring sweeps reclaim the two heaviest file classes on the media volume: the `1600.webp` variant of still images past a 7-day window, and `original.mp4` video files past a 30-day window. Both windows are hardcoded constants in the worker source, not configuration (FR-015). Neither deletes a row.

The technical approach is almost entirely **reuse**. Feature 008 already built the crash-safe reclaim mechanism (`workers/src/helpers/reclaim.ts`), and its `performReclaim` accepts exactly the shape both sweeps need: a `survivor` file that must be verified present before anything is removed, a `markerPatch` merged into `media_meta` *before* the unlink, and a compare-and-set write that yields to concurrent writers. The `reclaimed.variants` marker it already maintains is also the state FR-022 demands be distinct from wholesale reclaim, because `buildMedia` collapses media to `undefined` only on `reclaimed.files === true`.

The genuinely new work is four narrow changes: teach `buildMedia` to stop advertising variants the marker says are gone; give the frontend a fallback when `full` is absent; add an nginx fallback and a card tombstone for expired video; and declare the two windows as constants in one shared module, with no environment input and therefore no coercion to get wrong.

## Technical Context

**Language/Version**: TypeScript 5.x (workers), Node.js 20 ESM (api), React 18 + TypeScript (web)

**Primary Dependencies**: BullMQ + Redis (scheduling), Prisma + PostgreSQL (media rows), nginx (media serving), Vitest (all three packages)

**Storage**: PostgreSQL for `media` rows; the media Docker volume for files; `media_meta` JSON column carries per-item reclaim state

**Testing**: Vitest in `workers/tests/`, `api/tests/`, `web/tests/` — sequential, no cross-file shared state

**Target Platform**: Linux server via Docker Compose (api, web, workers, postgres, redis, media-nginx)

**Project Type**: Web application — three deployable packages plus an nginx media tier

**Performance Goals**: Sweeps must not degrade reader-facing latency during the initial backlog run; bounded batches of 500 with cursor paging, matching `media-reclaim`

**Constraints**: Removals are irreversible; every removal ordered marker-before-unlink so a crash leaves a stray file, never a dangling address

**Scale/Scope**: Whole-table sweep over `media` rows of type `image` and `video`; first run faces the full historical backlog

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Result: PASSED** against Constitution **v5.1.0** (amended 2026-08-20).

> Re-evaluated twice. This gate first read FAILED against v4.0.0, whose §III Exemptions barred reclaiming files from media reachable from live content — which blocked **both** user stories, not only video. **v5.0.0** adds age-based retention as a fourth permitted ground and scopes the live-content exemption to wholesale reclamation, turning the two FAIL rows below into PASS and making the Complexity Tracking entries obsolete.
>
> **v5.1.0** (2026-08-20) resolves the second conflict, found by `/speckit-analyze`: v5.0.0's fourth ground required each file class to have a *per-environment configurable* window, while FR-015 makes both windows source constants. v5.1.0 rewrites that MUST to require one declared, discoverable, review-gated window per class — constant or config — and states the fail-closed limit per form. The two rows below that turn on window form now pass on the design as built rather than on a mis-stated premise.

| Principle / Rule | Verdict | Notes |
|---|---|---|
| I. Session auth only | PASS | Feature touches no auth. |
| II. Russian UI integrity | PASS | One new user-visible string, Russian, in the video tombstone. |
| **III. Soft-Delete & Data Preservation — Records** | PASS | FR-023: no row is deleted. Files only. |
| III. Stored media files — permitted grounds | PASS | Fourth ground (v5.0.0): a declared file class past its per-class retention window, clocked from creation. Both classes are named explicitly (`1600.webp`, `original.mp4`), and each has its own window declared in exactly one place — `workers/src/helpers/retention.ts` — changed only by a reviewed source edit, which is the form v5.1.0 requires and prefers. |
| III. Exemptions — reachable from live content | PASS | v5.0.0 scopes this exemption to **wholesale** reclamation (unchanged in v5.1.0). Per-class age-based expiry is permitted, subject to the four limits below. |
| III. Age-based retention — attachment survives | PASS | Image keeps rendering at display resolution (FR-008); video keeps its attachment as a tombstone (FR-013). Neither silently drops the attachment — that is what `reclaimed.files` does, and both sweeps avoid it (FR-022). |
| III. Age-based retention — loss visible, never a failure | PASS | Image degrades to the display copy; video shows an explicit Russian notice (FR-011). No broken image, dead player, error, or unresolved load. |
| III. Age-based retention — crash-safe + preview | PASS | `performReclaim` advances the marker before the unlink (FR-018); `dryRun` threads through both sweeps (FR-021). |
| III. Age-based retention — misconfigured window fails closed | PASS | FR-015a is met by construction: both windows are hardcoded constants (research R7), so there is no value to be absent, empty, or unparseable, no `\|\| DEFAULT` fallback, and no clamping. A bad window is a type error or a visible diff, not a runtime surprise. v5.1.0 names this structural form explicitly as satisfying the limit, and as the preferred one. The env-var design — first with defaults, then required-with-a-throwing-resolver — was dropped as machinery out of proportion to a value that never changes per environment; if it ever returns, v5.1.0 requires the throwing resolver to return with it. |
| III. Advertised state | PASS | `buildMedia` stops advertising `1600.webp` once the marker records it, and never presents the display copy as the full one (contracts/media-dto.md, research R3). |
| III. Exemptions — ban-removed, personal library, avatars | PASS | FR-025 excludes avatars; `hasLiveReference` protects `user_gifs`; `is_deleted=2` is untouched. |
| III. Restore fidelity — loss visible, never broken | PASS | Image loss is resolution-only; video loss shows an explicit Russian tombstone. |
| IV. Prisma + Zod | PASS | Prisma only; no new external input to validate. |
| V. Optimistic UI + rollback | N/A | No new interactive mutation. |
| VI. Design-first, tests second | PASS | Reuses the existing `performReclaim` seam; no test-only shape introduced. |
| VII. Minimal comments | PASS | Matches surrounding density in `workers/src/`. |
| Workflow — docs discipline | PASS | CLAUDE.md/`docs/*` only via `/docs`; the SPECKIT block only via the agent-context script. |

The v5.0.0 amendment did not simply grant permission — it attached four hard limits to age-based retention (v5.1.0 sharpened the fourth without loosening it), and they now function as additional gates this design must satisfy on every future change. Three of them were already spec requirements (visible loss, crash safety, preview mode); the fourth, fail-closed configuration, is FR-015a. The spec Dependency "a constitutional amendment covering both changes below, landed alongside this specification" is satisfied.

One propagation item remains open and is **not** blocking: `CLAUDE.md` still describes the v4.0.0 rules (media behind live content never reclaimed; a still image's variant set fixed rather than age-dependent) and must be retagged to v5.1.0 §III. Per the constitution's own documentation-discipline rule it must be updated through the `/docs` skill, never edited directly.

## Project Structure

### Documentation (this feature)

```text
specs/011-media-retention-windows/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── media-dto.md
│   ├── sweep-jobs.md
│   └── media-serving.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
workers/
├── src/
│   ├── helpers/
│   │   ├── reclaim.ts             # EXTEND: ReclaimedMarker gains `video`; mergeReclaimed carries it
│   │   ├── media-refs.ts          # UNCHANGED — reference rules are not age rules
│   │   └── retention.ts           # NEW: the two window constants (FR-015), shared by both sweeps
│   ├── jobs/
│   │   ├── image-variant-expiry.ts  # NEW: US1 — expire 1600.webp
│   │   ├── video-expiry.ts          # NEW: US2 — expire original.mp4
│   │   ├── media-reclaim.ts         # UNCHANGED
│   │   └── original-downgrade.ts    # UNCHANGED (but see research R2 — ordering hazard)
│   ├── queues.ts                  # EXTEND: two queues
│   ├── scheduler.ts               # EXTEND: two schedules
│   └── index.ts                   # EXTEND: two workers + two Bull Board panels
└── tests/
    ├── image-variant-expiry.test.ts   # NEW
    └── video-expiry.test.ts           # NEW
                                       # (no retention.test.ts — two constants, no branches)

api/
├── src/helpers/media.js           # CHANGE: buildMedia honours reclaimed.variants + video expiry
└── tests/unit/                    # NEW cases for buildMedia

web/
├── types.ts                       # CHANGE: video DTO gains `expired`
├── components/
│   ├── Lightbox.tsx               # CHANGE: fall back to `url` when `full` absent
│   └── ShoutCard.tsx              # CHANGE: same fallback; Russian tombstone for expired video
└── tests/unit/                    # NEW cases

media-assets/_deleted.mp4          # NEW: expired-video placeholder, committed to the repo
media-nginx.conf                   # CHANGE: split mp4 into its own location, fallback to the placeholder
docker-compose{,.local,.dev}.yml   # CHANGE: mount ./media-assets at /assets on the media service
```

**Structure Decision**: Web application. The sweeps live in `workers/` beside the two existing media jobs they must compose with; the DTO change is confined to `api/src/helpers/media.js` (`buildMedia` is the single writer of media DTOs); the presentation change is confined to the two components that read `.full` and the one that renders `<video>`; the serving fallback is one nginx location plus a committed 8.6 KB asset, mounted outside the media volume so a volume restore cannot remove it. No new package, no new service, no schema migration.

## Complexity Tracking

> **Obsolete as of Constitution v5.0.0.** Retained as the record of why the amendment was sought. There is no live deviation: the gate passes as written, and the design introduces no complexity requiring justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| §III permits reclaiming files on three grounds; this feature adds a fourth (age) | Storage on the media volume is dominated by two file classes that accrue forever. The three existing grounds only reach content nobody can view, which is a small and shrinking share of the volume. | Restricting expiry to unreachable or deleted-only media is exactly what feature 008 already does; it leaves the dominant classes untouched and delivers no storage win. |
| §III exempts media reachable from live content; both sweeps target live content | US1 removes a variant that is only requested on an explicit full-size open; US2 removes video the spec accepts as a permanent, visible loss (D4). | Waiting for content to be deleted defers the win indefinitely — most heavy media sits on posts that are never deleted. |
| Deviation is temporary and gated | The amendment is a stated spec Dependency and must land first. | Proceeding without it would violate a NON-NEGOTIABLE principle; the design is not revised to comply because compliance would eliminate the feature. |

## Phase Status

- [x] Phase 0 — research.md
- [x] Phase 1 — data-model.md, contracts/, quickstart.md, agent context refreshed
- [x] Constitutional amendment ratified — Constitution v5.0.0, 2026-08-19 (age-based ground) and v5.1.0, 2026-08-20 (window-declaration form)
- [ ] Phase 2 — tasks.md (`/speckit-tasks`)
- [ ] Propagate v5.1.0 wording into `CLAUDE.md` via `/docs` (non-blocking)

## Constitution Check — post-design re-evaluation (historical)

> **Historical record, superseded.** The live verdict is the Constitution Check gate above, PASSED against v5.1.0. This section documents the v4.0.0 re-evaluation that drove the amendments; it is not a second gate.

Re-run after Phase 1 against v4.0.0, this section read FAILED on two §III clauses. That verdict drove the amendment rather than the design: the conflict was with the feature's premise (removing files from live content), not with how it is built. The gate above now reflects v5.0.0 and passes.

Phase 1 sharpened three findings, all of which shaped the amendment's final wording:

1. **The amendment must cover both user stories.** Confirmed against the constitution text: the live-content exemption is written per-media, so US1's variant expiry is barred alongside US2's video expiry. Drafting it around video alone would leave US1 non-compliant.
2. **`reclaimed.files` vs. per-class markers is the mechanism that keeps §III's "loss MUST be visible, never a broken image" satisfied** (data-model.md state matrix). The amendment should not disturb that clause — the design already meets it.
3. **Row preservation is genuinely untouched.** No migration, no deletion, no schema change of any kind. The amendment need not weaken the Records paragraph at all, which keeps its blast radius to the Stored-media-files and Exemptions paragraphs.

All three were carried into v5.0.0 (and left intact by v5.1.0): the amendment is written per-file-class rather than per-media, the Advertised-state paragraph makes the marker/DTO correspondence binding, and the Records paragraph is untouched. Everything else in the design is compliant as built.
