import React, { useEffect, useRef, useCallback } from 'react';

interface LightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const DISMISS_THRESHOLD = 120; // px of drag needed to dismiss
const VELOCITY_THRESHOLD = 0.5; // px/ms — fast flick dismisses even if threshold not met

const Lightbox: React.FC<LightboxProps> = ({ src, alt = 'attachment', onClose }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  // Drag state kept in refs for perf (no re-renders during drag)
  const dragging = useRef(false);
  const startY = useRef(0);
  const startTime = useRef(0);
  const currentY = useRef(0);

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

  // --- Pointer handlers (work for both mouse and touch) ---
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); // prevent browser from synthesizing click from touch
    dragging.current = true;
    startY.current = e.clientY;
    startTime.current = Date.now();
    currentY.current = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dy = e.clientY - startY.current;
    currentY.current = dy;
    applyTransform(dy);
  }, [applyTransform]);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
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

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm cursor-pointer select-none"
      style={{ background: 'rgba(0,0,0,0.8)', touchAction: 'none' }}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
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
