# Component Contract: EmojiPicker & GifPicker

**Files**: `web/components/EmojiPicker.tsx`, `web/components/GifPicker.tsx`, `web/hooks/useGifPicker.ts`

---

## EmojiPicker (refactored)

The existing `EmojiPicker` component gains a GIF tab and one new optional prop. All existing behavior is preserved.

```typescript
interface EmojiPickerProps {
  onSelect: (emoji: string) => void;       // existing — inserts emoji text
  onSelectGif?: (gif: GifSelection) => void; // new — fires when user selects a GIF
  size?: 'sm' | 'md';                       // existing
}

interface GifSelection {
  giphyId: string;      // Giphy GIF ID
  url: string;          // animated CDN URL (fixed_height)
  still: string;        // static CDN URL (fixed_height_still)
  width: number;
  height: number;
}
```

**Tab structure** (internal):
- Tab 0: "Эмодзи" — existing emoji content (no changes)
- Tab 1: "GIF" — renders `<GifPicker>` if `onSelectGif` is provided; tab button is hidden/disabled otherwise

**Backward compatibility**: `onSelectGif` is optional. If not provided, the GIF tab button does not appear. Existing usages of `EmojiPicker` that only pass `onSelect` are unaffected.

---

## GifPicker

New component rendered inside the EmojiPicker popup when the GIF tab is active.

```typescript
interface GifPickerProps {
  onSelect: (gif: GifSelection) => void;   // fires on GIF selection
  reducedMotion: boolean;                  // from prefers-reduced-motion
  isAuthenticated: boolean;                // shows/hides Favorites + My GIFs tabs
  mobileReadOnly: boolean;                 // passed from parent's mobile detection
}
```

**Internal sections** (rendered as sub-tabs within the GIF tab):

| Section | Visible to anon | Description |
|---------|-----------------|-------------|
| Поиск | ✅ | Search input + results grid |
| Популярное | ✅ | Default view: trending GIFs |
| Избранное | Auth only | User's saved favorites, optimistic add/remove |
| Мои GIF | Auth only | User's uploaded GIFs + upload button |

**GIF grid item behavior**:
- `<img src={reducedMotion ? gif.still : gif.url}>` with explicit `width` and `height` to prevent layout shifts
- Click/tap → calls `onSelect(gif)` → picker closes
- Star/heart icon overlay → toggles favorite (optimistic); hidden for anonymous users
- Min touch target: 44 × 44 px (per FR-019)

**Attribution footer**: Fixed at bottom of GIF tab — `"Powered by GIPHY"` with Giphy logo SVG (required by Giphy ToS).

**Upload button** (in "Мои GIF" section):
- `<input type="file" accept="image/gif">` (no `capture` attribute — avoids camera-only restriction on iOS)
- Client-side MIME + size check before upload (matching FR-011, FR-012)
- On selection, uploads to `POST /api/v1/gifs/upload`, shows progress, prepends result to list

---

## useGifPicker Hook

```typescript
interface UseGifPickerReturn {
  // Search
  query: string;
  setQuery: (q: string) => void;
  searchResults: GifItem[];
  isSearching: boolean;

  // Trending
  trending: GifItem[];
  isTrendingLoading: boolean;

  // Favorites
  favorites: FavoriteItem[];
  isFavoritesLoading: boolean;
  toggleFavorite: (gif: GifItem) => void;   // optimistic
  isFavorite: (giphyId: string) => boolean;

  // User library
  myGifs: MyGifItem[];
  isMyGifsLoading: boolean;
  uploadGif: (file: File) => Promise<void>;
  isUploading: boolean;
  uploadError: string | null;
  deleteMyGif: (id: string) => void;        // optimistic

  // Errors
  searchError: string | null;
  trendingError: string | null;
}

interface GifItem {
  id: string;
  title: string;
  url: string;      // animated
  still: string;    // static
  width: number;
  height: number;
}

interface FavoriteItem extends GifItem {
  favoriteId: string;
  createdAt: string;
}

interface MyGifItem {
  id: string;       // UserGif.id
  mediaId: string;
  thumb: string;
  gif: string;
  createdAt: string;
}
```

**Debounce**: `query` changes trigger search after 400 ms debounce to avoid rapid API calls.

**Trending fetch**: Triggered once on first mount of GIF tab (lazy, not on EmojiPicker open).

**Favorites fetch**: Triggered on first open of Favorites section (lazy).

**Reduced motion**: `useGifPicker` exports no motion logic — the `reducedMotion` boolean is determined in `EmojiPicker.tsx` via `window.matchMedia('(prefers-reduced-motion: reduce)')` and passed down.

---

## Caller Integration: ShoutInput.tsx

When `EmojiPicker` fires `onSelectGif`:
1. Call `POST /api/v1/gifs/reference` with the `GifSelection` data.
2. On success, set `mediaId = data.mediaId` and `mediaPreview = gif.url` (same state as an uploaded image).
3. On failure, show Russian-language toast error.

The existing `hasMedia` guard already prevents attaching a second image once `mediaId` is set, so no additional single-media enforcement is needed in this caller.

## Caller Integration: ShoutCard.tsx (comment composer)

Same pattern as `ShoutInput.tsx` using the existing `replyMediaId` / `replyMediaPreview` state.
