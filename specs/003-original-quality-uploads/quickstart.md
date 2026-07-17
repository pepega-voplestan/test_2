# Quickstart & Validation: Original-Quality Image Uploads

Validation guide proving the feature end-to-end. See [data-model.md](./data-model.md) and
[contracts/](./contracts/) for field- and endpoint-level detail.

## Prerequisites

- Local stack running: `cd web && npm run dev` (API :3000 + Vite :5173), or `make local`
  (Docker, :3006) which also runs the `workers` and `media` containers.
- A logged-in session (session auth only).
- Env (defaults shown):
  - `ORIGINAL_QUALITY_MAX_BYTES=10485760` (10 MB)
  - `ORIGINAL_QUALITY_WINDOW_HOURS=24`
  - `MEDIA_PATH`, `REDIS_HOST`/`REDIS_PORT` (workers), as already configured.
- Sample assets: a detailed JPG and PNG under the limit; one file just over the limit; a
  JPG containing GPS EXIF (for the metadata-strip check).

## Scenario 1 — Post a picture at full original quality (P1 / SC-001, FR-001, FR-004)

1. Compose a shout, attach the detailed JPG (< limit), publish.
2. Inspect the upload response: `urls.full` ends in `original.jpg` (not `1600.webp`).
3. On disk: `MEDIA_PATH/<id>/` contains `original.jpg` **and** `320/960/1600.webp`.
4. Open the post, click the image → the `Lightbox` loads `/media/<id>/original.jpg`.
5. **Expected**: the opened image is visually indistinguishable from the source (fine
   detail/gradients/text crisp); the feed card may show the scaled `960.webp`.
6. Repeat with the PNG.

## Scenario 2 — Privacy metadata stripped, pixels lossless (FR-013)

1. Upload the GPS-tagged JPG.
2. Read metadata of `MEDIA_PATH/<id>/original.jpg` (e.g. `exiftool`/`identify -verbose`):
   **no GPS / camera-identifier tags** remain.
3. **Expected**: image pixel data is intact (no visible recompression); only metadata is
   gone. (Orientation caveat: see research R1 — non-default EXIF orientation is recorded
   in `media_meta.orientation`.)

## Scenario 3 — Oversized upload rejected (P3 / SC-003, FR-002/003)

1. Attempt to attach the over-limit file.
2. **Expected**: `400` with Russian message `Файл слишком большой (макс. 10 МБ)` (value
   tracks `ORIGINAL_QUALITY_MAX_BYTES`); nothing written under `MEDIA_PATH`; compose flow
   lets you pick another file.
3. Boundary: a file whose size **equals** the limit is **accepted**.

## Scenario 4 — Corrupt image rejected (FR-003)

1. Attach a `.jpg` that is not a valid image.
2. **Expected**: `400` Russian message; no file stored.

## Scenario 5 — Automatic 24-hour downgrade (P2 / SC-002/004/006, FR-005/006/007)

To validate without waiting 24h, temporarily set `ORIGINAL_QUALITY_WINDOW_HOURS=0` (or
backdate `media_meta.uploaded_at`) so the sweep treats the asset as due.

1. Upload an original-quality JPG (Scenario 1).
2. Wait for the `original-downgrade` sweep tick (≤5 min) — or trigger the job from Bull
   Board (`WORKERS_PORT`/`/workers`).
3. **Expected**:
   - `media_meta`: `converted: true`, `orig` key removed.
   - `MEDIA_PATH/<id>/original.jpg` is **gone**; `1600.webp` remains (SC-004).
   - Reload the post: image still renders; `Lightbox` now loads `/media/<id>/1600.webp`
     (FR-006). Feed/thumb URLs unchanged; **no broken image** (SC-006).

## Scenario 6 — Content deleted before deadline (FR-008)

1. Upload an original-quality image, then soft-delete its shout/comment before the window
   elapses.
2. Advance the window (as in Scenario 5).
3. **Expected**: the sweep **skips** the asset (logged as skipped-deleted); no conversion
   runs against removed content; no error.

## Scenario 7 — Conversion failure / restart resilience (FR-009, SC-005)

1. Simulate a conversion failure (e.g. make `1600.webp` regeneration fail, or kill the
   `workers` container mid-window).
2. **Expected**: the original is retained and still served; `converted` stays `false`; on
   the next sweep (or after restart) the conversion retries and eventually succeeds. **No
   image is ever lost.**

## Scenario 8 — Rate limit in both auth states (FR-012)

1. Exercise `POST /api/v1/upload/media` authenticated and unauthenticated (IP fallback).
2. **Expected**: `uploadLimiter` behaves correctly in both; unauthenticated requests still
   require auth (`requireAuth`) but the limiter keying falls back to IP as designed.

## Automated tests to add (see tasks.md)

- API: upload stores `original.<ext>` + sets `media_meta` flags for JPG/PNG; oversized and
  corrupt rejections (Russian copy, no partial file); metadata stripped from stored
  original; `buildMedia()` full-URL selection pre/post conversion; rate limit both states.
- Workers: sweep selects only due+undeleted assets; converts, flips flag, unlinks original
  only after WebP confirmed; skips deleted content; retries on failure; idempotent re-run.
- Keep tests sequential; `bcrypt` rounds from env; no shared mutable state.

## Success-criteria mapping

| Scenario | Criteria |
|----------|----------|
| 1, 2 | SC-001, FR-001/004/013 |
| 3, 4 | SC-003, FR-002/003 |
| 5 | SC-002/004/006, FR-005/006/007 |
| 6 | FR-008 |
| 7 | SC-005, FR-009 |
| 8 | FR-012 |
