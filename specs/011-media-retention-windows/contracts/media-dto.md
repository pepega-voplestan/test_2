# Contract: Media DTO (`buildMedia`)

**Surface**: `api/src/helpers/media.js` → `buildMedia(mediaObj)`, the sole writer of media DTOs consumed by every feed, card, gallery, and admin surface. `buildGallery` filters its `undefined` results.

**Governing rule**: never advertise an address for a file that is not present (FR-003, and CLAUDE.md's "Only reachable image variants exist").

---

## Still image

```jsonc
// Fresh — unchanged from today
{ "type": "image", "url": ".../960.webp", "full": ".../1600.webp", "width": 3000, "height": 2000 }

// Inside the original-quality window — unchanged from today
{ "type": "image", "url": ".../960.webp", "full": ".../IMG_1234.jpg", "orientation": 6, ... }

// NEW: 1600 expired — `full` is ABSENT, not null, not pointing at 960
{ "type": "image", "url": ".../960.webp", "width": 3000, "height": 2000 }
```

| Condition | `full` |
|---|---|
| `meta.orig` set and `converted !== true` | `/media/{id}/{meta.orig}` |
| `reclaimed.variants` includes `"1600"` | **omitted** |
| otherwise | `/media/{id}/1600.webp` |

The expiry check must be evaluated **after** the pending-original check: an image that is both pending-original and marked expired cannot occur (research R2 forbids expiring one), but ordering the checks this way keeps the impossible case failing safe toward the file that exists.

`width`/`height` continue to describe the **original** image, not the served variant — unchanged, and the Lightbox already scales to fit.

## Animated image

Unchanged at every age. Still carries `thumb`, `animated: true`, `gif`, and never `full` (FR-004).

## Video

```jsonc
// Fresh — unchanged from today
{ "type": "video", "url": ".../original.mp4", "thumb": ".../320.webp", "width": 0, "height": 0 }

// NEW: expired — no `url`, no `thumb`
{ "type": "video", "expired": true, "width": 0, "height": 0 }
```

`url` is **omitted** when `reclaimed.video === true`. `thumb` is omitted too — it never resolved to a real file for video (research R10) and must not be carried into a new code path.

## Wholesale-reclaimed media (feature 008)

`reclaimed.files === true` still returns `undefined` from the first branch, before any per-class logic. Unchanged.

---

## `web/types.ts`

```ts
| { type: 'image'; url: string; thumb?: string; full?: string; ... }   // unchanged — `full` already optional
| { type: 'video'; url?: string; thumb?: string; expired?: boolean; width?: number; height?: number }
```

`url` becomes optional on the video variant. This is a **breaking type change** for video consumers and is the point: it forces every `<video src=…>` call site to be revisited rather than silently receiving `undefined`.

## Consumer obligations

| Call site | Obligation |
|---|---|
| `web/components/Lightbox.tsx:98` | `activeItem.full ?? activeItem.url` |
| `web/components/Lightbox.tsx:564,586` | same, for prev/next neighbours |
| `web/components/ShoutCard.tsx:1438` | same, for a shout's single image |
| `web/components/ShoutCard.tsx:931` | same, for a comment's image |
| `web/components/ShoutCard.tsx:1444` | if `media.expired`, render the Russian tombstone instead of `<video>` |
| `web/components/ShoutCard.tsx:937` | same, for a comment's video |

**Prohibited**: substituting `url` for `full` inside `buildMedia`. The DTO must not report a full-size address that is really the display copy (FR-007).
