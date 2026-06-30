# Data Model: Emoji & GIF Picker

**Date**: 2026-06-30 | **Feature**: `002-emoji-gif-picker`

## New Prisma Models

### GifFavorite

Stores a user's saved reference to a Giphy GIF. Uniqueness on `(user_id, giphy_id)` ensures idempotency.

```prisma
model GifFavorite {
  id         String   @id @default(uuid())
  user_id    String
  giphy_id   String   // Giphy stable GIF ID (e.g. "xTiN0L7EW5trfOvEk0")
  giphy_url  String   // Snapshot of fixed_height CDN URL for quick display
  created_at DateTime @default(now())

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([user_id, giphy_id])
  @@index([user_id, created_at], name: "idx_gif_favorites_user")
  @@map("gif_favorites")
}
```

**Key design choices**:
- `giphy_url` is a CDN URL snapshot. Giphy CDN URLs for `fixed_height` are stable but not guaranteed permanent. Stored here to avoid re-fetching Giphy on every picker open. Acceptable staleness risk (Giphy removes very old GIFs rarely).
- Removal is a hard-delete (same pattern as `ShoutLike`). There is no user-generated content to preserve.
- Per-user cap of 500 enforced at API layer, not via DB constraint.

---

### UserGif

Tracks a user's personal uploaded GIF library entry. The actual file and `Media` record are created by the existing upload pipeline. `UserGif` is the "membership" record — deleting it (soft) removes the GIF from the picker without affecting any posts that previously used it.

```prisma
model UserGif {
  id         String   @id @default(uuid())
  user_id    String
  media_id   String   // FK to the Media record created during upload
  is_deleted Int      @default(0)  // 0 = active, 1 = soft-deleted
  created_at DateTime @default(now())

  user  User  @relation(fields: [user_id], references: [id], onDelete: Cascade)
  media Media @relation(fields: [media_id], references: [id])

  @@index([user_id, is_deleted, created_at], name: "idx_user_gifs_user_active")
  @@map("user_gifs")
}
```

**Key design choices**:
- `is_deleted = 1` hides the entry from `GET /gifs/my` but the `Media` record and on-disk files are untouched. Posts that embedded this GIF continue rendering correctly.
- Per-user cap of 100 enforced at API layer.
- `onDelete: Cascade` on `user` — if user is hard-deleted (not currently allowed but future-safe), the `UserGif` rows cascade. The `Media` record is not cascade-deleted (it is the canonical file record).

---

## Modified Models

### Media (extended, no schema change)

The existing `Media` model gains two new logical `media_type` values handled by `buildMedia()`. No Prisma schema change is needed — `media_type` is an untyped `String`.

| `media_type` | `media_url` | `media_meta` shape |
|--------------|-------------|-------------------|
| `"giphy"` | Giphy GIF ID | `{ url, still, width, height }` |
| `"image"` (existing, animated GIF) | UUID of media dir | `{ w, h, size, mime, animated: true }` |

The `"giphy"` type is a new logical type; no migration required beyond the `GifFavorite` and `UserGif` tables.

**`buildMedia()` addition** (`api/src/helpers/media.js`):
```js
if (mediaObj.media_type === "giphy") {
  const meta = JSON.parse(mediaObj.media_meta || "{}");
  return {
    type: "giphy",
    giphyId: mediaObj.media_url,
    url: meta.url,      // animated CDN URL (fixed_height)
    still: meta.still,  // static CDN URL (fixed_height_still)
    width: meta.width || 0,
    height: meta.height || 0,
  };
}
```

### User (schema relations only)

Add back-relations for the new models:

```prisma
model User {
  // ... existing fields ...
  gifFavorites  GifFavorite[]
  userGifs      UserGif[]
}
```

### Media (schema relations only)

```prisma
model Media {
  // ... existing fields ...
  userGifs  UserGif[]
}
```

---

## Migrations

Two migrations are required:

1. **`add_gif_favorites`** — creates `gif_favorites` table.
2. **`add_user_gifs`** — creates `user_gifs` table.

These can be combined into one migration or run separately. Neither modifies existing tables, so they are non-destructive and safe to apply to a live database.

```sh
# From api/ directory:
npx prisma migrate dev --name add_gif_favorites_and_user_gifs
```

---

## Entity Relationships

```
User ──< GifFavorite          (user can have many GIF favorites)
User ──< UserGif >── Media    (user can have many library entries, each pointing to a Media record)
Media ──< Shout               (unchanged — Giphy media_type Media records attach to shouts/comments the same way)
Media ──< Comment             (unchanged)
```

---

## Validation Rules

### GifFavorite

| Field | Rule |
|-------|------|
| `giphy_id` | Non-empty string, max 100 chars, alphanumeric + hyphens |
| `giphy_url` | Valid HTTPS URL, must match `*.giphy.com` domain |
| Per-user count | ≤ 500 favorites (checked before insert) |

### UserGif (upload)

| Field | Rule |
|-------|------|
| File MIME | Must be `image/gif` |
| File size | ≤ 10 MB (`MEDIA_MAX_BYTES`) |
| Per-user count | ≤ 100 active entries (`is_deleted = 0`) |
