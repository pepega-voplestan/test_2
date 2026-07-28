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
| G4 | Every entry has `type: "image"` (GIFs included, flagged by `animated`). `youtube` and `video` never appear (I4). |
| G5 | When `media.type === "youtube"`, `gallery` is always absent (I5, FR-027). |
| G6 | For a soft-deleted shout/comment, `gallery` is omitted along with `media`, matching existing behavior. |

## Consumer expectations

*(Revised 2026-07-26 — Stage 1 now renders every item, so clients need the whole
array, not just its length.)*

- **Stage 1 clients** render **all** entries as an adaptive grid, and use
  `gallery[0].width` / `gallery[0].height` to shape the container (research D12).
  Each tile opens the existing single-image viewer on its own entry's `full` URL.
- **Stage 2 clients** additionally pass `gallery` to `Lightbox` as its `items`
  array for inter-item navigation.
- **Any client that ignores `gallery` entirely** renders `media` — the first item
  — and is correct-but-incomplete, never broken. This is what allows the API to
  deploy ahead of the frontend within a stage.

### Per-item fields the grid depends on

| Field | Used for |
|---|---|
| `url` | tile image source |
| `full` | source when the tile is opened full size |
| `width`, `height` | container aspect ratio, from entry `[0]` only |
| `orientation` | passed through to the viewer, as for single images today |
| `animated` / `gif` | animated tiles; static `url` is used when the gallery is behind a spoiler/NSFW blur |

`width`/`height` may be `0` on older media rows; consumers MUST fall back to a
square container rather than dividing by zero (research D12).

## Non-goals

- No pagination within a gallery (max 5 items).
- No per-item `visibility_tag` — the tag applies to the whole gallery (FR-030).
- No item-level captions or alt text in this feature.
