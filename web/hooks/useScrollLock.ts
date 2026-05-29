import { useEffect } from 'react';

/**
 * iOS-safe body scroll lock.
 *
 * `overflow: hidden` on <body> does NOT prevent scrolling on iOS Safari.
 * Instead we pin the body with `position: fixed` offset by the current
 * scroll position, then restore on unlock.
 *
 * Supports nested locks (multiple modals) via a reference counter —
 * only the outermost lock/unlock actually touches the DOM.
 */

let lockCount = 0;
let savedScrollY = 0;
let savedPaddingRight = '';
let unlockTimer: ReturnType<typeof setTimeout> | null = null;

function lock() {
  // Cancel any pending unlock so StrictMode's unlock→re-lock cycle never touches the DOM
  if (unlockTimer !== null) {
    clearTimeout(unlockTimer);
    unlockTimer = null;
  }

  lockCount++;
  if (lockCount !== 1) return;

  savedScrollY = window.scrollY;
  savedPaddingRight = document.body.style.paddingRight;

  // Compensate for scrollbar disappearing (prevents layout shift on desktop)
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.paddingRight = `${scrollbarWidth}px`;
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount !== 0) return;

  // Defer DOM restore by one tick — if lock() fires again immediately (React
  // StrictMode double-invoke), the timer is cancelled and the DOM is never touched.
  unlockTimer = setTimeout(() => {
    unlockTimer = null;
    if (lockCount !== 0) return;

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.paddingRight = savedPaddingRight;

    window.scrollTo(0, savedScrollY);
  }, 0);
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lock();
    return () => unlock();
  }, [active]);
}
