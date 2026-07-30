import React, { useState } from 'react';
import Lightbox from './Lightbox';
import { PendingItem } from '../hooks/useMediaAttachments';

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
 */
const PendingMediaStrip: React.FC<PendingMediaStripProps> = ({ items, onRemove, disabled, edgeToEdge }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <div
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
              onClick={() => onRemove(it.localId)}
              className="absolute -top-2 -right-2 w-6 h-6 bg-th-input border border-th-border rounded-full flex items-center justify-center text-th-text-2 hover:text-th-text hover:bg-th-elevated text-xs"
            >
              X
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
