# Contract: Inline gallery grid (UI) — RETIRED 2026-07-31

**Feature**: 006-multi-media-gallery | **Stage**: 1
**Added**: 2026-07-26, superseding the first-item-only preview.
**Retired**: 2026-07-31, superseded by [gallery-carousel.md](./gallery-carousel.md).

This contract governed `web/components/GalleryGrid.tsx` — an adaptive CSS Grid
showing every attached item simultaneously (2/3/4/5-item layouts), shaped by
the first item's clamped aspect ratio. `GalleryGrid.tsx` is deleted as part of
the 2026-07-31 revision, replaced one-for-one at both call sites in
`ShoutCard.tsx` by `GalleryCarousel.tsx` — a single-item-at-a-time carousel
with looping navigation, edge-anchored arrows, and a position indicator,
inside a fixed 1:1-square letterboxed frame instead of a content-derived grid.

Kept here (not deleted) purely so historical references in `plan.md`,
`tasks.md`, and past Clarifications sessions retain a stable target — see the
FR-013 tombstone in `spec.md` for the same convention. The content that used
to live in this file (layout templates, container-shape rules, guarantees) has
no successor-by-line-item in the new contract; read
[gallery-carousel.md](./gallery-carousel.md) fresh rather than diffing against
this file's original body.
