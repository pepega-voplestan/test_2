# Research: Emoji & GIF Picker

**Date**: 2026-06-30 | **Feature**: `002-emoji-gif-picker`

## 1. Giphy API Integration

**Decision**: Proxy Giphy REST API calls through the Express backend; never expose the API key to the client.

**Rationale**: Giphy's API Terms of Service require attribution (Giphy logo in the picker). The API key must stay server-side to prevent abuse. Two endpoints are needed: `GET /v1/gifs/trending` and `GET /v1/gifs/search`. Both return paginated GIF objects containing `id`, `title`, `images.*` CDN URLs.

**Key Giphy response fields used**:
- `id` — stable GIF identifier (stored in `GifFavorite.giphy_id`)
- `images.fixed_height.url` — 200px-height preview for the picker grid
- `images.fixed_height.width`, `.height` — for layout reservations (prevents reflow)
- `images.original.url` — full-resolution GIF (used when user selects the GIF)
- `images.fixed_height_still.url` — static first-frame (used when prefers-reduced-motion is active)

**Attribution requirement**: Giphy ToS requires the Giphy logo ("Powered By GIPHY" or similar) to be displayed in the picker. A small attribution element at the bottom of the GIF grid/tab fulfills this.

**Alternatives considered**: Tenor (Google) — free tier, but requires Google API key and has less mature React ecosystem patterns; self-hosted GIF search — prohibitive cost and complexity.

**Caching**: Giphy trending results change slowly. Server-side in-memory cache with 5-minute TTL on trending, no caching on search (query-specific). Same pattern as the existing Steam API proxy in `routes/index.js`.

---

## 2. Storing Giphy GIF References as Media Records

**Decision**: When a user selects a Giphy GIF to attach to a post, the frontend calls `POST /api/v1/gifs/reference` which creates a `Media` record with `media_type = "giphy"` and returns a `mediaId`. The existing single-media flow in `ShoutInput.tsx` / `ShoutCard.tsx` then uses this `mediaId` exactly as it does for uploaded images.

**Rationale**: The existing shout and comment creation endpoints already accept a `mediaId` parameter. Reusing this path requires zero changes to those endpoints. The `Media` model is already generic enough — `media_url` stores the `giphy_id`, `media_meta` stores a JSON blob with the CDN URL and dimensions.

**`buildMedia()` extension**: Add a `"giphy"` branch to `buildMedia()` in `api/src/helpers/media.js`:
```js
if (mediaObj.media_type === "giphy") {
  const meta = JSON.parse(mediaObj.media_meta || "{}");
  return {
    type: "giphy",
    giphyId: mediaObj.media_url,
    url: meta.url,          // fixed_height CDN URL
    still: meta.still,      // fixed_height_still URL
    width: meta.width || 0,
    height: meta.height || 0,
  };
}
```

**`ShoutCard.tsx` rendering**: Add a `type === "giphy"` case in the media render path. Render using `<img>` (same as animated GIF from uploads). Respect `prefers-reduced-motion` by switching between `url` (animated) and `still` (static).

**Alternatives considered**: Embedding the Giphy URL directly into post text and relying on `extractEmbeds()` — rejected because it bypasses the single-media constraint check and pollutes the text content.

---

## 3. GIF Picker UI Architecture (Discord-like)

**Decision**: Refactor `EmojiPicker.tsx` into a tabbed host component. Extract GIF content into a new `GifPicker.tsx` component. Add a `useGifPicker` hook for GIF state.

**Rationale**: The existing `EmojiPicker.tsx` is a large self-contained component (865 lines) primarily holding emoji data. Keeping emoji data there and extracting GIF logic into a sibling component keeps concerns separated without a full rewrite.

**Tab layout**:
```
[ 😀 Эмодзи ] [ GIF ]
```
The tab bar replaces the top search area when GIF tab is active. Within the GIF tab:
```
[ Поиск GIF...        🔍 ]
[ Избранное | Мои GIF | Популярное | Категории ]
[ ...GIF grid... ]
[ Powered by GIPHY ]
[ 📎 Загрузить GIF ]
```

**`onSelectGif` prop**: Added to `EmojiPicker.tsx` alongside the existing `onSelect` (emoji). Callers (`ShoutInput.tsx`, `ShoutCard.tsx` comment composer) handle the GIF reference creation when this callback fires.

**Mobile / iOS keyboard handling**: The existing `mobileReadOnly` pattern in `EmojiPicker.tsx` (readOnly → onTouchEnd focus) is reused for the GIF search input. The picker popup uses `position: fixed` with viewport clamping — existing `positionPopup()` handles resize/scroll events already.

**`prefers-reduced-motion`**: Detect with `window.matchMedia('(prefers-reduced-motion: reduce)')` in `useGifPicker`. Pass a `reducedMotion` boolean to `GifPicker.tsx`. When true, render `still` URLs instead of animated `url` fields in the grid; selected GIF still uses the animated URL (user explicitly chose it).

**Alternatives considered**: Third-party GIF picker component (e.g., `giphy-js`) — adds significant bundle weight, limited control over styling and Russian UI; rejected in favor of a custom component using the raw Giphy API.

---

## 4. Favorites Storage Pattern

