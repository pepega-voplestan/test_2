import React, { useState } from 'react';
import Lightbox from './Lightbox';
import { PendingItem } from '../hooks/useMediaAttachments';

interface PendingMediaStripProps {
  items: PendingItem[];
  onRemove: (localId: string) => void;
  /** Hide remove controls while a submit is in flight, matching the prior isUploading behavior. */
  disabled?: boolean;
}

/**
 * Shared pending-attachment preview for both composers (feature 006, 2026-07-30
 * revision). Renders every pending item in one bordered, horizontally-scrolling
 * row (FR-038/FR-039) at a unified 80px size (FR-040), with a per-item remove
 * control (FR-024) and a click-to-fullscreen preview reusing the existing
 * Lightbox on the item's local, not-yet-uploaded object URL (FR-037).
 *
 * Video is excluded from the click-to-Lightbox behavior: published video
 * attachments never open in Lightbox either (they render as a native <video
 * controls> element), so pending video tiles stay consistent with that.
 */
const PendingMediaStrip: React.FC<PendingMediaStripProps> = ({ items, onRemove, disabled }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <div className="mt-3 flex gap-2 overflow-x-auto border border-th-border rounded-lg p-2">
      {items.map((it, idx) => (
        <div key={it.localId} className="relative shrink-0">
          {it.isVideo ? (
            <video
              src={it.previewUrl}
              className="max-h-20 rounded border border-th-border"
              muted
              preload="metadata"
            />
          ) : (
            <img
              src={it.previewUrl}
              alt="preview"
              className="max-h-20 rounded border border-th-border cursor-pointer"
              onClick={() => setOpenIndex(idx)}
            />
          )}
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
