import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import EmojiPicker from './EmojiPicker';

interface ShoutInputProps {
  onShoutCreated: () => void;
}

const SHOUT_MAX_LENGTH = 280;
const MEDIA_MAX_MB = 5;

const YT_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
];

function detectYouTubeId(text: string): string | null {
  for (const p of YT_PATTERNS) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

const ShoutInput: React.FC<ShoutInputProps> = ({ onShoutCreated }) => {
  const { user, openModal } = useAuth();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Media state
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // YouTube auto-detection
  const [detectedYtId, setDetectedYtId] = useState<string | null>(null);

  const charCount = content.length;
  const isOverLimit = charCount > SHOUT_MAX_LENGTH;
  const hasMedia = !!mediaId || !!detectedYtId;
  const canSubmit = (content.trim() || hasMedia) && !isOverLimit && !isSubmitting && !isUploading;

  // Auto-resize textarea
  const resizeTextarea = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
  };

  useEffect(resizeTextarea, [content]);

  // Detect YouTube URLs in content (only when no image is attached)
  useEffect(() => {
    if (mediaId) {
      setDetectedYtId(null);
      return;
    }
    const id = detectYouTubeId(content);
    setDetectedYtId(id);
  }, [content, mediaId]);

  // Shared file upload logic
  const uploadFile = async (file: File) => {
    if (file.size > MEDIA_MAX_MB * 1024 * 1024) {
      setError(`Файл слишком большой (макс. ${MEDIA_MAX_MB} МБ)`);
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Допустимые форматы: JPG, PNG, WebP');
      return;
    }

    setError(null);
    setIsUploading(true);

    const localUrl = URL.createObjectURL(file);
    setMediaPreview(localUrl);

    try {
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
      setMediaId(data.mediaId);
      setMediaPreview(data.urls.thumb);
      URL.revokeObjectURL(localUrl);
      console.log('[ShoutInput] Media uploaded:', data.mediaId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки';
      console.error('[ShoutInput] Upload error:', msg);
      setError(msg);
      setMediaPreview(null);
      URL.revokeObjectURL(localUrl);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await uploadFile(file);
  };

  // Drag-and-drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    if (mediaId || isUploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const removeMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaId(null);
    setMediaPreview(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !user) return;

    setIsSubmitting(true);
    setError(null);
    console.log('[ShoutInput] Submitting:', content.substring(0, 50), mediaId ? `media=${mediaId}` : detectedYtId ? `yt=${detectedYtId}` : '');

    try {
      const body: Record<string, string> = { content: content.trim() };
      if (mediaId) {
        body.mediaId = mediaId;
      } else if (detectedYtId) {
        const ytMatch = content.match(/https?:\/\/[^\s]+/);
        if (ytMatch) body.youtubeUrl = ytMatch[0];
      }

      const res = await fetch('/api/v1/shouts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Ошибка ${res.status}`);
      }

      console.log('[ShoutInput] Shout created successfully');
      setContent('');
      setMediaId(null);
      setMediaPreview(null);
      setDetectedYtId(null);
      setError(null);
      onShoutCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось отправить вопль';
      console.error('[ShoutInput] Error:', msg);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mb-6">
      <form
        onSubmit={handleSubmit}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`bg-[#1e1e1e] rounded-lg p-4 shadow-sm border transition-colors ${isDragging ? 'border-[#0087ff] bg-[#0087ff]/5' : 'border-zinc-800/50'}`}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="flex items-center justify-center py-6 text-[#0087ff] text-sm font-medium pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
            Отпустите для загрузки изображения
          </div>
        )}

        {!isDragging && (
          <>
            <div className="flex gap-4">
              <div className="shrink-0">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
                  {user ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-[#0087ff]" viewBox="0 0 40 40" fill="currentColor">
                          <path fillRule="evenodd" clipRule="evenodd" d="M20 38C29.9411 38 38 29.9411 38 20C38 10.0589 29.9411 2 20 2C10.0589 2 2 10.0589 2 20C2 29.9411 10.0589 38 20 38ZM20 40C31.0457 40 40 31.0457 40 20C40 8.9543 31.0457 0 20 0C8.9543 0 0 8.9543 0 20C0 31.0457 8.9543 40 20 40ZM20 23C23.3137 23 26 20.3137 26 17C26 13.6863 23.3137 11 20 11C16.6863 11 14 13.6863 14 17C14 20.3137 16.6863 23 20 23ZM20 25C24.4183 25 28 21.4183 28 17C28 12.5817 24.4183 9 20 9C15.5817 9 12 12.5817 12 17C12 21.4183 15.5817 25 20 25ZM16 29C15.4477 29 15 29.4477 15 30C15 30.5523 15.4477 31 16 31H23C23.5523 31 24 30.5523 24 30C24 29.4477 23.5523 29 23 29H16Z"></path>
                      </svg>
                  )}
                </div>
              </div>
              <div className="grow flex flex-col">
                {user ? (
                    <div className="flex flex-col w-full gap-2">
                        <textarea
                            ref={textareaRef}
                            placeholder="Расскажите, что нового?"
                            className="bg-transparent w-full border-none outline-none text-white placeholder-zinc-500 resize-none overflow-hidden"
                            rows={1}
                            value={content}
                            onChange={(e) => { setContent(e.target.value); setError(null); }}
                            disabled={isSubmitting}
                            maxLength={SHOUT_MAX_LENGTH + 50}
                        />
                        <div className="flex items-center gap-2 justify-end">
                          <EmojiPicker onSelect={(emoji) => setContent(prev => prev + emoji)} />
                          {/* Image upload button */}
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading || !!mediaId}
                            className={`shrink-0 p-1 transition-colors ${mediaId ? 'text-[#0087ff]' : 'text-zinc-500 hover:text-zinc-300'} disabled:opacity-40`}
                            title={mediaId ? 'Изображение прикреплено' : 'Прикрепить изображение (или перетащите)'}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={handleFileSelect}
                          />
                          {(content.trim() || hasMedia) && (
                              <>
                                <span className={`text-xs whitespace-nowrap ${isOverLimit ? 'text-red-400 font-semibold' : charCount > SHOUT_MAX_LENGTH * 0.9 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                                  {charCount}/{SHOUT_MAX_LENGTH}
                                </span>
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className="text-[#0087ff] hover:text-blue-400 text-sm font-bold whitespace-nowrap disabled:opacity-50"
                                >
                                    {isSubmitting ? '...' : 'Отправить'}
                                </button>
                              </>
                          )}
                        </div>
                    </div>
                ) : (
                    <div className="text-zinc-400 text-sm">
                        Чтобы оставить Вопль, <button type="button" onClick={openModal} className="text-white hover:underline font-medium">Войдите</button> или <button type="button" onClick={openModal} className="text-white hover:underline font-medium">Зарегистрируйтесь</button>
                    </div>
                )}
              </div>
            </div>

            {/* Image preview */}
            {mediaPreview && (
              <div className="mt-3 ml-14 relative inline-block">
                <img src={mediaPreview} alt="preview" className="max-h-40 rounded-lg border border-zinc-700" />
                {isUploading && (
                  <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                {!isUploading && (
                  <button
                    type="button"
                    onClick={removeMedia}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700 text-xs"
                  >
                    X
                  </button>
                )}
              </div>
            )}

            {/* YouTube auto-detect preview */}
            {!mediaId && detectedYtId && (
              <div className="mt-3 ml-14 flex items-center gap-3 bg-zinc-900/50 rounded-lg p-2 border border-zinc-800">
                <img
                  src={`https://img.youtube.com/vi/${detectedYtId}/default.jpg`}
                  alt="YouTube"
                  className="w-20 h-15 rounded object-cover shrink-0"
                />
                <div className="text-xs text-zinc-400">
                  YouTube видео будет встроено в вопль
                </div>
              </div>
            )}
          </>
        )}
      </form>
      {error && (
        <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
};

export default ShoutInput;
