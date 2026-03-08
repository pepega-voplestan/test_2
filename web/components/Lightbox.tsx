import React, { useEffect, useRef, useCallback } from 'react';

interface LightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const DISMISS_THRESHOLD = 120; // px of drag needed to dismiss
const VELOCITY_THRESHOLD = 0.5; // px/ms — fast flick dismisses even if threshold not met
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

const Lightbox: React.FC<LightboxProps> = ({ src, alt = 'attachment', onClose }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  // Drag state kept in refs for perf (no re-renders during drag)
  const dragging = useRef(false);
  const startY = useRef(0);
  const startX = useRef(0);
  const startTime = useRef(0);
  const currentY = useRef(0);

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

  // Scroll lock
  useEffect(() => {
    const scrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  // Block the ghost click that fires after pointerUp when the overlay unmounts
  const blockNextClick = useCallback(() => {
    const blocker = (e: Event) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      document.removeEventListener('click', blocker, true);
    };
    document.addEventListener('click', blocker, true);
    setTimeout(() => document.removeEventListener('click', blocker, true), 400);
  }, []);

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

    dragging.current = true;
    startY.current = e.clientY;
    startX.current = e.clientX;
    startTime.current = Date.now();
    currentY.current = 0;

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
      // Pan when zoomed in
      const dx = e.clientX - panStartX.current;
      const dy = e.clientY - panStartY.current;
      panX.current = panBaseX.current + dx;
      panY.current = panBaseY.current + dy;
      applyZoomTransform();
    } else {
      // Normal drag-to-dismiss
      const dy = e.clientY - startY.current;
      currentY.current = dy;
      applyTransform(dy);
    }
  }, [applyTransform, applyZoomTransform]);

  const onPointerUp = useCallback(() => {
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

    const dy = currentY.current;
    const elapsed = Date.now() - startTime.current;
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
      <div ref={imgRef} className="relative max-w-[90vw] max-h-[90vh]" style={{ willChange: 'transform' }}>
        <img
          src={src}
          alt={alt}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          draggable={false}
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
  );
};

export default Lightbox;
