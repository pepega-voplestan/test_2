# Contract: `POST /api/v1/upload/media` (original-quality behavior)

Extends the existing endpoint in `api/src/routes/upload.js`. Auth, rate limiting, and the
GIF/video/WebP paths are unchanged. This contract covers the JPG/PNG original-quality path.

## Request

- **Auth**: `requireAuth` session (unchanged). Rate limited by `uploadLimiter`
  (per-user key, IP fallback when unauthenticated — must keep working in both states).
- **Body**: `multipart/form-data`, field `file`.
- **Accepted**: `image/jpeg`, `image/png` for the original-quality path.
- **Size limit**: `ORIGINAL_QUALITY_MAX_BYTES` (env, default `10485760`). Multer rejects
  `size > limit`; `size == limit` is accepted.

## Behavior (JPG/PNG, within limit)

1. Validate decodability + dimension/pixel caps via `sharp` metadata (as today).
2. Generate `320/960/1600.webp` variants (as today; auto-rotated, quality 82).
3. **New**: write a **metadata-stripped, losslessly-preserved** original as
   `original.<ext>` (EXIF/GPS/IPTC/XMP removed; pixel data byte-identical — see research R1).
4. Write `meta.json` and create the `media` row with `media_meta` including
   `orig: "original.<ext>"`, `uploaded_at: <ISO now>`, `converted: false`.
5. Atomic tmp→permanent dir rename (as today).

## Response `200`

```json
{
  "ok": true,
  "mediaId": "<uuid>",
  "urls": {
    "thumb": "/media/<id>/320.webp",
    "medium": "/media/<id>/960.webp",
    "full": "/media/<id>/original.jpg"
  }
}
```

- `full` points to the **original** during the window (was `/media/<id>/1600.webp`).
  After downgrade, `buildMedia()` resolves `full` back to `1600.webp` (see
  [media-dto.md](./media-dto.md)). The upload response reflects the current (original) URL.
- `thumb`/`medium` are unchanged and stable across the transition.

## Error responses

| Condition | Status | Body (`error`, Russian) |
|-----------|--------|--------------------------|
| File exceeds size limit (`LIMIT_FILE_SIZE`) | `400` | `Файл слишком большой (макс. <N> МБ)` — `<N>` derived from `ORIGINAL_QUALITY_MAX_BYTES` |
| Disallowed mime (fileFilter) | `400` | `Допустимые форматы: JPG, PNG, WebP, GIF, MP4` |
| Corrupt/undecodable image | `400` | `Не удалось обработать изображение` (or existing `Недопустимый формат изображения`) |
| No file | `400` | `Файл не выбран` |
| Banned user | `403` | `Вы забанены!` |
| Processing failure | `500` | `Ошибка обработки файла` |

**Guarantee**: On any `4xx`/`5xx`, no partial or corrupted file is persisted to
`MEDIA_DIR` (tmp dir is discarded; permanent rename only on full success).

## Invariants

- Single media per post/comment preserved (endpoint returns one `mediaId`).
- No lossy re-encode of the stored original; privacy metadata stripped (FR-013).
- Non-JPG/PNG uploads bypass this path entirely (no `orig` key written).
