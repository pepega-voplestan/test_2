import React, { useState } from 'react';
import type { GalleryItem } from '../types';

interface GalleryCarouselProps {
  items: GalleryItem[];
  /**
   * Max rendered height in px. REQUIRED and deliberately without a default —
   * shouts use 300 and comments 200 (same values the retired grid used); since
   * the frame is a fixed 1:1 square, this also bounds its width (FR-015).
   */
  maxHeight: number;
  onOpen?: (index: number) => void;
}

/**
 * Reddit-style inline gallery carousel (feature 006, 2026-07-31 revision —
 * see contracts/gallery-carousel.md). Replaces `GalleryGrid.tsx`.
 *
 * Shows exactly one item at a time, always opening on index 0 (FR-012).
 * The frame is a FIXED 1:1 square — never derived from any item's own
 * dimensions, unlike the retired grid's clamped-ratio container — with every
 * image letterboxed via `object-contain` and `bg-th-page` filling any
 * leftover space (FR-014), mirroring the composer's `PendingMediaStrip` tiles.
 * Navigation loops in both directions (FR-043) via edge-anchored arrows
 * (FR-042) and shows a position indicator (FR-044). Since galleries are
 * images-only (FR-035), there is no animated/GIF branching here at all.
 */
const GalleryCarousel: React.FC<GalleryCarouselProps> = ({ items, maxHeight, onOpen }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // 0 or 1 items is the single-image path's job; rendering nothing here keeps
  // pre-existing single-media content byte-identical (FR-016, FR-032).
  if (!items || items.length < 2) return null;

  const length = items.length;
  const current = items[currentIndex];

  const goPrev = () => setCurrentIndex((i) => (i - 1 + length) % length);
  const goNext = () => setCurrentIndex((i) => (i + 1) % length);

  return (
    <div
      data-testid="gallery-carousel"
      data-count={length}
      className="relative mb-2 rounded-lg overflow-hidden bg-th-page w-full aspect-square"
      style={{ maxHeight: `${maxHeight}px`, maxWidth: `${maxHeight}px` }}
    >
      <div
        data-testid="gallery-carousel-tile"
        role="button"
        tabIndex={0}
        aria-label={`Изображение ${currentIndex + 1} из ${length}`}
        onClick={() => onOpen?.(currentIndex)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen?.(currentIndex);
          }
        }}
        className="w-full h-full cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0087ff]"
      >
        <img
          src={current.url}
          alt=""
          loading="lazy"
          draggable={false}
          className="w-full h-full object-contain"
        />
      </div>

      <button
        type="button"
        data-testid="gallery-carousel-prev"
        aria-label="Предыдущее изображение"
        onClick={goPrev}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-th-card/70 hover:bg-th-card flex items-center justify-center text-th-text transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </button>
      <button
        type="button"
        data-testid="gallery-carousel-next"
        aria-label="Следующее изображение"
        onClick={goNext}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-th-card/70 hover:bg-th-card flex items-center justify-center text-th-text transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </button>

      <div
        data-testid="gallery-carousel-indicator"
        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-th-card/70 text-xs text-th-text tabular-nums"
      >
        {currentIndex + 1} / {length}
      </div>
    </div>
  );
};

export default GalleryCarousel;
