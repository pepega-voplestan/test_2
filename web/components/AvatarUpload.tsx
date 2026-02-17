import React, { useState, useRef, useCallback } from 'react';

interface AvatarUploadProps {
  currentAvatar: string;
  onUploaded: (avatarUrl: string) => void;
  disabled?: boolean;
}

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPT_STR = '.jpg,.jpeg,.png,.webp';

export default function AvatarUpload({ currentAvatar, onUploaded, disabled }: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((file: File): string | null => {
    if (!ACCEPTED.includes(file.type)) {
      return 'Допустимые форматы: JPG, PNG, WebP';
    }
    if (file.size > MAX_SIZE) {
      return 'Файл слишком большой (макс. 2 МБ)';
    }
    return null;
  }, []);

  const processFile = useCallback(async (file: File) => {
    setError(null);

    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Show local preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Upload
    setUploading(true);
    try {
      const form = new FormData();
      form.append('avatar', file);

      const res = await fetch('/api/upload/avatar', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Ошибка ${res.status}`);
      }

      const data = await res.json();
      console.log('[AvatarUpload] Upload success:', data.avatar);
      setPreview(null);
      onUploaded(data.avatar);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки';
      console.error('[AvatarUpload] Upload error:', msg);
      setError(msg);
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }, [validate, onUploaded]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset so the same file can be selected again
    e.target.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [disabled, uploading, processFile]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !uploading) setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const displaySrc = preview || currentAvatar;

  return (
    <div className="space-y-2">
      <div className="text-xs text-zinc-400 mb-1">Аватар</div>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={[
          'relative flex items-center gap-4 rounded-lg border-2 border-dashed p-4 transition-colors',
          dragOver
            ? 'border-sky-500 bg-sky-500/5'
            : 'border-zinc-700 hover:border-zinc-500',
          disabled || uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer',
        ].join(' ')}
        onClick={() => !disabled && !uploading && fileRef.current?.click()}
      >
        {/* Current / preview avatar */}
        <div className="w-16 h-16 rounded-full overflow-hidden bg-zinc-800 shrink-0 ring-2 ring-zinc-700">
          {displaySrc ? (
            <img src={displaySrc} alt="Аватар" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xl font-bold">?</div>
          )}
          {uploading && (
            <div className="absolute inset-0 w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-300">
            {uploading
              ? 'Загрузка...'
              : dragOver
              ? 'Отпустите файл'
              : 'Перетащите изображение или нажмите для выбора'}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            JPG, PNG, WebP · до 2 МБ · мин. 256×256
          </div>
        </div>

        {/* Upload icon */}
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-zinc-500 shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_STR}
        onChange={onFileChange}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
