# Contract: Inline gallery grid (UI)

**Feature**: 006-multi-media-gallery | **Stage**: 1
**Added**: 2026-07-26, superseding the first-item-only preview.

Governs `web/components/GalleryGrid.tsx` and its two call sites in
`web/components/ShoutCard.tsx` (shout body and comment body).

## When the grid renders

Only when `gallery` is present, i.e. 2+ items (contract
[gallery-dto.md](./gallery-dto.md) G3). A single attachment keeps today's
single-image markup untouched — FR-016/FR-032 depend on that path being
byte-identical.

## Layouts

Exactly four arrangements, chosen by item count. Numbers are attachment order.

```
2 items          3 items           4 items          5 items
┌─────┬─────┐   ┌───────┬─────┐   ┌─────┬─────┐   ┌──────┬──────┐
│     │     │   │       │  2  │   │  1  │  2  │   │  1   │  2   │
│  1  │  2  │   │   1   ├─────┤   ├─────┼─────┤   ├────┬─┴─┬────┤
│     │     │   │       │  3  │   │  3  │  4  │   │ 3  │ 4 │ 5  │
└─────┴─────┘   └───────┴─────┘   └─────┴─────┘   └────┴───┴────┘
```

Six or more items is unreachable — the cap is five and the server enforces it
(FR-002). The component MUST NOT attempt a layout beyond five.

## Container shape

| Rule | Value |
|---|---|
| Aspect ratio | `gallery[0].width / gallery[0].height`, **clamped to 0.5–2.0** |
| Fallback | `1.0` when either dimension is missing or `0` |
| Max height | **300px** in a shout body, **200px** in a comment body |
| Width | 100% of the content column; never causes horizontal scroll |

The per-context max height is a required prop, not a default — hardcoding one
value for both contexts is what produced the oversized-preview defect in the
first Stage 1 build.

## Tiles

- Each tile crops to fill its cell (`object-cover`); no letterboxing inline.
- Tiles are separated by a small uniform gap; the container has the same rounded
  corners as a single-image attachment.
- Animated GIFs animate in-tile, except when the gallery sits behind a
  spoiler/NSFW blur, where the static `url` is used — matching existing
  single-image behaviour.

## Interaction

- Activating tile *i* opens the existing `Lightbox` on `gallery[i]` (FR-036).
- Stage 1 passes a single `src`; **`Lightbox.tsx` is not modified in Stage 1**
  (research D13). Stage 2 adds `items` + `startIndex` for inter-item navigation.
- Tiles are keyboard-activatable and expose an accessible name, as the existing
  single-image attachment does.

## Guarantees

| # | Guarantee |
|---|---|
| U1 | Every attached item is visible inline; nothing is hidden behind a count badge or an extra click. |
| U2 | The container's height is fixed before any image loads, so arrival of image data never reflows the feed (SC-010). |
| U3 | Tile order matches `gallery` order, which matches attachment order (FR-006, G2). |
| U4 | A gallery never renders taller than a single-image attachment in the same context (FR-015). |
| U5 | Behaviour is identical in shouts and comments apart from the max-height value (FR-031). |

## Non-goals

- No "+N" badge — FR-013 was removed; the grid shows everything.
- No inter-item navigation in Stage 1 — that is Stage 2 (FR-017–FR-023).
- No reordering or removal from the rendered grid — galleries are immutable once
  published (FR-029).
