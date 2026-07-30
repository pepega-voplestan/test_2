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
 * 2026-07-30 revision (research D14): a selected/dropped file is held
 * client-side only — nothing is uploaded to the server until `submit()` is
 * called. `submit()` uploads every pending file in parallel (research D15) and
 * is atomic: it returns the ordered `mediaIds` only if every upload succeeded,
 * or `null` if any failed, in which case nothing should be created. A retry
 * (calling `submit()` again) never re-uploads a pending item that already
 * obtained a `mediaId` on a prior attempt (research D16). Per-item removal
 * (FR-024) is available now — it is a pure client-state mutation with no
 * network call, since nothing has been uploaded yet.
 */

export const GALLERY_MAX_ITEMS = 5;
export const MEDIA_MAX_MB = 10;
/** Set as `error` specifically when `submit()` fails atomically (FR-041) — composers use this to know when to show a "Try again" action rather than a plain error. */
export const SUBMIT_FAILED_MESSAGE = 'Не удалось отправить. Попробуйте ещё раз';

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_MIME = 'video/mp4';
const ALLOWED_MIME = [...IMAGE_MIME, VIDEO_MIME];

let localIdCounter = 0;
const makeLocalId = () => `pending-${Date.now()}-${localIdCounter++}`;

export interface PendingItem {
  localId: string;
  /** The raw file, held until a successful upload. Absent for `addExisting` items (already stored server-side). */
  file?: File;
  /** Set once this item has been uploaded (or immediately, for `addExisting` items). */
  mediaId?: string;
  /** Local object URL preview for a not-yet-uploaded file, or the server URL for an `addExisting` item. */
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
  // Read synchronously so rapid successive drops/submits can't race past a
  // stale `items` closure.
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

