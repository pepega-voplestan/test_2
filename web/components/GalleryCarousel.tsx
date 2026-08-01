import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GalleryItem } from '../types';

/** Minimum horizontal drag distance (px) that counts as a swipe rather than a tap. */
const SWIPE_DISTANCE_THRESHOLD = 40;
/** Minimum drag velocity (px/ms) that counts as a swipe even under the distance threshold. */
const SWIPE_VELOCITY_THRESHOLD = 0.5;
/**
 * Floor (px) the velocity branch requires before it can fire at all. Velocity
 * is dx/elapsed, and elapsed can be a couple of ms for a fast real tap — a tap
 * landing right after a swipe, while the hand hasn't fully settled, can carry
 * a few px of jitter that alone spikes past SWIPE_VELOCITY_THRESHOLD even
 * though it's not an intentional swipe. This floor is well under an
 * intentional flick's travel (see the velocity-branch test, which uses 20px),
 * so real flicks are unaffected.
 */
const SWIPE_MIN_JITTER_DISTANCE = 10;
/** How long the "finish the page turn" / "spring back" animation takes. */
const SETTLE_MS = 260;
const SETTLE_TRANSITION = `transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.3,1)`;

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
 *
 * Horizontal pointer-swipe navigation (2026-07-31 revision, Phase 7
 * convergence) is layered onto the tile alongside its existing tap-to-open
 * behavior: `touchAction: 'pan-y'` keeps vertical page scroll working (the
 * carousel sits inline in a scrolling feed), while a horizontal drag past a
 * distance or velocity threshold pages instead of opening the viewer. A
 * zero-movement pointer sequence (a plain tap or click) still resolves as
 * tile activation — `didSwipe` only gets set once the threshold is crossed,
 * and the tile's `onClick` bails out when it was. The arrow buttons are
 * bumped to a 44px touch target (previously 32px) as the fallback control.
 *
 * The drag visually tracks the finger (2026-08-01 revision): while dragging,
 * the adjacent item is mounted off-frame and both images move together via a
 * single `transform` on the track wrapper, applied imperatively (not React
 * state) so it stays smooth at pointer-move frequency — the same technique
 * `Lightbox.tsx` already uses for its own drag. Crossing the threshold
 * animates the track the rest of the way (`SETTLE_MS`, matching Lightbox's
 * transition curve) and only then commits the index change, so the slide
 * completes visually before the data model — and the now-current image's
 * neighbors — update underneath it.
 */