**Decision**: New `GifFavorite` Prisma model. Removing a favorite hard-deletes the row (same pattern as `ShoutLike` / `CommentLike` — pure junction record, no user-generated content).

**Rationale**: `GifFavorite` is a junction between a user and an external Giphy ID. The only data is the CDN URL snapshot and a timestamp. There is nothing to preserve on removal — the GIF exists on Giphy's CDN regardless. Soft-delete would add a `is_deleted` field for no benefit.

**Idempotency**: `upsert` on `(user_id, giphy_id)` unique constraint — concurrent favorites of the same GIF don't produce duplicates.

**Cap**: 500 favorites per user (enforced at API layer with a count check before insert). This prevents abuse without a migration and is transparent to users until they approach the limit, at which point a Russian-language error message is shown.

**Alternatives considered**: Storing favorites in `media_meta` on User — rejected, no such field; storing as a JSON array in a `Setting` record — rejected, no relational integrity.

---

## 5. User GIF Library (Personal Uploads)

**Decision**: New `UserGif` Prisma model — `(id, user_id, media_id, is_deleted, created_at)`. Personal GIF upload reuses the existing `/upload/media` endpoint (GIF is already a supported MIME type) with an additional step of creating a `UserGif` record. A dedicated `POST /api/v1/gifs/upload` endpoint wraps the multer/sharp pipeline to add the `UserGif` DB write.

**Rationale**: The existing upload endpoint already handles animated GIFs (stores `original.gif` + WebP thumbnails). Adding a `UserGif` record on top of the existing `Media` record cleanly separates "file exists in storage" from "user's picker library membership".

**Soft-delete behaviour**: `DELETE /api/v1/gifs/my/:id` sets `UserGif.is_deleted = 1`. The underlying `Media` record and files are not touched — a post that used this GIF before deletion continues to display correctly. This is the correct Principle III behaviour.

**File validation**: Only `image/gif` MIME; size limit is 10 MB (same as `MEDIA_MAX_BYTES`); animated validation via `sharp` metadata (`pages > 1` check is done but not mandatory — static GIFs are allowed). Non-GIF files are rejected server-side with Russian error message.

**Per-user cap**: 100 uploaded GIFs per user (enforced at API layer). Matches the spirit of the "reasonable upper bound" assumption in the spec.

**iOS upload flow**: `<input type="file" accept="image/gif">` with `capture` attribute absent (prevents camera-only fallback). On iOS 16+, this opens Files + Photos picker. Photos on iOS may export GIFs as HEIC/HEIF; `sharp` will reject these — the Russian error "Допустимые форматы: GIF" will display. Users must use Files app to pick `.gif` files. This is documented in the quickstart.

---

## 6. API Route Structure

**Decision**: Single new route file `api/src/routes/gifs.js` mounted at `/api/v1`.

**Endpoints summary**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/gifs/search` | Optional | Proxy to Giphy search |
| GET | `/gifs/trending` | Optional | Proxy to Giphy trending (5-min cache) |
| POST | `/gifs/reference` | Required | Create Media record for Giphy GIF, return `mediaId` |
| GET | `/gifs/favorites` | Required | List user's favorites |
| POST | `/gifs/favorites` | Required | Add favorite (idempotent) |
| DELETE | `/gifs/favorites/:giphyId` | Required | Remove favorite |
| GET | `/gifs/my` | Required | List user's uploaded GIFs |
| POST | `/gifs/upload` | Required | Upload personal GIF |
| DELETE | `/gifs/my/:id` | Required | Soft-delete personal GIF |

**Giphy API key**: Read from `process.env.GIPHY_API_KEY`. If missing, `/gifs/search` and `/gifs/trending` return `503` with Russian error message; picker disables the GIF tab gracefully.

---

## 7. Rendering Giphy GIFs in the Feed

**Decision**: Render `type === "giphy"` media in `ShoutCard.tsx` using a `<img>` element that switches between animated URL and static-still URL based on `prefers-reduced-motion`. No `<video>` conversion (Giphy provides MP4 but the `.gif` CDN URL is simpler and covers all browsers including iOS Safari).

**Rationale**: iOS Safari supports animated GIFs natively via `<img>`. The `fixed_height.url` from Giphy is a proper CDN URL that works without CORS issues. No stored `.gif` bytes on our servers for Giphy-sourced media.

**Lightbox**: Existing lightbox component in `ShoutCard.tsx` opens on image click. Extend to also open on `type === "giphy"` media — use `images.original.url` for the full-res lightbox view.

---

## Design Decisions Summary

| Area | Decision | Rationale |
|------|----------|-----------|
| Giphy proxy | Server-side, 5-min trending cache | API key protection, rate limit control |
| GIF in post | `media_type = "giphy"` Media record | Zero changes to shout/comment APIs |
| Favorites removal | Hard-delete `GifFavorite` row | Junction record, no user content |
| UserGif removal | Soft-delete `UserGif.is_deleted = 1` | Preserve underlying Media + files |
| EmojiPicker refactor | Tabbed host + new `GifPicker.tsx` | Separation of concerns, minimal churn |
| iOS GIF upload | `accept="image/gif"` file input | Standard, works with Files app |
| Reduced motion | `still` URL in grid, animated on select | Respects system setting; explicit select is intentional |
| Attribution | "Powered by GIPHY" in GIF tab footer | Giphy ToS requirement |
