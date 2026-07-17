# Contract: `buildMedia()` full-URL selection

`api/src/helpers/media.js` → `buildMedia(mediaObj)` for `media_type === "image"`.

## Rule

The full-size (lightbox/"opened") URL is selected from conversion state; feed and thumb
URLs are unchanged and stable across the transition.

| `media_meta` state | `full` resolves to |
|--------------------|--------------------|
| `orig` present AND `converted !== true` | `/media/<id>/<orig>` (the original, e.g. `original.jpg`) |
| `converted === true`, or `orig` absent (legacy rows / GIF) | `/media/<id>/1600.webp` (existing behavior) |

`url` (`/media/<id>/960.webp`) and `thumb` (`/media/<id>/320.webp`) are **unchanged in all
states**. Animated GIF handling (`gif`, `animated`) is unchanged.

## Returned DTO (image)

```json
{
  "type": "image",
  "url": "/media/<id>/960.webp",
  "thumb": "/media/<id>/320.webp",
  "full": "/media/<id>/original.jpg  |  /media/<id>/1600.webp",
  "width": <meta.w>,
  "height": <meta.h>
}
```

## Web consumption (no change required)

`web/components/ShoutCard.tsx` already renders the lightbox from `media.full`
(`<Lightbox src={... shout.media.full} />` / comment equivalent). Because the swap is
server-side, no front-end change is needed. Verify during implementation that every
lightbox open uses `media.full` (not a hardcoded `1600.webp`).

## Transition guarantees (FR-006)

- The `media` row id and `media_url` never change.
- `thumb`/`url` never 404 across the transition (WebP variants exist from upload onward).
- `full` never 404s: `1600.webp` exists from upload onward, and the original exists until
  the conversion that flips `converted=true` deletes it — the flip and the URL swap are
  atomic from the reader's perspective (a request either reads pre-flip meta → original
  still on disk, or post-flip meta → `1600.webp` on disk).