const GalleryCarousel: React.FC<GalleryCarouselProps> = ({ items, maxHeight, onOpen }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [neighborsMounted, setNeighborsMounted] = useState(false);
  // Touch devices already have swipe (above) — the arrow buttons are a
  // mouse/trackpad fallback and just eat space on mobile. Same
  // matchMedia('(pointer: coarse)') convention as EmojiPicker/GifPicker.
  const [coarsePointer] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const tileRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const didSwipe = useRef(false);
  const startX = useRef(0);
  const startTime = useRef(0);
  const frameWidth = useRef(0);
  const settleTimer = useRef<{ id: number; flush: () => void } | null>(null);

  // Cancels a pending settle timeout if the carousel unmounts mid-animation
  // (e.g. the reader navigates away right after swiping), so it never fires
  // setState on an unmounted component.
  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current.id);
  }, []);

  // Resetting the track's own transform to neutral used to happen inline in
  // commit() (see endDrag), right after calling goNext()/goPrev() — but that
  // setState is async, so the imperative DOM mutation could land before React
  // re-rendered the new current image, visibly flashing the OLD image at the
  // neutral (fully on-frame) position for a frame. useLayoutEffect fires
  // synchronously after the DOM already reflects the new currentIndex but
  // before the browser paints, so by the time the transform resets, the
  // correct image is already what's underneath it.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = 'none';
    track.style.transform = 'translateX(0px)';
  }, [currentIndex]);

  // 0 or 1 items is the single-image path's job; rendering nothing here keeps
  // pre-existing single-media content byte-identical (FR-016, FR-032).
  if (!items || items.length < 2) return null;

  const length = items.length;
  const current = items[currentIndex];
  const prevIndex = (currentIndex - 1 + length) % length;
  const nextIndex = (currentIndex + 1) % length;

  const goPrev = () => setCurrentIndex((i) => (i - 1 + length) % length);
  const goNext = () => setCurrentIndex((i) => (i + 1) % length);

  const applyTrackTransform = (dx: number, animate: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate ? SETTLE_TRANSITION : 'none';
    track.style.transform = `translateX(${dx}px)`;
  };

  const onTilePointerDown = (e: React.PointerEvent) => {
    // A new gesture (including a plain tap) starting before the previous
    // swipe's settle animation finished used to just cancel that pending
    // timer outright, silently dropping its index commit and leaving the
    // track mid-transition — the reported "first tap after a quick swipe
    // doesn't open the image" bug. Flushing it immediately instead means the
    // interrupted swipe always finishes committing before the new gesture's
    // own state (startX, frameWidth, didSwipe) gets set up.
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current.id);
      settleTimer.current.flush();
      settleTimer.current = null;
    }
    dragging.current = true;
    didSwipe.current = false;
    startX.current = e.clientX;
    startTime.current = Date.now();
    frameWidth.current = tileRef.current?.clientWidth ?? 0;
    setNeighborsMounted(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onTilePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    const width = frameWidth.current || 1;
    applyTrackTransform(Math.max(-width, Math.min(width, dx)), false);
  };

  const endDrag = (dx: number, elapsed: number) => {
    const width = frameWidth.current || 1;
    const velocity = Math.abs(dx) / Math.max(elapsed, 1);
    const isSwipe = Math.abs(dx) > SWIPE_MIN_JITTER_DISTANCE
      && (Math.abs(dx) > SWIPE_DISTANCE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD);
    if (isSwipe) {
      didSwipe.current = true;
      const advancing = dx < 0;
      applyTrackTransform(advancing ? -width : width, true);
      const commit = () => {
        // No applyTrackTransform(0, false) here — the neutral-position reset
        // is handled by the useLayoutEffect above, keyed on currentIndex, so
        // it can never land before the new image does (see that effect).
        if (advancing) goNext();
        else goPrev();
        setNeighborsMounted(false);
        settleTimer.current = null;
      };
      settleTimer.current = { id: window.setTimeout(commit, SETTLE_MS), flush: commit };
    } else {
      applyTrackTransform(0, true);
      const finish = () => {
        setNeighborsMounted(false);
        settleTimer.current = null;
      };
      settleTimer.current = { id: window.setTimeout(finish, SETTLE_MS), flush: finish };
    }
  };

  const onTilePointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    endDrag(e.clientX - startX.current, Date.now() - startTime.current);
  };

  const onTilePointerCancel = () => {
    if (!dragging.current) return;
    dragging.current = false;
    applyTrackTransform(0, true);
    const finish = () => {
      setNeighborsMounted(false);
      settleTimer.current = null;
    };
    settleTimer.current = { id: window.setTimeout(finish, SETTLE_MS), flush: finish };
  };

  return (
    <div
      data-testid="gallery-carousel"
      data-count={length}
      className="relative mb-2 rounded-lg overflow-hidden bg-th-page w-full aspect-square"
      style={{ maxHeight: `${maxHeight}px`, maxWidth: `${maxHeight}px` }}
    >
      <div
        ref={tileRef}
        data-testid="gallery-carousel-tile"
        role="button"
        tabIndex={0}
        aria-label={`Изображение ${currentIndex + 1} из ${length}`}
        onPointerDown={onTilePointerDown}
        onPointerMove={onTilePointerMove}
        onPointerUp={onTilePointerUp}
        onPointerCancel={onTilePointerCancel}
        onClick={() => {
          if (didSwipe.current) return;
          onOpen?.(currentIndex);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen?.(currentIndex);
          }
        }}
        style={{ touchAction: 'pan-y' }}
        className="w-full h-full cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0087ff]"
      >
        <div ref={trackRef} data-testid="gallery-carousel-track" className="relative w-full h-full" style={{ willChange: 'transform' }}>
          {neighborsMounted && (
            <div className="absolute inset-0" style={{ transform: 'translateX(-100%)' }}>
              <img src={items[prevIndex].url} alt="" draggable={false} className="w-full h-full object-contain" />
            </div>
          )}
          <img
            data-testid="gallery-carousel-current-img"
            src={current.url}
            alt=""
            loading="lazy"
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain"
          />
          {neighborsMounted && (
            <div className="absolute inset-0" style={{ transform: 'translateX(100%)' }}>
              <img src={items[nextIndex].url} alt="" draggable={false} className="w-full h-full object-contain" />
            </div>
          )}
        </div>
      </div>

      {!coarsePointer && (
        <>
          <button
            type="button"
            data-testid="gallery-carousel-prev"
            aria-label="Предыдущее изображение"
            onClick={goPrev}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-th-card/70 hover:bg-th-card flex items-center justify-center text-th-text transition-colors"
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
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-th-card/70 hover:bg-th-card flex items-center justify-center text-th-text transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </>
      )}

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
