# Contract: Gallery in read payloads

**Feature**: 006-multi-media-gallery | **Stage**: 1 (shape), 2 (consumed by viewer)

Applies to every payload that already carries a `media` object: feed pages
(`GET /api/v1/shouts`), single shout (`GET /api/v1/shouts/:id`), comment lists,
profile feeds, and SSE `new_shout` / `new_comment` broadcasts.

## Rule

`media` keeps its **exact current shape and meaning** and now denotes the
gallery's preview (position-0) item. A new optional sibling `gallery` carries the
full ordered list.

`gallery` is present **only when the gallery has 2 or more items.** A
single-attachment shout emits no `gallery` key at all, making its payload
byte-identical to pre-feature output (FR-016, FR-032).

## Shape

```jsonc
{
  "id": "…",
  "content": "…",
  "media": {                       // unchanged — produced by buildMedia()
    "type": "image",
    "url":   "/media/<id>/960.webp",
    "thumb": "/media/<id>/320.webp",
    "full":  "/media/<id>/1600.webp",
    "width": 1920,
    "height": 1080
  },
  "gallery": [                     // NEW — omitted entirely when length <= 1
    { "type": "image", "url": "…", "thumb": "…", "full": "…", "width": 1920, "height": 1080 },
    { "type": "image", "url": "…", "thumb": "…", "full": "…", "width": 800,  "height": 1200, "animated": true, "gif": "/media/<id>/original.gif" }
  ]
}
```

Each entry in `gallery` is produced by the **existing** `buildMedia()` helper, so
entries carry `orientation` and `animated`/`gif` under exactly the same
conditions as `media` does today. No new DTO fields are introduced per item.

## Guarantees

| # | Guarantee |
|---|---|
| G1 | When `gallery` is present, `gallery[0]` deep-equals `media`. |
| G2 | `gallery` is ordered by `position` ascending; order is stable across requests and identical for every viewer (FR-006). |
| G3 | `1 ≤ gallery.length ≤ 5` whenever present, and in practice `≥ 2` since 1-item galleries omit the field (FR-001). |
| G4 | Every entry has `type: "image"` **and** `animated` is never `true` — `youtube`, `video`, and GIFs (whether Giphy-sourced or an uploaded animated file) never appear in a 2+-item `gallery` (I4, revised 2026-07-31; see R5 in [shout-comment-create.md](./shout-comment-create.md)). A single-item attachment (no `gallery` field at all) may still be a GIF — this only bounds what a *gallery* array can contain. |
| G5 | When `media.type === "youtube"`, `gallery` is always absent (I5, FR-027). |
| G6 | For a soft-deleted shout/comment, `gallery` is omitted along with `media`, matching existing behavior. |

## Consumer expectations

*(Revised 2026-07-31 — the grid client described below is retired; there is
now exactly one client shape, the carousel.)*

- **Clients render one entry at a time**, indexed by a local `currentIndex`
  starting at 0, inside `GalleryCarousel.tsx`'s fixed 1:1-square frame — they
  no longer need every entry visible simultaneously, and no longer derive the
  frame's shape from `gallery[0].width`/`height` (that was the retired grid's
  approach, research D12 — moot now that the frame is a fixed square
  regardless of content).
- Activating the currently-displayed entry opens the existing single-image
  viewer on that entry's `full` URL, exactly as the grid's per-tile activation
  did — just targeting `gallery[currentIndex]` instead of a clicked tile.
- **Any client that ignores `gallery` entirely** renders `media` — the first
  item — and is correct-but-incomplete, never broken. This is what allows the
  API to deploy ahead of the frontend within a stage.
- Since G4 guarantees no gallery entry is ever animated, a carousel client does
  not need `animated`/`gif`-branching logic at all — every entry always
  renders via its plain `url`, unlike the retired grid, which had to check for
  a spoiler/NSFW-blur static fallback per animated tile.

### Per-item fields the carousel depends on

| Field | Used for |
|---|---|
| `url` | the frame's image source for the currently-displayed entry |
| `full` | source when that entry is opened full size |
| `orientation` | passed through to the viewer, as for single images today |

`width`/`height` are no longer read by the carousel at all (revised
2026-07-31) — the frame's shape is fixed regardless of content, so there is no
aspect-ratio derivation left to feed them into. They remain present in the DTO
for other consumers (e.g. a single-item `media` display still uses them).

## Non-goals

- No pagination within a gallery (max 5 items).
- No per-item `visibility_tag` — the tag applies to the whole gallery (FR-030).
- No item-level captions or alt text in this feature.
