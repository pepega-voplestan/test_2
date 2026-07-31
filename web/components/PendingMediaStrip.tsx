import React, { useRef, useState } from 'react';
import Lightbox from './Lightbox';
import { PendingItem } from '../hooks/useMediaAttachments';

/** Below this movement (px) between pointerdown and pointerup, a gesture on
 * the remove control counts as a tap rather than a scroll/drag. */
const TAP_MOVE_THRESHOLD = 6;
/** Below this scrollLeft delta (px), the strip itself wasn't being scrolled. */
const TAP_SCROLL_THRESHOLD = 2;

interface PendingMediaStripProps {
  items: PendingItem[];
  onRemove: (localId: string) => void;
  /** Hide remove controls while a submit is in flight, matching the prior isUploading behavior. */
  disabled?: boolean;
  /**
   * Cancel a `p-4` ancestor's horizontal padding (via `-mx-4`, then `px-4` to
   * keep the tiles themselves inset) so the top divider spans the full width
   * of the composer's outer box edge-to-edge, with no visible start/end.
   * ShoutInput's form has its own `p-4`; the reply composer's form has none
   * to cancel, so it's already flush without this.
   */
  edgeToEdge?: boolean;
}

/**
 * Shared pending-attachment preview for both composers (feature 006, 2026-07-30
 * revision). Spans the full width of the composer as a single Discord-style
 * horizontally-scrolling row (FR-038/FR-039), separated from the rest of the
 * composer by one thin top divider only — no side/bottom borders or box
 * chrome. Each item renders in a uniform 80×80 square tile (FR-040) regardless
 * of its own aspect ratio — a thin or short image is letterboxed rather than
 * cropped or stretched, with the gaps filled by `th-page` (the darkest surface
 * token, applied as the page's own background — see index.html). Each tile has
 * a remove control (FR-024) and a click-to-fullscreen preview reusing the
 * existing Lightbox on the item's local, not-yet-uploaded object URL (FR-037).
 *
 * The remove button is deliberately on an *outer* wrapper that has no
 * `overflow-hidden` — only the inner image/video wrapper clips content for the
 * letterbox effect. Putting overflow-hidden on the same element as the button
 * would clip the button itself, since it's positioned partly outside the tile
 * via negative offsets.
 *
 * Video is excluded from the click-to-Lightbox behavior: published video
 * attachments never open in Lightbox either (they render as a native <video
 * controls> element), so pending video tiles stay consistent with that.
 *
 * The remove control's clickable area (2026-07-31 revision, Phase 7) is 44×44
 * — the standard mobile touch-target minimum — even though its *visible*
 * circle stays the original 24×24 (an inner span), since FR-040 requires the
 * control's own visible size not shrink. Removal fires on `pointerup` rather
 * than `click`: on a strip that's still coasting from a scroll fling, a tap
 * that lands on the control can be consumed by the browser purely to halt the
 * scroll, without synthesizing a `click` — `pointerup` still fires in that
 * case. A movement/scroll-delta check (`TAP_MOVE_THRESHOLD`/
 * `TAP_SCROLL_THRESHOLD`) distinguishes a genuine tap from a drag that
 * happened to start on the button. Keyboard activation (Enter/Space) has no
 * real pointer coordinates, so it's handled separately via `onClick` gated on
 * `event.detail === 0` (the signal a browser uses for a non-pointer click) to
 * avoid double-firing on real pointer taps.
 */
const PendingMediaStrip: React.FC<PendingMediaStripProps> = ({ items, onRemove, disabled, edgeToEdge }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; scrollLeft: number } | null>(null);

  if (items.length === 0) return null;

  const handleRemovePointerDown = (e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, scrollLeft: stripRef.current?.scrollLeft ?? 0 };
  };

  const handleRemovePointerUp = (e: React.PointerEvent, localId: string) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const movedX = Math.abs(e.clientX - start.x);
    const scrolled = Math.abs((stripRef.current?.scrollLeft ?? 0) - start.scrollLeft);
    if (movedX > TAP_MOVE_THRESHOLD || scrolled > TAP_SCROLL_THRESHOLD) return;
    onRemove(localId);
  };

  return (
    <div
      ref={stripRef}
      className={`mt-3 pt-3 border-t border-th-border flex gap-2 overflow-x-auto ${edgeToEdge ? '-mx-4 px-4' : ''}`}
    >
      {items.map((it, idx) => (
        <div key={it.localId} className="relative shrink-0 w-20 h-20">
          <div className="w-full h-full bg-th-page rounded border border-th-border overflow-hidden">
            {it.isVideo ? (
              <video
                src={it.previewUrl}
                className="w-full h-full object-contain"
                muted
                preload="metadata"
              />
            ) : (
              <img
                src={it.previewUrl}
                alt="preview"
                className="w-full h-full object-contain cursor-pointer"
                onClick={() => setOpenIndex(idx)}
              />
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              aria-label="Удалить"
              onPointerDown={handleRemovePointerDown}
              onPointerUp={(e) => handleRemovePointerUp(e, it.localId)}
              onClick={(e) => {
                if (e.detail === 0) onRemove(it.localId);
              }}
              style={{ touchAction: 'manipulation' }}
              className="absolute -top-2 -right-2 w-11 h-11 flex items-center justify-center"
            >
              <span className="w-6 h-6 bg-th-input border border-th-border rounded-full flex items-center justify-center text-th-text-2 hover:text-th-text hover:bg-th-elevated text-xs pointer-events-none">
                X
              </span>
            </button>
          )}
        </div>
      ))}
      {openIndex !== null && !items[openIndex].isVideo && (
        <Lightbox src={items[openIndex].previewUrl} onClose={() => setOpenIndex(null)} />
      )}
    </div>
  );
};

export default PendingMediaStrip;
