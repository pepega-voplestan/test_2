---

description: "Task list for Original-Quality Image Uploads"
---

# Tasks: Original-Quality Image Uploads

**Input**: Design documents from `/specs/003-original-quality-uploads/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included. The project constitution mandates specific coverage (rate-limit in both auth states; never lose an image) and `quickstart.md` enumerates tests to add. Test tasks are scoped per story.

**Organization**: Tasks are grouped by user story (P1 → P2 → P3) so each can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- Exact file paths included

## Path Conventions

Web application: API at `api/src/`, workers at `workers/src/`, web at `web/`. No Prisma
migration (state lives in existing `media.media_meta`). Tests: API under `api/tests/`,
workers under `workers/` test setup.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration surface for the feature

- [X] T001 Add `ORIGINAL_QUALITY_MAX_BYTES` (default `10485760`) and `ORIGINAL_QUALITY_WINDOW_HOURS` (default `24`) to env example/config files (`.env.example`, any Docker compose env for `api` and `workers` services)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared media helpers and constants that both the upload path (US1/US3) and the downgrade worker (US2) depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Add `ORIGINAL_QUALITY_MAX_BYTES` and `ORIGINAL_QUALITY_WINDOW_HOURS` constants (read from `process.env` with defaults) to `api/src/helpers/media.js`, and reference the same window value from the workers side (`workers/src/` config or env read)
- [X] T003 Implement lossless privacy-metadata stripping in `api/src/helpers/media.js`: `stripJpegMetadata(buffer)` (walk JPEG markers, drop `APP1`/`APP13`/XMP, keep scan bytes byte-identical) and `stripPngMetadata(buffer)` (drop `eXIf`/`tEXt`/`iTXt`/`zTXt`/`tIME` chunks, keep critical chunks) per research R1; export both
- [X] T004 [P] Unit tests for metadata strippers in `api/tests/` — assert GPS/EXIF removed and pixel/scan data byte-identical for JPEG, ancillary chunks removed and IDAT preserved for PNG (fixtures: a GPS-tagged JPG, a PNG with text chunks)

**Checkpoint**: Media helpers ready — user story implementation can begin

---

## Phase 3: User Story 1 - Post a picture at full original quality (Priority: P1) 🎯 MVP

**Goal**: JPG/PNG uploads within the size limit are stored losslessly and served at original quality in the full-size/opened view for the first 24 hours.

**Independent Test**: Upload a detailed JPG and PNG under the limit, publish, open each image at full size — the opened image is visually indistinguishable from the source; feed card may show the scaled WebP.

### Tests for User Story 1 ⚠️

- [X] T005 [P] [US1] API test in `api/tests/` — `POST /api/v1/upload/media` with a JPG under the limit stores `original.jpg` on disk AND `320/960/1600.webp`, and creates a `media` row whose `media_meta` has `orig`, `uploaded_at`, `converted:false` (per [contracts/upload-media.md](./contracts/upload-media.md))
- [X] T006 [P] [US1] API test in `api/tests/` — same for a PNG (stores `original.png`, correct `media_meta`)
- [X] T007 [P] [US1] Unit test in `api/tests/` — `buildMedia()` returns `full` = `/media/<id>/original.<ext>` while `orig` present & `converted!==true`, and `full` = `/media/<id>/1600.webp` once `converted===true` or `orig` absent (per [contracts/media-dto.md](./contracts/media-dto.md))
- [X] T008 [P] [US1] API test in `api/tests/` — stored `original.jpg` from a GPS-tagged upload has no GPS/camera metadata (FR-013), pixel data intact
- [X] T031 [P] [US1] (G1 verification) API test in `api/tests/` — a JPG upload creates exactly one `media` row and one `media_id`; the single-media-per-post/comment invariant is not weakened by the original-quality path (FR-010)

### Implementation for User Story 1

- [X] T009 [US1] In `api/src/routes/upload.js` JPG/PNG branch: after generating WebP variants, write the metadata-stripped original as `original.<ext>` (using T003 helpers) into the tmp dir before the atomic rename
- [X] T010 [US1] In `api/src/routes/upload.js`: set `media_meta` to include `orig: "original.<ext>"`, `uploaded_at: <ISO now>`, `converted: false` (and `orientation` when non-default per research R1); mirror into `meta.json`; return `urls.full` pointing to the original in the response
- [X] T011 [US1] In `api/src/helpers/media.js` `buildMedia()`: implement full-URL selection (original while pending, `1600.webp` once converted) per [contracts/media-dto.md](./contracts/media-dto.md); leave `url`/`thumb`/GIF handling unchanged
- [X] T012 [US1] Verify `web/components/ShoutCard.tsx` lightbox opens from `media.full` for both shout and comment images (no hardcoded `1600.webp`); adjust only if a hardcoded path is found
- [X] T029 [US1] (I1 decision: honor orientation) `buildMedia()` returns `orientation` on the image DTO while serving the original; `web/components/Lightbox.tsx` accepts an `orientation?` prop and applies the matching EXIF→CSS transform; `ShoutCard.tsx` passes `media.orientation` to `Lightbox`. Add a web test asserting a rotated JPG DTO carries `orientation` and the transform is applied.

**Checkpoint**: Original-quality upload + full-size serving works end-to-end (MVP), rotated JPEGs render upright. Feed/thumb unchanged.

---

## Phase 4: User Story 2 - Automatic downgrade to compressed format after 24 hours (Priority: P2)

**Goal**: 24 hours after upload, an original-quality image is converted through the standard WebP pipeline, the original file's storage is reclaimed, and the post keeps rendering with valid references.

**Independent Test**: Upload an original-quality image, advance the window (set `ORIGINAL_QUALITY_WINDOW_HOURS=0` or backdate `uploaded_at`), let the sweep run — the post now serves `1600.webp`, `original.<ext>` is gone, and no reference breaks.

### Tests for User Story 2 ⚠️

- [X] T013 [P] [US2] Worker test in `workers/` — sweep selects only assets that are `media_type:"image"`, have `orig` present & `converted!==true`, are past the window, AND whose owning shout/comment is not soft-deleted (per [contracts/downgrade-job.md](./contracts/downgrade-job.md))
- [X] T014 [P] [US2] Worker test in `workers/` — after conversion: `media_meta.converted===true`, `orig` key removed, `original.<ext>` unlinked, `1600.webp` still present (FR-005/006/007)
- [X] T015 [P] [US2] Worker test in `workers/` — soft-deleted owning content is skipped, no conversion runs (FR-008); and re-running the sweep on an already-converted row is a no-op (idempotent)
- [X] T016 [P] [US2] Worker test in `workers/` — conversion failure leaves `converted:false` with `original.<ext>` retained (never unlinked before WebP confirmed); next run retries (FR-009, SC-005)

### Implementation for User Story 2

- [X] T017 [US2] Add `originalDowngradeQueue = new Queue("original-downgrade", ...)` with `attempts:3` + exponential backoff to `workers/src/queues.ts`
- [X] T018 [US2] Create `workers/src/jobs/original-downgrade.ts` — `createOriginalDowngradeWorker()`: select due+undeleted assets, ensure/regenerate `1600.webp`, confirm it on disk, flip `media_meta` (`converted:true`, drop `orig`) via Prisma + mirror `meta.json`, then `unlink` the original; log scanned/converted/skipped/failed (per [contracts/downgrade-job.md](./contracts/downgrade-job.md))
- [X] T019 [US2] Register the repeatable sweep in `workers/src/scheduler.ts` via `upsertJobScheduler("original-downgrade-sweep", { pattern: "*/5 * * * *" }, { name: "run", data: {} })`
- [X] T020 [US2] Wire the worker into `workers/src/index.ts`: start `createOriginalDowngradeWorker()` and add `originalDowngradeQueue` to the Bull Board adapters list
- [X] T030 [US2] Mount the media volume (read-write) and set `MEDIA_PATH: /media` on the `worker` service in `docker-compose.yml`, `docker-compose.dev.yml`, and `docker-compose.local.yml` so the worker can unlink originals (note: the "conversion" reuses the WebP variants already generated at upload — no `sharp` in workers)

**Checkpoint**: Uploaded originals downgrade automatically and safely; storage reclaimed; references intact.

---

## Phase 5: User Story 3 - Clear feedback when a picture is too large (Priority: P3)

**Goal**: Oversized or corrupt uploads are rejected before storage with a clear Russian message stating the limit; nothing partial is stored.

**Independent Test**: Attach a file above the limit and a corrupt image — each is rejected with a Russian message, no file is written, and the compose flow lets the user pick another file.

### Tests for User Story 3 ⚠️

- [X] T021 [P] [US3] API test in `api/tests/` — upload above `ORIGINAL_QUALITY_MAX_BYTES` returns `400` with Russian message including the configured limit, and nothing is written under `MEDIA_DIR`; a file exactly at the limit is accepted (boundary)
- [X] T022 [P] [US3] API test in `api/tests/` — a corrupt/undecodable image returns `400` Russian message with no file stored
- [X] T023 [P] [US3] API test in `api/tests/` — `uploadLimiter` behaves correctly for `POST /api/v1/upload/media` in both authenticated and unauthenticated (IP-fallback) states (FR-012, constitution)

### Implementation for User Story 3

- [X] T024 [US3] In `api/src/routes/upload.js` / `api/src/helpers/media.js`: derive the multer `limits.fileSize` from `ORIGINAL_QUALITY_MAX_BYTES` and parameterize the `LIMIT_FILE_SIZE` Russian message to reflect the configured limit (correct declension for МБ)
- [X] T025 [US3] In `api/src/routes/upload.js`: ensure the corrupt-image path returns a clear Russian message and that the tmp dir is discarded on every 4xx/5xx (no partial/corrupted file persisted)

**Checkpoint**: All rejection paths give clear Russian feedback with no partial writes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and end-to-end validation

- [X] T026 [P] Update backend/infra docs via the `/docs` skill: document the original-quality window, `ORIGINAL_QUALITY_MAX_BYTES`/`ORIGINAL_QUALITY_WINDOW_HOURS`, and the new `original-downgrade` worker in `docs/api.md` + `docs/infra.md` (do NOT edit docs directly — use `/docs`)
- [ ] T027 Run through [quickstart.md](./quickstart.md) scenarios 1–8 end-to-end (local stack with workers), confirming success-criteria mapping
- [ ] T028 [P] Verify the media nginx path serves `original.jpg`/`original.png` and confirm the immutable-cache transition behavior noted in research R3 is acceptable in a running stack

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (helpers/constants)
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP, no dependency on US2/US3
- **User Story 2 (Phase 4)**: Depends on Foundational; consumes the `media_meta` shape produced by US1 in practice, but is independently testable by seeding a pending `media` row
- **User Story 3 (Phase 5)**: Depends on Foundational; independent of US1/US2 (rejection path)
- **Polish (Phase 6)**: Depends on all targeted stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent. Delivers the core value.
- **US2 (P2)**: Independently testable via a seeded pending asset; naturally follows US1.
- **US3 (P3)**: Fully independent of US1/US2.

### Within Each User Story

- Tests written first and expected to FAIL before implementation
- Helpers (Phase 2) before route/worker wiring
- Route/worker core before integration/verification

### Parallel Opportunities

- T002 and T004 are [P] within Foundational (different concerns/files)
- US1 tests T005–T008 are [P] (independent test files)
- US2 tests T013–T016 are [P]; US3 tests T021–T023 are [P]
- After Foundational, US1 / US2 / US3 can be staffed in parallel
- Polish T026 and T028 are [P]

---

## Parallel Example: User Story 1

```bash
# Tests for US1 together (write first, expect fail):
Task: "API test: JPG upload stores original.jpg + media_meta flags (api/tests/)"
Task: "API test: PNG upload stores original.png + media_meta flags (api/tests/)"
Task: "Unit test: buildMedia() full-URL selection (api/tests/)"
Task: "API test: stored original has no GPS metadata (api/tests/)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE** (upload + full-size original serving) → demo. Originals accumulate but are correct; US2 bounds storage next.

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → test → demo (MVP: original-quality serving)
3. US2 → test → demo (auto-downgrade + storage reclamation)
4. US3 → test → demo (clear Russian rejection feedback)

### Parallel Team Strategy

After Foundational: Dev A → US1, Dev B → US2 (seed a pending row to test), Dev C → US3.

---

## Notes

- [P] = different files, no dependencies
- No Prisma migration — state in existing `media.media_meta`
- Never unlink an original before the WebP is confirmed (SC-005)
- Tests run sequentially; `bcrypt` rounds from env; no shared mutable state between test files
- Docs changes ONLY via the `/docs` skill
- Commit after each task or logical group
