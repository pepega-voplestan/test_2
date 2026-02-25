import React, { useState, useRef, useCallback } from 'react';

interface AvatarUploadProps {
  currentAvatar: string;
  onFileSelected: (file: File, previewUrl: string) => void;
  onFileCleared: () => void;
  pendingPreview: string | null;
  disabled?: boolean;
  externalError?: string | null;
}

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const GIF_TYPES = new Set(['image/gif']);
const ACCEPT_STR = '.jpg,.jpeg,.png,.webp';

export default function AvatarUpload({ currentAvatar, onFileSelected, onFileCleared, pendingPreview, disabled, externalError }: AvatarUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const displayError = error || externalError || null;
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((file: File): string | null => {
    if (GIF_TYPES.has(file.type)) {
      return 'GIF не поддерживается для аватара. Используйте JPG, PNG или WebP';
    }
    if (!ACCEPTED.has(file.type)) {
      return 'Неподдерживаемый формат файла. Допустимые форматы: JPG, PNG, WebP';
    }
    if (file.size > MAX_SIZE) {
      return 'Файл слишком большой (макс. 2 МБ)';
    }
    return null;
  }, []);

  const processFile = useCallback((file: File) => {
    setError(null);

    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Create local preview and pass file to parent
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewUrl = e.target?.result as string;
      if (previewUrl) {
        // Validate min resolution via an Image element
        const img = new Image();
        img.onload = () => {
          if (img.width < 256 || img.height < 256) {
            setError('Минимальное разрешение: 256×256');
            return;
          }
          onFileSelected(file, previewUrl);
        };
        img.onerror = () => {
          setError('Не удалось прочитать изображение');
        };
        img.src = previewUrl;
      }
    };
    reader.readAsDataURL(file);
  }, [validate, onFileSelected]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [disabled, processFile]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const displaySrc = pendingPreview || currentAvatar;
  const hasPending = !!pendingPreview;

  return (
    <div className="space-y-2">
      <div className="text-xs text-th-text-3 mb-1">Аватар</div>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={[
          'relative flex items-center gap-4 rounded-lg border-2 border-dashed p-4 transition-colors',
          hasPending
            ? 'border-green-500/50 bg-green-500/5'
            : dragOver
            ? 'border-sky-500 bg-sky-500/5'
            : 'border-th-border hover:border-th-text-3',
          disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer',
        ].join(' ')}
        onClick={() => !disabled && fileRef.current?.click()}
      >
        {/* Current / preview avatar */}
        <div className={`w-16 h-16 rounded-full overflow-hidden bg-th-input shrink-0 ring-2 ${hasPending ? 'ring-green-500/50' : 'ring-th-border'}`}>
          {displaySrc ? (
            <img src={displaySrc} alt="Аватар" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-th-text-4 text-xl font-bold">?</div>
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-th-text-2">
            {hasPending
              ? 'Новый аватар выбран'
              : dragOver
              ? 'Отпустите файл'
              : 'Перетащите изображение или нажмите для выбора'}
          </div>
          <div className="text-xs mt-1">
            {hasPending ? (
              <span className="text-green-400">Будет применён после сохранения</span>
            ) : (
              <span className="text-th-text-4">JPG, PNG, WebP · до 2 МБ · мин. 256×256</span>
            )}
          </div>
        </div>

        {/* Clear button or upload icon */}
        {hasPending ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFileCleared();
              setError(null);
            }}
            className="text-th-text-3 hover:text-th-text text-lg shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-th-ring/10 transition-colors"
            title="Отменить выбор"
          >
            ✕
          </button>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-th-text-4 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_STR}
        onChange={onFileChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Error */}
      {displayError && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {displayError}
        </div>
      )}
    </div>
  );
}
