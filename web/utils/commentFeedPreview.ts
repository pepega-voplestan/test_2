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
 * Keeps ||spoilers|| and @[name:id] for InlineSpoiler / mention render;
 * trailing media URLs dropped — attachments use MEDIA_LABEL.
 * Truncates by visible length without cutting mid-spoiler / mid-mention.
 */
export function previewText(content: string): string {
  const raw = String(content || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /\s*https?:\/\/(?:www\.)?(?:youtube\.com\/watch\S*|youtu\.be\/\S*|imgur\.com\/\S*)\s*$/i,
      '',
    )
    .trim();
  if (!raw || raw === '…' || raw === '...') return '';

  const MAX = 180;
  let visible = 0;
  let out = '';
  let i = 0;
  while (i < raw.length) {
    if (raw.startsWith('||', i)) {
      const end = raw.indexOf('||', i + 2);
      if (end !== -1) {
        const token = raw.slice(i, end + 2);
        const innerVis = token
          .slice(2, -2)
          .replace(/@\[([^\]:]+):[^\]]+\]/g, '@$1').length;
        if (visible > 0 && visible + Math.max(innerVis, 1) > MAX) {
          out += '…';
          break;
        }
        out += token;
        visible += Math.max(innerVis, 1);
        i = end + 2;
        continue;
      }
    }

    if (raw[i] === '@' && raw[i + 1] === '[') {
      const close = raw.indexOf(']', i + 2);
      if (close !== -1) {
        const token = raw.slice(i, close + 1);
        const name = token.slice(2, -1).split(':')[0];
        const vis = 1 + (name || '').length;
        if (visible > 0 && visible + vis > MAX) {
          out += '…';
          break;
        }
        out += token;
        visible += vis;
        i = close + 1;
        continue;
      }
    }

    if (visible >= MAX) {
      out += '…';
      break;
    }
    out += raw[i];
    visible += 1;
    i += 1;
  }
  return out;
}

export function hasAttachment(
  media?: ShoutMedia | null,
  gallery?: GalleryItem[] | null,
): boolean {
  if (media) return true;
  return Array.isArray(gallery) && gallery.length > 0;
}