  /** Remove one pending item, without affecting the others (FR-024). Pure client-state — nothing has been uploaded yet, so there is nothing to reconcile server-side. */
  const removeItem = useCallback((localId: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.localId === localId);
      if (target?.objectUrl) URL.revokeObjectURL(target.objectUrl);
      return prev.filter((i) => i.localId !== localId);
    });
  }, []);

  /** Attach media that already exists server-side (GIF picker, "Мои GIF"). Never gated by mediaAllowed. */
  const addExisting = useCallback(
    (item: { mediaId: string; previewUrl: string; isGif?: boolean }) => {
      setError(null);
      setItems((prev) => {
        if (prev.length >= GALLERY_MAX_ITEMS || prev.some((i) => i.isVideo)) return prev;
        if (prev.some((i) => i.mediaId === item.mediaId)) return prev;
        return [
          ...prev,
          {
            localId: makeLocalId(),
            mediaId: item.mediaId,
            previewUrl: item.previewUrl,
            isVideo: false,
            isGif: item.isGif ?? true,
          },
        ];
      });
    },
    []
  );

  const uploadOne = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/v1/upload/media', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Ошибка ${res.status}`);
    }

    const data = await res.json();
    return data.mediaId as string;
  }, []);

  /**
   * Add files from a multi-select or a drop. Purely client-side: validates
   * type/size and the capacity gate, then holds accepted files as pending
   * items with a local object-URL preview. Nothing is uploaded here — see
   * `submit()`.
   *
   * FR-033: if the action would exceed the 5-item cap, the ENTIRE action is
   * rejected — the existing selection is untouched. The count is knowable up
   * front, so nothing has been stored anywhere at this point.
   *
   * FR-034 (narrowed 2026-07-30): only client-checkable failures (wrong type,
   * oversized) are handled here, and remain partial — accepted files become
   * pending, each rejected file is reported by name. Upload-transfer failures
   * no longer happen at this point; see `submit()` for the now-atomic
   * submit-time failure handling.
   */
  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
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

      // FR-033 capacity gate.
      if (!loneVideo && current.length + files.length > GALLERY_MAX_ITEMS) {
        setError(
          `Можно прикрепить не более ${pluralize(GALLERY_MAX_ITEMS, FILE_FORMS)}`
        );
        return;
      }

      const accepted: PendingItem[] = [];
      const rejected: FileFailure[] = [];

      for (const file of files) {
        if (!ALLOWED_MIME.includes(file.type)) {
          rejected.push({ name: file.name, message: 'Недопустимый формат' });
        } else if (isVideoFile(file) && !loneVideo) {
          rejected.push({ name: file.name, message: 'Видео нельзя добавить в галерею' });
        } else if (file.size > MEDIA_MAX_MB * 1024 * 1024) {
          rejected.push({ name: file.name, message: `Больше ${MEDIA_MAX_MB} МБ` });
        } else {
          const objectUrl = URL.createObjectURL(file);
          accepted.push({
            localId: makeLocalId(),
            file,
            previewUrl: objectUrl,
            objectUrl,
            isVideo: isVideoFile(file),
            isGif: file.type === 'image/gif',
          });
        }
      }

      if (accepted.length > 0) {
        setItems((prev) => [...prev, ...accepted].slice(0, GALLERY_MAX_ITEMS));
        console.log(`[${logPrefix}] ${accepted.length} item(s) pending`);
      }
      setFailures(rejected);
    },
    [mediaAllowed, logPrefix]
  );

  /**
   * Upload every pending item that doesn't have a `mediaId` yet, in parallel
   * (research D15), and report whether the whole batch succeeded (FR-041).
   *
   * Atomic: returns `{ mediaIds }` in pending order only if every upload
   * succeeds. On any failure, returns `null` — callers MUST NOT create the
   * shout/comment in that case. Every pending item that DID succeed keeps its
   * obtained `mediaId` in state regardless of the overall outcome, so calling
   * `submit()` again (a "Try again") never re-uploads it (research D16).
   */
  const submit = useCallback(async (): Promise<{ mediaIds: string[] } | null> => {
    const current = itemsRef.current;
    if (current.length === 0) return { mediaIds: [] };

    setError(null);
    setFailures([]);
    setIsUploading(true);
    try {
      const toUpload = current.filter((i) => !i.mediaId && i.file);

      const results = await Promise.all(
        toUpload.map(async (item) => {
          try {
            const mediaId = await uploadOne(item.file as File);
            return { localId: item.localId, mediaId, error: null as string | null };
          } catch (e) {
            return {
              localId: item.localId,
              mediaId: null as string | null,
              error: e instanceof Error ? e.message : 'Ошибка загрузки',
            };
          }
        })
      );

      // Persist any obtained mediaIds immediately, regardless of whether this
      // attempt as a whole succeeds — this is what makes a retry skip them.
      if (results.length > 0) {
        setItems((prev) =>
          prev.map((it) => {
            const r = results.find((res) => res.localId === it.localId);
            return r?.mediaId ? { ...it, mediaId: r.mediaId } : it;
          })
        );
      }

      const failed = results.filter((r) => r.error);
      if (failed.length > 0) {
        setFailures(
          failed.map((f) => {
            const item = toUpload.find((i) => i.localId === f.localId);
            return { name: item?.file?.name ?? '', message: f.error as string };
          })
        );
        setError(SUBMIT_FAILED_MESSAGE);
        return null;
      }

      const mediaIds = current.map((it) => {
        if (it.mediaId) return it.mediaId;
        const r = results.find((res) => res.localId === it.localId);
        return r?.mediaId as string;
      });
      return { mediaIds };
    } finally {
      setIsUploading(false);
    }
  }, [uploadOne]);

  return {
    items,
    failures,
    error,
    setError,
    isUploading,
    addFiles,
    addExisting,
    removeItem,
    submit,
    clear,
    capacityLeft,
    hasMedia: items.length > 0,
    hasVideo,
    hasGif,
    hasImages,
    isFull: items.length >= GALLERY_MAX_ITEMS,
  };
}
