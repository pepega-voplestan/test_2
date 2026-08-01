# Contract: Inline gallery carousel (UI)

**Feature**: 006-multi-media-gallery | **Stage**: 1 (2026-07-31 revision)
**Added**: 2026-07-31, replacing `gallery-grid.md` (see that file — retired in
place, not deleted, so historical references keep a stable target).

Governs `web/components/GalleryCarousel.tsx` and its two call sites in
`web/components/ShoutCard.tsx` (shout body and comment body), replacing
`GalleryGrid.tsx` at both.

## When the carousel renders

Only when `gallery` is present, i.e. 2+ items (contract
[gallery-dto.md](./gallery-dto.md) G3). A single attachment keeps today's
single-image markup untouched — FR-016/FR-032 depend on that path being
byte-identical. Unchanged from the grid it replaces.

## Behavior

- Exactly one item is visible at a time. The carousel always opens on index 0
  (the first uploaded item, FR-012) — there is no persisted "last viewed"
  position across renders.
- Forward/backward arrow buttons are anchored to the carousel frame's own
  left/right edges (FR-042) — not the viewport edges, since this is inline,
  not fullscreen.
- Navigation loops in both directions (FR-043): from the last item, forward
  goes to index 0; from index 0, backward goes to the last item.
  `next = (current + 1) % length`, `prev = (current - 1 + length) % length`.
- A position indicator (e.g. "2 / 5") is shown at the bottom of the frame
  (FR-044).
- Arrows and the indicator are only rendered when `gallery.length > 1` — moot
  in practice, since a `gallery` field is never emitted for a 1-item post
  (FR-016), so this component never even mounts for that case.

## Frame shape

| Rule | Value |
|---|---|
| Ratio | **Fixed 1:1 square** — NOT derived from any item's own dimensions (supersedes the grid's first-item-derived, clamped ratio) |
| Max height | **300px** in a shout body, **200px** in a comment body — same as the grid (FR-015); since the frame is square, this also bounds its width |
| Width | Equal to the height (square); never causes horizontal scroll |
| Fitting | `object-contain` — every image is shown whole, never cropped or stretched |
| Letterbox fill | `bg-th-page` — the same darkest-background token used by the composer's `PendingMediaStrip.tsx` tiles (FR-040), for one consistent visual language between compose-time and read-time |
| Stability | The frame's size and shape never change as the reader pages between items — no layout shift regardless of content (SC-010) |

The per-context max height is a required prop, not a default — same rationale
as the grid: hardcoding one value for both contexts previously produced the
oversized-comment-preview defect.

## Interaction

- Activating the currently-displayed item opens the existing `Lightbox` on
  `gallery[currentIndex]` (FR-036) — same mechanism the grid used per-tile,
  now targeting whichever index the carousel is on. `Lightbox.tsx` is **not**
  modified (Stage 2, which would have added inter-item navigation to it, is
  retired — see `research.md` D20).
- The frame itself (or its arrows) is keyboard-activatable and exposes an
  accessible name, matching the grid's tile accessibility and the existing
  single-image attachment's.

## Guarantees

| # | Guarantee |
|---|---|
| U1 | Every attached item is reachable via the carousel's navigation, in either direction, from any starting item — nothing is permanently hidden. |
| U2 | The frame's dimensions are fixed before any image loads and never change with content, so arrival of image data never reflows the feed (SC-010) — a stronger guarantee than the grid's U2, which derived its (still-fixed) shape from the first item. |
| U3 | Carousel order matches `gallery` order, which matches attachment order (FR-006, G2); index 0 is always the first item shown. |
| U4 | A gallery never renders taller than a single-image attachment in the same context (FR-015). |
| U5 | Behaviour is identical in shouts and comments apart from the max-height value (FR-031). |

## Non-goals

- No simultaneous multi-tile display — exactly one item is visible at a time.
  This is a deliberate reversal of the grid's "show everything at once"
  design, not an oversight.
- No fullscreen-specific inter-item navigation — Stage 2 is retired; browsing
  happens inline, before the reader ever opens anything fullscreen.
- No reordering or removal from the rendered carousel — galleries are
  immutable once published (FR-029).
- No GIF handling (`animated`/`gif` fields) — galleries are images-only as of
  this revision (FR-035), so a gallery entry is never animated. The
  `staticOnly` prop and animated-tile branching the grid needed for
  spoiler/NSFW blur are dead code here and are not carried over.
