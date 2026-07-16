# Phase 0 Research: Original-Quality Image Uploads

## R1. Lossless metadata stripping for JPEG (and PNG)

**Decision**: Strip privacy metadata at the container/marker level without re-encoding
pixel data.
- **JPEG**: remove the `APP1` (EXIF, incl. GPS), `APP13` (IPTC/Photoshop), and XMP
  segments by walking JPEG markers and copying every segment *except* the metadata
  segments straight through, leaving the entropy-coded scan (`SOS`…`EOI`) byte-for-byte
  intact. This is lossless — the compressed image data is untouched. Implement with a
  small marker-walk in `helpers/media.js` (or a focused dependency such as a JPEG-marker
  stripper); do **not** route JPEG originals through `sharp`, which always re-encodes.
- **PNG**: remove ancillary chunks that can carry privacy/identity data (`eXIf`, `tEXt`,
  `iTXt`, `zTXt`, `tIME`) while preserving critical chunks (`IHDR`, `PLTE`, `IDAT`,
  `IEND`) verbatim. Lossless by construction. `sharp(...).png()` re-encodes and is still
  lossless for PNG, but a chunk-level strip is cheaper and avoids any recompression
  surprises; either is acceptable for PNG since PNG is lossless anyway.

**Rationale**: The spec (FR-013 + Clarification 3) requires *lossless pixel data* while
removing GPS/camera identifiers. `sharp` cannot satisfy "lossless JPEG" because it decodes
and re-encodes. Marker/chunk stripping is the only way to keep the exact original JPEG
bytes minus metadata.

**Alternatives considered**:
- *`sharp().withMetadata(false)` / `.rotate()`*: re-encodes JPEG → not lossless. Rejected
  for the original copy. (Still used, as today, to produce the compressed WebP variants.)
- *Store the raw upload untouched*: violates FR-013 (leaks GPS/EXIF).
- *External `exiftool` binary*: heavier dependency and process-spawn per upload; the
  marker walk is a few dozen lines and keeps the API self-contained.

**Note on EXIF orientation**: EXIF may encode rotation. Since we strip EXIF from the
original, the full-size view must honor orientation *before* stripping. Approach: read
orientation from `sharp` metadata at upload; if non-default, we cannot losslessly rotate a
JPEG in-place, so record the orientation in `media_meta` and let the browser/`Lightbox`
render as-is (the WebP variants are already auto-rotated by `image.rotate()`). Most phone
JPEGs are orientation-1 after modern camera apps; document this limitation in quickstart.

## R2. Deferred 24-hour downgrade mechanism

**Decision**: A **repeatable BullMQ sweep** (every 5 minutes) driven by database state,
mirroring the existing `notification-cleanup` job — not a per-upload delayed job.
- On upload, the API only writes disk + DB state (`media_meta.orig`, `uploaded_at`,
  `converted:false`). It does **not** enqueue anything.
- A new `original-downgrade` queue + worker + repeatable scheduler entry finds `media`
  rows where `media_type = "image"` and `media_meta` marks an unconverted original whose
  `uploaded_at` is older than the retention window, and whose owning shout/comment still
  exists, then converts and reclaims.

**Rationale**:
- Reuses the exact established pattern (`scheduler.ts` `upsertJobScheduler`,
  `queues.ts`, `jobs/*.ts`) — low novelty, easy review.
- **Restart-safe by construction**: all state is in Postgres, so a crash/restart loses no
  pending work (satisfies FR "survive restarts", SC-005).
- **Cancellation is implicit**: if the owning content is soft-deleted before the deadline,
  the sweep skips it (FR-008) — no job to cancel, no orphaned work.
- Avoids adding BullMQ as an API dependency (API currently uses `redis` for sessions
  only, not `bullmq`).
- A 5-minute cadence comfortably meets SC-002 (99% converted within 15 min of deadline).

**Alternatives considered**:
- *Per-upload BullMQ delayed job (`delay: 24h`, `jobId: mediaId`)*: precise timing and
  native `queue.remove(mediaId)` cancellation on delete. Rejected as primary because it
  couples the API to BullMQ, needs delete-time cancellation wiring in `routes/shouts.js`
  and `routes/comments.js`, and duplicates durability that the DB already provides. Kept
  as a documented fallback if minute-level precision is ever required.
- *`node-cron` inside the API process*: the API may run multiple instances → duplicate
  runs; workers container is the right home for background jobs.

## R3. Serving the original during the window without breaking references (FR-006)

**Decision**: Keep the post's media reference identity stable; only the resolved
full-size URL differs.
- Feed/inline: always `320.webp` (`thumb`) and `960.webp` (`url`) — generated at upload,
  unchanged across the transition.
- Full/lightbox: `buildMedia()` returns `full = /media/<id>/original.<ext>` while
  `media_meta.orig` is present and unconverted; after conversion it returns the existing
  `full = /media/<id>/1600.webp`. The `1600.webp` variant is generated at upload time too,
  so it always exists — the swap is seamless and never 404s.

**Rationale**: The lightbox already consumes `media.full` (see `ShoutCard.tsx`), so
switching the value server-side needs **no web change**. The `media`-container nginx
already serves `.jpg/.jpeg/.png` (`media-nginx.conf`), so originals are directly
servable.

**Cache-control caveat**: `media-nginx.conf` sends `immutable, max-age=31536000`. Because
the original and the WebP live at *different* paths, a client that cached
`original.jpg` is unaffected when we later serve `1600.webp`; the deleted original may
still be cached client-side but that is harmless (no broken image, just a stale-but-valid
copy for that one client). No cache-busting needed. Documented as accepted behavior.

## R4. Size limit & configuration (FR-002, FR-011)

**Decision**: Introduce `ORIGINAL_QUALITY_MAX_BYTES` (default `10 * 1024 * 1024`) read
from env in `helpers/media.js`, and a `ORIGINAL_QUALITY_WINDOW_HOURS` (default `24`) for
the retention window used by the worker. Multer's `limits.fileSize` for the media upload
already enforces 10 MB and returns `LIMIT_FILE_SIZE`; the existing Russian message
(`Файл слишком большой (макс. 10 МБ)`) is reused/parameterized so the copy matches the
configured limit. "At the limit is accepted, strictly above is rejected" matches multer
semantics (rejects when `size > limit`).

**Rationale**: Satisfies FR-002/FR-011 and the boundary edge case, with the message driven
by the configured value so prose and behavior stay in sync (constitution: env-driven
config).

**Alternatives considered**: Hardcoding 10 MB (rejected — violates FR-011).

## R5. Failure handling & storage reclamation (FR-007, FR-009)

**Decision**:
- Convert to a temp file first, `fsync`/rename into place, confirm the WebP exists, flip
  `media_meta.converted = true`, and only then `unlink` the original. Order guarantees the
  image is never lost mid-conversion (SC-005).
- On any error, leave `converted:false` and the original in place; the next sweep retries
  automatically (BullMQ `attempts`/`backoff` on the job plus the recurring sweep provide
  two layers of retry). Never delete the original unless the WebP is confirmed present.

**Rationale**: Directly satisfies FR-009 ("keep serving and retaining the original, retry,
never lose") and FR-007 ("reclaim only after conversion confirmed").

## Resolved unknowns

All `NEEDS CLARIFICATION` items are resolved: metadata-stripping strategy (R1), deferral
mechanism (R2), reference stability (R3), config (R4), and failure/reclaim ordering (R5).
No open clarifications remain.
