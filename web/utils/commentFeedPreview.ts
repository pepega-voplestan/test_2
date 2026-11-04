import type { GalleryItem, ShoutMedia } from '../types';

export const MEDIA_LABEL = '[медиа]';

/** Drop legacy stubs that are not real shout preview text. */
export function sanitizeShoutPreviewText(text: unknown): string {
  const t = String(text || '').trim();
  if (!t || t === MEDIA_LABEL || t === '(пусто)' || t === '…' || t === '...') return '';
  return t;
}

/**
 * Compact one-line text for shout quote strip.
 * Unwrap spoilers, flatten mentions to @name, trim trailing embed URLs.
 */
export function previewText(content: string): string {
  const raw = String(content || '')
    .replace(/@\[[^\]]+:[^\]]+\]/g, (m) => {
      const name = m.slice(2, -1).split(':')[0];
      return name ? `@${name}` : '@…';
    })
    .replace(/\|\|([\s\S]*?)\|\|/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /\s*https?:\/\/(?:www\.)?(?:youtube\.com\/watch\S*|youtu\.be\/\S*|imgur\.com\/\S*)\s*$/i,
      '',
    )
    .trim();
  if (!raw || raw === '…' || raw === '...') return '';
  if (raw.length > 180) return `${raw.slice(0, 177).trimEnd()}…`;
  return raw;
}

export function hasAttachment(
  media?: ShoutMedia | null,
  gallery?: GalleryItem[] | null,
): boolean {
  if (media) return true;
  return Array.isArray(gallery) && gallery.length > 0;
}
