import React from 'react';
import type { GalleryItem } from '../types';

interface GalleryGridProps {
  items: GalleryItem[];
  /**
   * Max rendered height in px. REQUIRED and deliberately without a default —
   * shouts use 300 and comments 200, and hardcoding one value for both is what
   * produced the oversized-comment-preview defect in the first Stage 1 build.
   */
  maxHeight: number;
  /** Static thumbnails instead of animated GIFs (used behind spoiler/NSFW blur). */
  staticOnly?: boolean;
  onOpen?: (index: number) => void;
}

const MAX_ITEMS = 5;
// Clamp keeps one extreme portrait/panorama from dominating the feed (FR-014).
const MIN_RATIO = 0.5;
const MAX_RATIO = 2.0;

/**
 * Per-count grid templates. The cap is five, so this is a closed set of four
 * layouts — expressible declaratively with no measurement, no ResizeObserver and
 * no runtime layout maths (research D11).
 *
 *   2 → two equal halves      3 → one tall left + two stacked right
 *   4 → 2×2                   5 → two on top, three below
 */
const TEMPLATES: Record<number, { columns: string; rows: string; areas: string }> = {
  2: { columns: '1fr 1fr', rows: '1fr', areas: '"a b"' },
  3: { columns: '1fr 1fr', rows: '1fr 1fr', areas: '"a b" "a c"' },
  4: { columns: '1fr 1fr', rows: '1fr 1fr', areas: '"a b" "c d"' },
  5: { columns: 'repeat(6, 1fr)', rows: '1fr 1fr', areas: '"a a a b b b" "c c d d e e"' },
};

const AREA_NAMES = ['a', 'b', 'c', 'd', 'e'];

/**
 * First item's aspect ratio, clamped; falls back to square (research D12).
 *
 * Exported for direct unit testing: jsdom's CSS parser drops `aspect-ratio`
 * entirely, so this value is unobservable through the rendered DOM and asserting
 * it would otherwise require a test-only attribute on the markup.
 */
export function containerRatio(first: GalleryItem | undefined): number {
  const w = first?.width ?? 0;
  const h = first?.height ?? 0;
  // Older media rows carry w:0/h:0 — buildMedia defaults them — so guard the divide.
  if (!w || !h) return 1;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, w / h));
}

/**
 * Inline gallery grid (feature 006, Stage 1 — see contracts/gallery-grid.md).
 *
 * Renders EVERY attached item (FR-012). The container is shaped by the first
 * item's clamped aspect ratio and tiles crop to fill (FR-014), which means the
 * height is fixed before any image loads — image arrival can never reflow the
 * feed (SC-010, guarantee U2).
 *
 * There is no "+N" badge: FR-013 was removed when this replaced the
 * first-item-only preview, because the grid shows everything.
 */
const GalleryGrid: React.FC<GalleryGridProps> = ({ items, maxHeight, staticOnly = false, onOpen }) => {
  // 0 or 1 items is the single-image path's job; rendering nothing here keeps
  // pre-existing single-media content byte-identical (FR-016, FR-032).
  if (!items || items.length < 2) return null;

  const visible = items.slice(0, MAX_ITEMS);
  const template = TEMPLATES[visible.length];
  if (!template) return null;

  return (
    <div
      data-testid="gallery-grid"
      data-count={visible.length}
      className="mb-2 rounded-lg overflow-hidden grid gap-0.5 w-full"
      style={{
        aspectRatio: String(containerRatio(visible[0])),
        maxHeight: `${maxHeight}px`,
        gridTemplateColumns: template.columns,
        gridTemplateRows: template.rows,
        gridTemplateAreas: template.areas,
      }}
    >
      {visible.map((item, i) => {
        const src = item.animated && item.gif && !staticOnly ? item.gif : item.url;
        return (
          <div
            key={`${item.url}-${i}`}
            data-testid={`gallery-tile-${i}`}
            role="button"
            tabIndex={0}
            aria-label={`Изображение ${i + 1} из ${visible.length}`}
            onClick={() => onOpen?.(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen?.(i);
              }
            }}
            // `focus-visible`, not `focus`: a plain `focus:ring` stays lit after a
            // mouse click (the tile keeps DOM focus once the viewer closes), which
            // reads as a stuck text-selection highlight. focus-visible shows the
            // ring for keyboard traversal only, keeping the a11y affordance.
            className="relative overflow-hidden cursor-pointer select-none hover:opacity-90 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0087ff]"
            style={{ gridArea: AREA_NAMES[i] }}
          >
            <img
              src={src}
              alt=""
              loading="lazy"
              draggable={false}
              className="w-full h-full object-cover"
            />
          </div>
        );
      })}
    </div>
  );
};

export default GalleryGrid;
