# API Contract: GIF Endpoints

**Base path**: `/api/v1`
**Route file**: `api/src/routes/gifs.js`
**Auth**: `requireAuth` middleware (from `api/src/auth.js`) on endpoints marked Required

---

## GET /gifs/search

Proxy to Giphy search API. Returns a list of GIF objects.

**Auth**: Optional (no session required)

**Query parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | Yes | Search query, 1–100 chars |
| `limit` | integer | No | Results per page, 1–50, default 25 |
| `offset` | integer | No | Pagination offset, default 0 |

**Response 200**:
```json
{
  "gifs": [
    {
      "id": "xTiN0L7EW5trfOvEk0",
      "title": "Laughing GIF",
      "url": "https://media.giphy.com/media/xTiN0L7EW5trfOvEk0/giphy_s.gif",
      "still": "https://media.giphy.com/media/xTiN0L7EW5trfOvEk0/giphy_s_s.gif",
      "width": 480,
      "height": 270
    }
  ],
  "total": 142,
  "offset": 0
}
```

**Response 400**: `{ "error": "Параметр q обязателен" }`
**Response 503**: `{ "error": "GIF-сервис недоступен" }` (Giphy API key not configured or Giphy unreachable)

---

## GET /gifs/trending

Proxy to Giphy trending API. Cached server-side for 5 minutes.

**Auth**: Optional

**Query parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `limit` | integer | No | Results per page, 1–50, default 25 |
| `offset` | integer | No | Pagination offset, default 0 |

**Response 200**: Same shape as `/gifs/search` response (without `total`).

**Response 503**: `{ "error": "GIF-сервис недоступен" }`

---

## POST /gifs/reference

Create a `Media` DB record for a Giphy GIF so it can be attached to a shout/comment via the standard `mediaId` flow. Returns a `mediaId` the client uses exactly like an uploaded image's `mediaId`.

**Auth**: Required

**Request body**:
```json
{
  "giphyId": "xTiN0L7EW5trfOvEk0",
  "giphyUrl": "https://media.giphy.com/media/xTiN0L7EW5trfOvEk0/giphy_s.gif",
  "giphyStill": "https://media.giphy.com/media/xTiN0L7EW5trfOvEk0/giphy_s_s.gif",
  "width": 480,
  "height": 270
}
```

**Validation** (Zod):
- `giphyId`: string, 1–100 chars, alphanumeric + hyphens
- `giphyUrl`: HTTPS URL matching `*.giphy.com`
- `giphyStill`: HTTPS URL matching `*.giphy.com`
- `width`, `height`: positive integers

**Response 200**:
```json
{
  "ok": true,
  "mediaId": "a1b2c3d4-..."
}
```

**Response 400**: `{ "error": "..." }` (Zod validation failure)
**Response 403**: `{ "error": "Вы забанены!" }`

---

## GET /gifs/favorites

List authenticated user's saved GIF favorites, ordered by most recently added.

**Auth**: Required

**Response 200**:
```json
{
  "favorites": [
    {
      "id": "uuid",
      "giphyId": "xTiN0L7EW5trfOvEk0",
      "giphyUrl": "https://media.giphy.com/...",
      "createdAt": "2026-06-30T12:00:00.000Z"
    }
  ]
}
```

---

## POST /gifs/favorites

Add a GIF to favorites. Idempotent — adding an already-favorited GIF returns 200 without creating a duplicate.

**Auth**: Required

**Request body**:
```json
{
  "giphyId": "xTiN0L7EW5trfOvEk0",
  "giphyUrl": "https://media.giphy.com/media/xTiN0L7EW5trfOvEk0/giphy_s.gif"
}
```

**Validation** (Zod): same as `giphyId` / `giphyUrl` rules in `/gifs/reference`.

**Response 200**:
```json
{ "ok": true }
```

**Response 400**: `{ "error": "Достигнут лимит избранного (500)" }` (if cap exceeded)
**Response 403**: `{ "error": "Вы забанены!" }`

---

## DELETE /gifs/favorites/:giphyId

Remove a GIF from favorites (hard-delete the `GifFavorite` row).

**Auth**: Required

**Path param**: `giphyId` — the Giphy GIF ID

**Response 200**: `{ "ok": true }`
**Response 404**: `{ "error": "Не найдено" }` (if the favorite doesn't exist for this user)

---

## GET /gifs/my

List authenticated user's uploaded GIFs (non-deleted), ordered by most recently uploaded.

**Auth**: Required

**Response 200**:
```json
{
  "gifs": [
    {
      "id": "uuid",
      "mediaId": "uuid",
      "thumb": "/media/uuid/320.webp",
      "gif": "/media/uuid/original.gif",
      "createdAt": "2026-06-30T12:00:00.000Z"
    }
  ]
}
```

---

## POST /gifs/upload

Upload a personal GIF. Reuses the existing Sharp/Multer pipeline from `upload.js` but accepts only `image/gif` and creates a `UserGif` record in addition to the `Media` record.

**Auth**: Required

**Request**: `multipart/form-data` with field `file` containing the GIF.

**Validation**:
- MIME: `image/gif` only (rejected by Multer `fileFilter` before Sharp)
- Size: ≤ 10 MB
- Format: Sharp validates the GIF is a readable image

**Response 200**:
```json
{
  "ok": true,
  "id": "user-gif-uuid",
  "mediaId": "media-uuid",
  "thumb": "/media/media-uuid/320.webp",
  "gif": "/media/media-uuid/original.gif"
}
```

**Response 400**: `{ "error": "Файл слишком большой (макс. 10 МБ)" }` or `{ "error": "Допустимый формат: GIF" }` or `{ "error": "Достигнут лимит личных GIF (100)" }`
**Response 403**: `{ "error": "Вы забанены!" }`

---

## DELETE /gifs/my/:id

Soft-delete a personal GIF from the user's library (`UserGif.is_deleted = 1`). The underlying `Media` record and files are not affected.

**Auth**: Required

**Path param**: `id` — the `UserGif.id`

**Response 200**: `{ "ok": true }`
**Response 403**: `{ "error": "Forbidden" }` (if `UserGif` belongs to another user)
**Response 404**: `{ "error": "Не найдено" }`
