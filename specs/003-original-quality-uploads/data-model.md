# Phase 1 Data Model: Original-Quality Image Uploads

No Prisma schema migration is required. Per-asset conversion state is carried in the
existing `media.media_meta` JSON string column (see `api/prisma/schema.prisma` → `model
Media`). This keeps the change additive and avoids a migration on the hot `media` table.

## Entity: Uploaded image asset (`media` row, `media_type = "image"`)

Existing columns (unchanged): `id`, `user_id`, `media_type`, `media_url`, `media_meta`,
`created_at`, relations to `shouts` / `comments`.

### `media_meta` JSON shape (extended)

Existing keys are preserved; new keys are added for original-quality assets only.

| Key | Type | Existing? | Description |
|-----|------|-----------|-------------|
| `w` | number | existing | Original pixel width |
| `h` | number | existing | Original pixel height |
| `size` | number | existing | Original file size in bytes |
| `mime` | string | existing | Original mime (`image/jpeg` \| `image/png`) |
| `animated` | boolean | existing | GIF flag (unchanged; never set for JPG/PNG originals) |
| `orig` | string \| absent | **new** | Filename of the retained lossless original, e.g. `original.jpg` / `original.png`. **Present ⇒ still in the original-quality window and not yet converted.** Removed after downgrade. |
| `uploaded_at` | string (ISO 8601) | **new** | Upload timestamp; start of the 24-hour window. (Mirrors `created_at`; stored in meta so the worker filters without a join to `created_at` semantics.) |
| `converted` | boolean | **new** | `false` at upload for originals; set `true` after a confirmed WebP downgrade. Absent for legacy/pre-feature rows. |
| `orientation` | number \| absent | **new** | EXIF orientation captured at upload when non-default (see research R1). Optional. |

### Validation rules (enforced at upload, `routes/upload.js` + `helpers/media.js`)

- **VR-1** File mime ∈ {`image/jpeg`, `image/png`} to be eligible for the original-quality
  path. GIF/WebP/MP4/YouTube follow the unchanged existing path (no `orig`).
- **VR-2** File size ≤ `ORIGINAL_QUALITY_MAX_BYTES` (default 10 MB). `size` at the limit is
  accepted; strictly above is rejected before any file is written (multer `LIMIT_FILE_SIZE`).
- **VR-3** File must be a decodable image (`sharp` metadata succeeds and yields
  width/height); otherwise rejected with a Russian message and nothing is stored.
- **VR-4** Dimension/pixel caps (`MEDIA_MAX_DIM`, `MEDIA_MAX_PIXELS`) continue to apply to
  the WebP variant generation exactly as today.
- **VR-5** Single-media invariant unchanged: the asset is the one media for its shout/comment.

### State transitions

```text
        upload (JPG/PNG ≤ limit)
                │
                ▼
   ┌─────────────────────────────┐
   │ ORIGINAL-QUALITY (pending)  │  media_meta.orig set, converted=false
   │  full → original.<ext>      │  original.<ext> + 320/960/1600.webp on disk
   └─────────────────────────────┘
                │
     ┌──────────┴───────────────────────────────┐
     │ owning shout/comment soft-deleted         │
     │ before deadline                           │
     ▼                                           ▼
┌───────────────────────┐        24h elapsed  ┌──────────────────────────────┐
│ SKIPPED (no work)     │ ─────────────────▶  │ sweep converts               │
│ original reclaimed by │  (deleted content   │  1) ensure 1600.webp present │
│ normal media cleanup  │   is just skipped)  │  2) converted=true, drop orig│
└───────────────────────┘                     │  3) unlink original.<ext>    │
                                              └──────────────────────────────┘
                                                          │
                                                          ▼
                                              ┌──────────────────────────────┐
                                              │ CONVERTED (steady state)     │
                                              │  full → 1600.webp            │
                                              └──────────────────────────────┘

  conversion error at any step → remain PENDING (orig kept, converted=false);
  next sweep retries. Original is never unlinked until 1600.webp is confirmed.
```

## Entity: Scheduled downgrade job (logical, not a DB row)

Realized as a **repeatable BullMQ sweep** (`original-downgrade` queue) rather than a
persisted per-image job. Its "state" is derived entirely from the `media_meta` fields
above, which is what makes it restart-safe and implicitly cancellable.

| Attribute | Source |
|-----------|--------|
| Due set | `media` where `media_type="image"` AND `media_meta.orig` present AND `converted` not true AND `uploaded_at < now − ORIGINAL_QUALITY_WINDOW_HOURS` |
| Owning-content check | Row still referenced by a non-soft-deleted shout or comment |
| Effect | WebP confirmed → `converted=true`, remove `orig` key, `unlink` original file |
| Retry | Recurring 5-min sweep + BullMQ job `attempts`/`backoff` |

## On-disk layout per asset (`MEDIA_PATH/<id>/`)

| File | When present |
|------|--------------|
| `320.webp`, `960.webp`, `1600.webp` | Always (generated at upload; survive conversion) |
| `original.jpg` / `original.png` | During original-quality window only; unlinked after conversion |
| `meta.json` | Always (on-disk backup mirror of `media_meta`) |
