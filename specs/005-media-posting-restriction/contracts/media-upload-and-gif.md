# Contract: `POST /upload/media`, `POST /gifs/upload` (media-restriction gate); `POST /gifs/reference` (explicitly NOT gated)

**Revised 2026-07-23**: `POST /gifs/reference` (Giphy search-and-attach) is no longer gated by `is_media_allowed` — it creates a `giphy`-type `Media` row that only references Giphy's external CDN, storing nothing physically on our server, so it's treated the same as a YouTube attach: unaffected by this restriction. Only the two routes that write a real file to `MEDIA_PATH` remain gated. See `data-model.md`'s "Scope of enforcement" section for the full `media_type` breakdown.

Existing endpoints (`api/src/routes/upload.js:31+`, `api/src/routes/gifs.js:238-316` for `/gifs/upload`; `api/src/routes/gifs.js:118-139` for the now-ungated `/gifs/reference`). The two gated routes each perform a per-request `is_banned` lookup before creating anything; this feature extends that same lookup and adds one guard clause per route, in the same position (immediately after the ban check, before any file processing / `Media` row creation).

## `POST /upload/media`

```
POST /api/v1/upload/media
Cookie: session (required — requireAuth)
Content-Type: multipart/form-data (file field, handled by multer before this check runs)
```

Existing pattern at `upload.js:45-48`, extended:

```js
const authCheck = await prisma.user.findUnique({
  where: { id: userId },
  select: { is_banned: true, is_media_allowed: true },
});
if (authCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });
if (!authCheck?.is_media_allowed) return res.status(403).json({ error: "Вам запрещено прикреплять медиафайлы" });
```

The uploaded file is discarded (never written to `MEDIA_PATH`, no `Media` row created) when this branch fires — same discard behavior the route already has for other rejected-upload cases (oversized, corrupt, etc.).

**Out of scope**: avatar upload (`upload.js:227+`) is a distinct capability (profile-level media) and is NOT gated by this feature, per spec Assumptions.

## `POST /gifs/reference` (Giphy pick) — NOT gated

```
POST /api/v1/gifs/reference
Cookie: session (required — requireAuth)
Body: { giphyId, ... } (per gifReferenceSchema)
```

Only the existing ban check (`gifs.js:123-124`) applies. No `is_media_allowed` guard — this route creates a `Media` row (`media_type: "giphy"`) that stores only a Giphy ID and external CDN URLs, nothing physically on our server, so a restricted user can use this route exactly like an unrestricted one.

## `POST /gifs/upload` (personal GIF upload)

```
POST /api/v1/gifs/upload
Cookie: session (required — requireAuth)
Content-Type: multipart/form-data
```

Same guard, inserted after the existing ban check at `gifs.js:251-252`, before the `Media` row (`media_type: "image"`) and `UserGif` row are created.

## Explicitly NOT gated

- `GET /gifs/search`, `GET /gifs/trending` — pure browse/search, no `Media` row created.
- `POST /gifs/reference` — see above; creates a reference-only `Media` row, no file stored.
- `GET /gifs/favorites`, `POST /gifs/favorites`, `DELETE /gifs/favorites/:giphyId` — favoriting stores only a `GifFavorite` row referencing an already-existing `Media` row; it never creates new attachable media itself.
- `GET /gifs/my` — lists already-created `Media` rows, read-only. Selecting one to *attach* (via `mediaId` on shout/comment creation) is also never gated — see `shout-comment-creation.md` (revised 2026-07-23): only *creating* a new file is gated, not reusing an existing one.

## Response (403 on the two gated routes)

```
403 Forbidden
{ "error": "Вам запрещено прикреплять медиафайлы" }
```

Identical error shape/copy across the only two gated entry points in the entire feature (both in this file — `shout-comment-creation.md`'s route is no longer gated at all), so the frontend can handle the rejection with one shared error-message check regardless of which of the two triggered it.
