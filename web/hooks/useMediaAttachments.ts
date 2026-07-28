import { useCallback, useRef, useState } from 'react';
import { pluralize, FILE_FORMS } from '../utils/plural';

/**
 * Shared media-attachment state for BOTH composers (feature 006).
 *
 * There are two composers in this app — `ShoutInput.tsx` (shouts) and the reply
 * composer inside `ShoutCard.tsx` (comments) — and FR-031 requires them to behave
 * identically. Rather than implement the pending list, capacity gate and upload
 * orchestration twice and keep them in sync across three rollout stages, both
 * consume this hook.
 *
 * Stage 1 is deliberately APPEND-ONLY: items can be added or the whole selection
 * cleared, but individual items cannot be removed or reordered until Stage 3
 * (FR-024/FR-025). Do not add `removeAt`/`reorder` here before then.
 */

export const GALLERY_MAX_ITEMS = 5;
export const MEDIA_MAX_MB = 10;

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_MIME = 'video/mp4';
const ALLOWED_MIME = [...IMAGE_MIME, VIDEO_MIME];

export interface PendingItem {
  mediaId: string;
  /** Thumbnail URL for the composer preview. */
  previewUrl: string;
  isVideo: boolean;
  isGif: boolean;
  /** Object URL that still needs revoking, if any. */
  objectUrl?: string;
}

export interface FileFailure {
  name: string;
  message: string;
}

interface Options {
  /** `user.mediaAllowed` — false blocks NEW uploads (feature 005). */
  mediaAllowed?: boolean;
  logPrefix?: string;
}

const isVideoFile = (f: File) => f.type === VIDEO_MIME;

export function useMediaAttachments({ mediaAllowed, logPrefix = 'Media' }: Options = {}) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [failures, setFailures] = useState<FileFailure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // Read synchronously inside addFiles so rapid successive drops can't race past
  // the capacity gate using a stale `items` closure.
  const itemsRef = useRef<PendingItem[]>([]);
  itemsRef.current = items;

  const hasVideo = items.some((i) => i.isVideo);
  const hasGif = items.some((i) => i.isGif);
  const hasImages = items.some((i) => !i.isVideo && !i.isGif);
  const capacityLeft = hasVideo ? 0 : GALLERY_MAX_ITEMS - items.length;

  const clear = useCallback(() => {
    setItems((prev) => {
      prev.forEach((i) => i.objectUrl && URL.revokeObjectURL(i.objectUrl));
      return [];
    });
    setFailures([]);
    setError(null);
  }, []);

  /** Attach media that already exists server-side (GIF picker, "Мои GIF"). Never gated by mediaAllowed. */
  const addExisting = useCallback(
    (item: { mediaId: string; previewUrl: string; isGif?: boolean }) => {
      setError(null);
      setItems((prev) => {
        if (prev.length >= GALLERY_MAX_ITEMS || prev.some((i) => i.isVideo)) return prev;
        if (prev.some((i) => i.mediaId === item.mediaId)) return prev;
        return [...prev, { ...item, isVideo: false, isGif: item.isGif ?? true }];
      });
    },
    []
  );

  const uploadOne = useCallback(async (file: File): Promise<PendingItem> => {
    const objectUrl = URL.createObjectURL(file);
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/v1/upload/media', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      URL.revokeObjectURL(objectUrl);
      throw new Error(data.error || `Ошибка ${res.status}`);
    }

    const data = await res.json();
    const isVideo = isVideoFile(file);
    if (!isVideo && data.urls?.thumb) {
      URL.revokeObjectURL(objectUrl);
      return {
        mediaId: data.mediaId,
        previewUrl: data.urls.thumb,
        isVideo: false,
        isGif: file.type === 'image/gif',
      };
    }
    return {
      mediaId: data.mediaId,
      previewUrl: objectUrl,
      objectUrl,
      isVideo,
      isGif: file.type === 'image/gif',
    };
  }, []);

  /**
   * Add files from a multi-select or a drop.
   *
   * FR-033: if the action would exceed the 5-item cap, the ENTIRE action is
   * rejected — nothing is uploaded and the existing selection is untouched.
   * The count is knowable up front, so nothing has been stored yet at this point;
   * this is what makes "attach nothing" literally true rather than leaving
   * orphaned files on disk.
   *
   * FR-034: once past the gate, each file uploads independently. Successes are
   * kept and each failure is reported by name — the opposite resolution from the
   * over-capacity case, because these failures only surface mid-flight.
   */
  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setError(null);
      setFailures([]);

      if (mediaAllowed === false) {
        setError('Вам запрещено прикреплять медиафайлы');
        return;
      }

      const current = itemsRef.current;

      if (current.some((i) => i.isVideo)) {
        setError('Видео нельзя совмещать с другими файлами');
        return;
      }

      // FR-028: a lone video with nothing attached keeps today's single-attachment
      // path. In any other combination video is not gallery-eligible.
      const loneVideo = files.length === 1 && isVideoFile(files[0]) && current.length === 0;

      // FR-033 capacity gate — before any upload begins.
      if (!loneVideo && current.length + files.length > GALLERY_MAX_ITEMS) {
        setError(
          `Можно прикрепить не более ${pluralize(GALLERY_MAX_ITEMS, FILE_FORMS)}`
        );
        return;
      }

      const accepted: File[] = [];
      const rejected: FileFailure[] = [];

      for (const file of files) {
        if (!ALLOWED_MIME.includes(file.type)) {
          rejected.push({ name: file.name, message: 'Недопустимый формат' });
        } else if (isVideoFile(file) && !loneVideo) {
          rejected.push({ name: file.name, message: 'Видео нельзя добавить в галерею' });
        } else if (file.size > MEDIA_MAX_MB * 1024 * 1024) {
          rejected.push({ name: file.name, message: `Больше ${MEDIA_MAX_MB} МБ` });
        } else {
          accepted.push(file);
        }
      }

      if (accepted.length === 0) {
        setFailures(rejected);
        return;
      }

      setIsUploading(true);
      try {
        // Concurrent, but reassembled into selection order below.
        const results = await Promise.allSettled(accepted.map((f) => uploadOne(f)));

        const uploaded: PendingItem[] = [];
        results.forEach((r, idx) => {
          if (r.status === 'fulfilled') {
            uploaded.push(r.value);
          } else {
            rejected.push({
              name: accepted[idx].name,
              message: r.reason instanceof Error ? r.reason.message : 'Ошибка загрузки',
            });
          }
        });

        if (uploaded.length > 0) {
          // Re-check capacity: a concurrent drop could have landed while awaiting.
          setItems((prev) => [...prev, ...uploaded].slice(0, GALLERY_MAX_ITEMS));
        }
        setFailures(rejected);
        if (uploaded.length > 0) {
          console.log(`[${logPrefix}] Attached ${uploaded.length} item(s)`);
        }
      } finally {
        setIsUploading(false);
      }
    },
    [mediaAllowed, uploadOne, logPrefix]
  );

  return {
    items,
    mediaIds: items.map((i) => i.mediaId),
    failures,
    error,
    setError,
    isUploading,
    addFiles,
    addExisting,
    clear,
    capacityLeft,
    hasMedia: items.length > 0,
    hasVideo,
    hasGif,
    hasImages,
    isFull: items.length >= GALLERY_MAX_ITEMS,
  };
}
