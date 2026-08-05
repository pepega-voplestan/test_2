import React, { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import { useScrollLock } from '../hooks/useScrollLock';
import type { GalleryItem } from '../types';

interface LightboxProps {
  /** Single-image mode. Ignored when `items` is present. */
  src?: string;
  alt?: string;
  onClose: () => void;
  /** EXIF orientation (1–8) of the source image. Applied as a CSS transform so a
   *  metadata-stripped original (served during the original-quality window)
   *  renders upright. Omit / 1 = no transform. Ignored when `items` is present. */
  orientation?: number;
  /** Gallery mode: when present and non-empty, Lightbox owns paging between
   *  items (arrows, swipe, keyboard, looping) instead of showing a single image. */
  items?: GalleryItem[];
  /** Initial index into `items`. Only meaningful in gallery mode. */
  startIndex?: number;
}

// EXIF orientation (1–8) → CSS transform that renders the image upright.
const ORIENTATION_TRANSFORMS: Record<number, string> = {
  2: 'scaleX(-1)',
  3: 'rotate(180deg)',
  4: 'scaleY(-1)',
  5: 'rotate(90deg) scaleX(-1)',
  6: 'rotate(90deg)',
  7: 'rotate(270deg) scaleX(-1)',
  8: 'rotate(270deg)',
};

// Orientations 5–8 rotate the image 90°/270°, swapping its visual width/height.
// The <img> is sized before the transform, so its max box must be swapped
// (max-w:90vh / max-h:90vw) or the rotated image overflows the 90vw×90vh viewport.
const ORIENTATION_SWAPS_AXES = new Set([5, 6, 7, 8]);

const DISMISS_THRESHOLD = 120; // px of drag needed to dismiss
const VELOCITY_THRESHOLD = 0.5; // px/ms — fast flick dismisses even if threshold not met
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

// Gallery-mode paging thresholds — same values as GalleryCarousel.tsx (kept as an
// independent copy; four primitives, not worth a cross-component module for).
const SWIPE_DISTANCE_THRESHOLD = 40;
const SWIPE_VELOCITY_THRESHOLD = 0.5;
const SWIPE_MIN_JITTER_DISTANCE = 10;
const SETTLE_MS = 260;
const SETTLE_TRANSITION = `transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.3,1)`;
// px of movement before a drag commits to horizontal (page) or vertical (dismiss).
const AXIS_LOCK_THRESHOLD = 8;

const Lightbox: React.FC<LightboxProps> = ({ src, alt = 'attachment', onClose, orientation, items, startIndex }) => {
  const galleryMode = !!(items && items.length > 0);
  const length = galleryMode ? items!.length : 0;

  const [currentIndex, setCurrentIndex] = useState(() =>
    galleryMode ? Math.min(Math.max(startIndex ?? 0, 0), items!.length - 1) : 0
  );
  const [neighborsMounted, setNeighborsMounted] = useState(false);

  const activeItem = galleryMode ? items![currentIndex] : undefined;
  const activeSrc = activeItem ? activeItem.full : (src as string);
  const activeOrientation = activeItem ? activeItem.orientation : orientation;

  const orientationTransform = activeOrientation ? ORIENTATION_TRANSFORMS[activeOrientation] : undefined;
  const imgStyle: React.CSSProperties | undefined = orientationTransform
    ? {
        transform: orientationTransform,
        // Swap the fit box for 90°/270° rotations so the image stays within the viewport.
        ...(activeOrientation && ORIENTATION_SWAPS_AXES.has(activeOrientation)
          ? { maxWidth: '90vh', maxHeight: '90vw' }
          : {}),
      }
    : undefined;
  const overlayRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Drag state kept in refs for perf (no re-renders during drag)
  const dragging = useRef(false);
  const startY = useRef(0);
  const startX = useRef(0);
  const startTime = useRef(0);
  const currentY = useRef(0);
  const currentX = useRef(0);

  // Gallery-mode: which axis a drag has committed to, decided once movement
  // crosses AXIS_LOCK_THRESHOLD, then held for the rest of the gesture so it
  // can't flip-flop between paging and dismissing mid-drag.
  const dragAxis = useRef<'undecided' | 'horizontal' | 'vertical'>('undecided');
  const settlePageTimer = useRef<{ id: number; flush: () => void } | null>(null);

  // Zoom state
  const zoomLevel = useRef(1);
  const panX = useRef(0);
  const panY = useRef(0);
  // Pan while zoomed
  const panStartX = useRef(0);
  const panStartY = useRef(0);
  const panBaseX = useRef(0);
  const panBaseY = useRef(0);

  // Pinch-to-zoom state (touch)
  const pinching = useRef(false);
  const initialPinchDist = useRef(0);
  const initialPinchZoom = useRef(1);

  useScrollLock(true);

  // Cancels a pending page-settle timeout if Lightbox unmounts mid-swipe
  // (e.g. the reader closes it right after swiping), so it never fires
  // setState on an unmounted component.
  useEffect(() => () => {
    if (settlePageTimer.current !== null) window.clearTimeout(settlePageTimer.current.id);
  }, []);

  // Resets the track's own transform to neutral after currentIndex changes —
  // same technique GalleryCarousel.tsx uses, for the same reason: a
  // useLayoutEffect fires synchronously after the DOM reflects the new index
  // but before paint, so the reset can never land before the new image does
  // (avoiding a one-frame flash of the old image at the neutral position).
  useLayoutEffect(() => {
    if (!galleryMode) return;
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = 'none';
    track.style.transform = 'translateX(0px)';
  }, [currentIndex, galleryMode]);

  const applyZoomTransform = useCallback((animate = false) => {
    const img = imgRef.current;
    if (!img) return;
    const z = zoomLevel.current;
    const px = panX.current;
    const py = panY.current;
    img.style.transition = animate ? 'transform 0.3s cubic-bezier(.2,.8,.3,1)' : 'none';
    img.style.transform = `translate(${px}px, ${py}px) scale(${z})`;
  }, []);

  const applyTransform = useCallback((dy: number, animate = false) => {
    const img = imgRef.current;
    const overlay = overlayRef.current;
    if (!img || !overlay) return;

    const progress = Math.min(Math.abs(dy) / 300, 1);
    const scale = 1 - progress * 0.15;
    const opacity = 1 - progress * 0.8;

    img.style.transition = animate ? 'transform 0.3s cubic-bezier(.2,.8,.3,1)' : 'none';
    img.style.transform = `translateY(${dy}px) scale(${scale})`;
    overlay.style.transition = animate ? 'background 0.3s ease' : 'none';
    overlay.style.background = `rgba(0,0,0,${0.8 * opacity})`;
  }, []);

  const dismiss = useCallback((dy: number) => {
    const img = imgRef.current;
    const overlay = overlayRef.current;
    if (img && overlay) {
      const exitY = (dy < 0 ? -1 : 1) * window.innerHeight;
      img.style.transition = 'transform 0.3s cubic-bezier(.2,.8,.3,1), opacity 0.3s ease';
      img.style.transform = `translateY(${exitY}px) scale(0.8)`;
      img.style.opacity = '0';
      overlay.style.transition = 'background 0.3s ease';
      overlay.style.background = 'rgba(0,0,0,0)';
    }
    setTimeout(onClose, 300);
  }, [onClose]);

  const snapBack = useCallback(() => {
    applyTransform(0, true);
  }, [applyTransform]);

  const resetZoom = useCallback((animate = true) => {
    zoomLevel.current = 1;
    panX.current = 0;
    panY.current = 0;
    applyZoomTransform(animate);
    if (animate) {
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.style.transition = 'background 0.3s ease';
        overlay.style.background = 'rgba(0,0,0,0.8)';
      }
    }
  }, [applyZoomTransform]);

  // Block the ghost click that fires after pointerUp when the overlay unmounts.
  //
  // The trap must not outlive that one ghost click. Closing unmounts the overlay
  // synchronously, so the ghost click often never gets dispatched at all and the
  // trap is left armed — swallowing the user's next real click instead. That
  // showed up as "closing by clicking the backdrop, then clicking another
  // gallery tile, sometimes needs two clicks".
  //
  // A new interaction always opens with `pointerdown`; the ghost click never has
  // one, because its pointerdown happened before this was armed. So pointerdown
  // is an exact signal that the trap has missed its target and must stand down.
  // The timeout is only a last-resort backstop for pointer-less activation.
  const blockNextClick = useCallback(() => {
    let timer = 0;
    const disarm = () => {
      document.removeEventListener('click', blocker, true);
      document.removeEventListener('pointerdown', disarm, true);
      clearTimeout(timer);
    };
    const blocker = (e: Event) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      disarm();
    };
    document.addEventListener('click', blocker, true);
    document.addEventListener('pointerdown', disarm, true);
    timer = window.setTimeout(disarm, 400);
  }, []);

  const goPrev = useCallback(() => setCurrentIndex((i) => (i - 1 + length) % length), [length]);
  const goNext = useCallback(() => setCurrentIndex((i) => (i + 1) % length), [length]);

  // Each new item starts unzoomed, matching GalleryCarousel's per-item baseline.
  useEffect(() => {
    if (!galleryMode) return;
    resetZoom(false);
  }, [currentIndex, galleryMode, resetZoom]);

  const applyPageTransform = useCallback((dx: number, animate = false) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate ? SETTLE_TRANSITION : 'none';
    track.style.transform = `translateX(${dx}px)`;
  }, []);

  const commitPage = useCallback((direction: 'prev' | 'next') => {
    const width = window.innerWidth;
    applyPageTransform(direction === 'next' ? -width : width, true);
    const finish = () => {
      setCurrentIndex((i) => (direction === 'next' ? (i + 1) % length : (i - 1 + length) % length));
      setNeighborsMounted(false);
      settlePageTimer.current = null;
    };
    settlePageTimer.current = { id: window.setTimeout(finish, SETTLE_MS), flush: finish };
  }, [applyPageTransform, length]);

  const springBackPage = useCallback(() => {
    applyPageTransform(0, true);
    const finish = () => {
      setNeighborsMounted(false);
      settlePageTimer.current = null;
    };
    settlePageTimer.current = { id: window.setTimeout(finish, SETTLE_MS), flush: finish };
  }, [applyPageTransform]);

  const resolveDismissOrClose = useCallback((dy: number, elapsed: number) => {
    const velocity = Math.abs(dy) / Math.max(elapsed, 1);
    if (Math.abs(dy) > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      blockNextClick();
      dismiss(dy);
    } else if (Math.abs(dy) < 4) {
      blockNextClick();
      onClose();
    } else {
      snapBack();
    }
  }, [dismiss, snapBack, onClose, blockNextClick]);

  const resolvePageOrSpringBack = useCallback((dx: number, elapsed: number) => {
    const velocity = Math.abs(dx) / Math.max(elapsed, 1);
    const isSwipe = Math.abs(dx) > SWIPE_MIN_JITTER_DISTANCE
      && (Math.abs(dx) > SWIPE_DISTANCE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD);
    if (isSwipe) {
      commitPage(dx < 0 ? 'next' : 'prev');
    } else if (Math.abs(dx) < 4) {
      blockNextClick();
      onClose();
    } else {
      springBackPage();
    }
  }, [commitPage, springBackPage, blockNextClick, onClose]);

  // Escape closes; Left/Right page in gallery mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (galleryMode && length >= 2) {
        if (e.key === 'ArrowLeft') goPrev();
        else if (e.key === 'ArrowRight') goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, galleryMode, length, goPrev, goNext]);

  // Mouse wheel zoom (desktop)
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      const oldZoom = zoomLevel.current;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom + delta * oldZoom));
      zoomLevel.current = newZoom;

      if (newZoom <= 1) {
        panX.current = 0;
        panY.current = 0;
      } else {
        // Scale pan proportionally
        const ratio = newZoom / oldZoom;
        panX.current *= ratio;
        panY.current *= ratio;
      }
      applyZoomTransform();
    };

    overlay.addEventListener('wheel', onWheel, { passive: false });
    return () => overlay.removeEventListener('wheel', onWheel);
  }, [applyZoomTransform]);

  // Touch handlers for pinch-to-zoom
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    function getTouchDist(e: TouchEvent): number {
      const [a, b] = [e.touches[0], e.touches[1]];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinching.current = true;
        dragging.current = false; // cancel any single-finger drag
        initialPinchDist.current = getTouchDist(e);
        initialPinchZoom.current = zoomLevel.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinching.current) {
        e.preventDefault();
        const dist = getTouchDist(e);
        const scale = dist / initialPinchDist.current;
        zoomLevel.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, initialPinchZoom.current * scale));

        if (zoomLevel.current <= 1) {
          panX.current = 0;
          panY.current = 0;
        }

        applyZoomTransform();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (pinching.current && e.touches.length < 2) {
        pinching.current = false;
        if (zoomLevel.current <= 1) {
          resetZoom(true);
        }
      }
    };

    overlay.addEventListener('touchstart', onTouchStart, { passive: false });
    overlay.addEventListener('touchmove', onTouchMove, { passive: false });
    overlay.addEventListener('touchend', onTouchEnd);
    overlay.addEventListener('touchcancel', onTouchEnd);
    return () => {
      overlay.removeEventListener('touchstart', onTouchStart);
      overlay.removeEventListener('touchmove', onTouchMove);
      overlay.removeEventListener('touchend', onTouchEnd);
      overlay.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [applyZoomTransform, resetZoom]);

  // --- Pointer handlers (work for both mouse and touch) ---
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (pinching.current) return;
    e.preventDefault();

    const isZoomed = zoomLevel.current > 1;

    // A new gesture starting before a pending page-settle animation finished
    // flushes it immediately, same reasoning as GalleryCarousel's equivalent
    // guard: otherwise the interrupted swipe's index commit is silently
    // dropped and the track is left mid-transition.
    if (settlePageTimer.current !== null) {
      window.clearTimeout(settlePageTimer.current.id);
      settlePageTimer.current.flush();
      settlePageTimer.current = null;
    }

    dragging.current = true;
    startY.current = e.clientY;
    startX.current = e.clientX;
    startTime.current = Date.now();
    currentY.current = 0;
    currentX.current = 0;
    dragAxis.current = 'undecided';

    if (isZoomed) {
      panStartX.current = e.clientX;
      panStartY.current = e.clientY;
      panBaseX.current = panX.current;
      panBaseY.current = panY.current;
    }

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || pinching.current) return;

    const isZoomed = zoomLevel.current > 1;

    if (isZoomed) {
      // Pan when zoomed in — takes priority over paging, same as today.
      const dx = e.clientX - panStartX.current;
      const dy = e.clientY - panStartY.current;
      panX.current = panBaseX.current + dx;
      panY.current = panBaseY.current + dy;
      applyZoomTransform();
      return;
    }

    if (galleryMode && length >= 2) {
      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;

      if (dragAxis.current === 'undecided') {
        if (Math.abs(dx) > AXIS_LOCK_THRESHOLD || Math.abs(dy) > AXIS_LOCK_THRESHOLD) {
          dragAxis.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
          if (dragAxis.current === 'horizontal') setNeighborsMounted(true);
        } else {
          return; // still inside the dead zone — no transform applied yet
        }
      }

      if (dragAxis.current === 'horizontal') {
        currentX.current = dx;
        const width = window.innerWidth || 1;
        applyPageTransform(Math.max(-width, Math.min(width, dx)));
      } else {
        currentY.current = dy;
        applyTransform(dy);
      }
      return;
    }

    // Single-image mode — normal drag-to-dismiss, unchanged.
    const dy = e.clientY - startY.current;
    currentY.current = dy;
    applyTransform(dy);
  }, [applyTransform, applyZoomTransform, applyPageTransform, galleryMode, length]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;

    const isZoomed = zoomLevel.current > 1;

    if (isZoomed) {
      // Tap (no significant drag) while zoomed → close
      const dx = Math.abs(panX.current - panBaseX.current);
      const dy2 = Math.abs(panY.current - panBaseY.current);
      if (dx < 4 && dy2 < 4) {
        blockNextClick();
        onClose();
      }
      return;
    }

    const elapsed = Date.now() - startTime.current;

    if (galleryMode && length >= 2) {
      // Resolve from final release coordinates, not just refs set during
      // pointermove — a down→up with no intervening move (a fast native tap,
      // or how this codebase's own tests drive swipes) never touches
      // dragAxis, so it must still resolve correctly here.
      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;
      const axis = dragAxis.current !== 'undecided'
        ? dragAxis.current
        : (Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical');

      if (axis === 'horizontal') resolvePageOrSpringBack(dx, elapsed);
      else resolveDismissOrClose(dy, elapsed);
      return;
    }

    resolveDismissOrClose(currentY.current, elapsed);
  }, [galleryMode, length, resolvePageOrSpringBack, resolveDismissOrClose, blockNextClick, onClose]);

  // Double-click/double-tap to toggle zoom
  const lastTapTime = useRef(0);
  const handleDoubleAction = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      e.preventDefault();
      e.stopPropagation();
      if (zoomLevel.current > 1) {
        resetZoom(true);
      } else {
        zoomLevel.current = 2.5;
        panX.current = 0;
        panY.current = 0;
        applyZoomTransform(true);
      }
      lastTapTime.current = 0;
    } else {
      lastTapTime.current = now;
    }
  }, [resetZoom, applyZoomTransform]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm cursor-pointer select-none"
      style={{ background: 'rgba(0,0,0,0.8)', touchAction: 'none' }}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDoubleAction(e); }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {galleryMode && length >= 2 ? (
        <div ref={trackRef} data-testid="lightbox-track" className="relative w-screen h-screen" style={{ willChange: 'transform' }}>
          {neighborsMounted && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'translateX(-100%)' }}>
              <img src={items![(currentIndex - 1 + length) % length].full} alt="" draggable={false} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div ref={imgRef} className="relative max-w-[90vw] max-h-[90vh]" style={{ willChange: 'transform' }}>
              <img
                src={activeSrc}
                alt={alt}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
                draggable={false}
                style={imgStyle}
              />
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute -top-3 -right-3 w-8 h-8 bg-th-input border border-th-border rounded-full flex items-center justify-center text-th-text-2 hover:text-th-text hover:bg-th-elevated text-sm font-bold pointer-events-auto"
              >
                X
              </button>
            </div>
          </div>
          {neighborsMounted && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'translateX(100%)' }}>
              <img src={items![(currentIndex + 1) % length].full} alt="" draggable={false} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
            </div>
          )}
        </div>
      ) : (
        <div ref={imgRef} className="relative max-w-[90vw] max-h-[90vh]" style={{ willChange: 'transform' }}>
          <img
            src={activeSrc}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            draggable={false}
            style={imgStyle}
          />
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute -top-3 -right-3 w-8 h-8 bg-th-input border border-th-border rounded-full flex items-center justify-center text-th-text-2 hover:text-th-text hover:bg-th-elevated text-sm font-bold pointer-events-auto"
          >
            X
          </button>
        </div>
      )}

      {galleryMode && length >= 2 && (
        <>
          <button
            type="button"
            data-testid="lightbox-prev"
            aria-label="Предыдущее изображение"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-th-card/70 hover:bg-th-card flex items-center justify-center text-th-text transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            data-testid="lightbox-next"
            aria-label="Следующее изображение"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-th-card/70 hover:bg-th-card flex items-center justify-center text-th-text transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </>
      )}

      {galleryMode && length >= 2 && (
        <div
          data-testid="lightbox-indicator"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 px-2.5 py-1 sm:px-2 sm:py-0.5 rounded-full bg-th-card/70 text-lg sm:text-xs text-th-text tabular-nums"
        >
          {currentIndex + 1} / {length}
        </div>
      )}
    </div>
  );
};

export default Lightbox;
