# Quickstart & Validation Guide: Emoji & GIF Picker

**Date**: 2026-06-30 | **Feature**: `002-emoji-gif-picker`

This guide documents the runnable validation scenarios that prove the feature works end-to-end. It is not a test suite — it describes manual verification steps and the API calls you can run to confirm each story.

---

## Prerequisites

1. Local dev environment running (`cd web && npm run dev` — starts API on :3000 + Vite on :5173)
2. `GIPHY_API_KEY` set in `.env.dev` (obtain a free key from [developers.giphy.com](https://developers.giphy.com))
3. At least one registered user account
4. PostgreSQL migrations applied:
   ```sh
   cd api && npx prisma migrate dev
   ```
5. A local `.gif` file ≤ 10 MB for upload testing

---

## Story 1 — Search and Insert a GIF (P1)

### Server health check
```sh
curl -s http://localhost:3000/api/v1/gifs/trending | jq '.gifs | length'
# Expect: a number > 0 (e.g. 25)

curl -s "http://localhost:3000/api/v1/gifs/search?q=cat" | jq '.gifs[0].id'
# Expect: a Giphy ID string
```

### Manual UI flow
1. Log in as a test user
2. Open the shout composer
3. Click the emoji picker button (smiley face icon)
4. Click the **GIF** tab — trending GIFs appear in a scrollable grid
5. Type `смех` in the search field — results update after ~400 ms
6. Click any GIF — picker closes, the GIF appears as the post's media preview
7. Submit the shout
8. **Verify**: The submitted shout in the feed shows the animated GIF

### Edge case — Giphy unavailable
1. Temporarily unset `GIPHY_API_KEY` in `.env.dev`, restart the API
2. Open the GIF tab — expect Russian-language error message ("GIF-сервис недоступен"), not a crash
3. Emoji tab must remain fully functional

---

## Story 2 — Browse Trending GIFs (P2)

### Manual UI flow
1. Open emoji picker → GIF tab without typing in the search field
2. **Verify**: Trending GIFs shown immediately (or within 2 s)
3. **Verify**: Russian section/category headings visible
4. Click a GIF to insert — picker closes, GIF is set as media attachment

---

## Story 3 — GIF Favorites (P3)

### API smoke test
```sh
# Requires valid session cookie from login
COOKIE="connect.sid=..."

# Add a favorite
curl -s -X POST http://localhost:3000/api/v1/gifs/favorites \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"giphyId":"abc123","giphyUrl":"https://media.giphy.com/media/abc123/giphy_s.gif"}' | jq .
# Expect: { "ok": true }

# List favorites
curl -s http://localhost:3000/api/v1/gifs/favorites \
  -H "Cookie: $COOKIE" | jq '.favorites | length'
# Expect: 1

# Add same GIF again (idempotency)
curl -s -X POST http://localhost:3000/api/v1/gifs/favorites \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"giphyId":"abc123","giphyUrl":"https://media.giphy.com/media/abc123/giphy_s.gif"}' | jq .
# Expect: { "ok": true } with no duplicate created

# Remove favorite
curl -s -X DELETE "http://localhost:3000/api/v1/gifs/favorites/abc123" \
  -H "Cookie: $COOKIE" | jq .
# Expect: { "ok": true }

# List favorites again
curl -s http://localhost:3000/api/v1/gifs/favorites \
  -H "Cookie: $COOKIE" | jq '.favorites | length'
# Expect: 0
```

### Manual UI flow
1. In the GIF tab, hover/tap a GIF — a bookmark icon appears
2. Click the icon — it toggles to "filled" immediately (optimistic)
3. Open the **Избранное** section — the GIF appears there
4. Click the icon again to un-favorite — GIF disappears from Избранное immediately with rollback on error

### Empty Favorites state
- Open Избранное with no saved GIFs — expect Russian prompt explaining how to add favorites

---

## Story 4 — Upload and Reuse Personal GIFs (P4)

### API smoke test
```sh
COOKIE="connect.sid=..."

# Upload a GIF
curl -s -X POST http://localhost:3000/api/v1/gifs/upload \
  -H "Cookie: $COOKIE" \
  -F "file=@/path/to/test.gif" | jq .
# Expect: { "ok": true, "id": "...", "mediaId": "...", "thumb": "/media/.../320.webp", "gif": "/media/.../original.gif" }

# List my GIFs
curl -s http://localhost:3000/api/v1/gifs/my \
  -H "Cookie: $COOKIE" | jq '.gifs | length'
# Expect: 1

# Attempt upload of non-GIF
curl -s -X POST http://localhost:3000/api/v1/gifs/upload \
  -H "Cookie: $COOKIE" \
  -F "file=@/path/to/test.jpg" | jq .
# Expect: { "error": "Допустимый формат: GIF" }

# Soft-delete the uploaded GIF
GIF_ID=$(curl -s http://localhost:3000/api/v1/gifs/my -H "Cookie: $COOKIE" | jq -r '.gifs[0].id')
curl -s -X DELETE "http://localhost:3000/api/v1/gifs/my/$GIF_ID" \
  -H "Cookie: $COOKIE" | jq .
# Expect: { "ok": true }

# List again — should be empty
curl -s http://localhost:3000/api/v1/gifs/my \
  -H "Cookie: $COOKIE" | jq '.gifs | length'
# Expect: 0
```

### Manual UI flow
1. Open GIF picker → **Мои GIF** section
2. Click the upload button — native file picker opens
3. Select a `.gif` file ≤ 10 MB
4. **Verify**: GIF appears in the list immediately after upload
5. Click the GIF to insert into a post — works like any other GIF
6. Click the delete icon on the GIF — it disappears immediately (optimistic)
7. Re-open picker — GIF is gone from the list; any previously posted shout using it still shows the GIF

---

## Cross-Device & iOS Validation

### Mobile layout (Chrome DevTools, 375px viewport)
1. Open emoji picker → GIF tab
2. **Verify**: No horizontal overflow, grid is touch-scrollable
3. Tap search field — keyboard appears, grid scrolls up to remain visible (picker not obscured)
4. Tap a GIF — selects correctly

### iOS Safari (real device or Simulator)
1. Open emoji picker → GIF tab → trending GIFs render
2. Tap search — keyboard appears without breaking layout
3. Tap **Мои GIF** → upload button → **Verify**: iOS file picker opens (Files + Photos available)
4. Select a GIF from Files — upload proceeds

### Reduced Motion
1. Enable "Reduce Motion" in macOS/iOS Accessibility settings (or use DevTools `prefers-reduced-motion: reduce`)
2. Open GIF tab → **Verify**: GIF thumbnails in the grid are static images (no animation)
3. Click a GIF to insert — the post/feed shows the GIF animated (explicit selection overrides the static preview)

---

## Regression Checks

After implementing, verify these existing behaviors are unaffected:

- [ ] Emoji picker (emoji tab) still works — selecting an emoji inserts it into the text
- [ ] Uploading an image attachment to a shout still works
- [ ] YouTube URL detection in shout content still works
- [ ] Comment media upload still works
- [ ] Single-media constraint: attaching a GIF then trying to attach an image shows the image replaces the GIF (or vice versa)
- [ ] Single-media constraint: GIF tab is visually blocked/disabled when a YouTube embed is detected in the composer text
