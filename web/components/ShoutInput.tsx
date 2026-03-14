import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import EmojiPicker from './EmojiPicker';
import MentionInput, { MentionInputHandle, effectiveLength } from './MentionInput';
import { Shout } from '../types';

interface ShoutInputProps {
  onShoutCreated: (shout: Shout) => void;
}

const SHOUT_MAX_LENGTH = 400;
const NEWLINE_CHAR_COST = 40;
const MEDIA_MAX_MB = 10;

const YT_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
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
  const [mediaIsVideo, setMediaIsVideo] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionInputRef = useRef<MentionInputHandle>(null);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // YouTube auto-detection
  const [detectedYtId, setDetectedYtId] = useState<string | null>(null);

  // Content flag — mutually exclusive: only one tag per shout
  type ContentTag = 'spoiler' | 'nsfw' | 'politics' | null;
  const [activeTag, setActiveTag] = useState<ContentTag>(null);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const isSpoiler = activeTag === 'spoiler';
  const isNsfw = activeTag === 'nsfw';
  const isPolitics = activeTag === 'politics';

  // Close tag menu on outside click
  useEffect(() => {
    if (!tagMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) setTagMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tagMenuOpen]);

  const selectTag = useCallback((tag: ContentTag) => {
    setActiveTag(prev => prev === tag ? null : tag);
    setTagMenuOpen(false);
  }, []);

  const charCount = effectiveLength(content, NEWLINE_CHAR_COST);
  const isOverLimit = charCount > SHOUT_MAX_LENGTH;
  const hasMedia = !!mediaId || !!detectedYtId;
  const canSubmit = (content.trim() || hasMedia) && !isOverLimit && !isSubmitting && !isUploading;

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

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'].includes(file.type)) {
      setError('Допустимые форматы: JPG, PNG, WebP, GIF, MP4');
      return;
    }

    setError(null);
    setIsUploading(true);
    const isVideo = file.type === 'video/mp4';
    setMediaIsVideo(isVideo);

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
      if (!isVideo) {
        setMediaPreview(data.urls.thumb);
        URL.revokeObjectURL(localUrl);
      }
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
    setMediaIsVideo(false);
    setError(null);
    // NSFW and СПОЙЛЕР only make sense with media — clear them
    if (activeTag === 'nsfw' || activeTag === 'spoiler') setActiveTag(null);
  };

  const submitShout = async () => {
    if (!canSubmit || !user) return;

    setIsSubmitting(true);
    setError(null);
    console.log('[ShoutInput] Submitting:', content.substring(0, 50), mediaId ? `media=${mediaId}` : detectedYtId ? `yt=${detectedYtId}` : '');

    try {
      const body: Record<string, unknown> = { content: content.trim() };
      if (mediaId) {
        body.mediaId = mediaId;
      } else if (detectedYtId) {
        const ytMatch = content.match(/https?:\/\/[^\s]+/);
        if (ytMatch) body.youtubeUrl = ytMatch[0];
      }
      if (activeTag) body.visibilityTag = activeTag;

      const res = await fetch('/api/v1/shouts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || `Ошибка ${res.status}`);
      }

      console.log('[ShoutInput] Shout created successfully');
      mentionInputRef.current?.clear(); // also calls onContentChange('') → setContent('')
      setMediaId(null);
      setMediaPreview(null);
      setDetectedYtId(null);
      setError(null);
      setActiveTag(null);
      onShoutCreated(result.shout as Shout);
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
        onSubmit={(e) => { e.preventDefault(); submitShout(); }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`bg-th-card rounded-lg p-4 shadow-sm border transition-colors ${isDragging ? 'border-[#0087ff] bg-[#0087ff]/5' : 'border-th-border-2/50'}`}
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
                <div className="w-10 h-10 rounded-full bg-th-input flex items-center justify-center overflow-hidden">
                  {user ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-[#0087ff]" viewBox="0 0 40 40" fill="currentColor">
                          <path fillRule="evenodd" clipRule="evenodd" d="M20 38C29.9411 38 38 29.9411 38 20C38 10.0589 29.9411 2 20 2C10.0589 2 2 10.0589 2 20C2 29.9411 10.0589 38 20 38ZM20 40C31.0457 40 40 31.0457 40 20C40 8.9543 31.0457 0 20 0C8.9543 0 0 8.9543 0 20C0 31.0457 8.9543 40 20 40ZM20 23C23.3137 23 26 20.3137 26 17C26 13.6863 23.3137 11 20 11C16.6863 11 14 13.6863 14 17C14 20.3137 16.6863 23 20 23ZM20 25C24.4183 25 28 21.4183 28 17C28 12.5817 24.4183 9 20 9C15.5817 9 12 12.5817 12 17C12 21.4183 15.5817 25 20 25ZM16 29C15.4477 29 15 29.4477 15 30C15 30.5523 15.4477 31 16 31H23C23.5523 31 24 30.5523 24 30C24 29.4477 23.5523 29 23 29H16Z"></path>
                      </svg>
                  )}
                </div>
              </div>
              <div className="grow flex flex-col min-w-0">
                {user ? (
                    <div className="flex flex-col w-full gap-2">
                        <MentionInput
                            ref={mentionInputRef}
                            placeholder="Расскажите, что нового?"
                            disabled={isSubmitting}
                            onContentChange={(text) => { setContent(text); setError(null); }}
                            onSubmit={submitShout}
                            onImagePaste={async (file) => {
                              if (!mediaId && !isUploading) await uploadFile(file);
                            }}
                            size="md"
                        />
                        <div className="flex items-center gap-2 justify-end flex-wrap">
                          <div className="flex items-center gap-1 shrink-0">
                            <EmojiPicker onSelect={(emoji) => mentionInputRef.current?.insertText(emoji)} />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploading || !!mediaId}
                              className={`p-1 transition-colors ${mediaId ? 'text-[#0087ff]' : 'text-th-text-4 hover:text-th-text-2'} disabled:opacity-40`}
                              title={mediaId ? 'Изображение прикреплено' : 'Прикрепить изображение (или перетащите)'}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => mentionInputRef.current?.wrapSpoiler()}
                              className="p-1 text-th-text-4 hover:text-th-text-2 transition-colors"
                              title="Спойлер (||текст||)"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                              </svg>
                            </button>
                            <div className="relative" ref={tagMenuRef}>
                              <button
                                type="button"
                                onClick={() => setTagMenuOpen(o => !o)}
                                className={`p-1 transition-colors rounded ${activeTag ? (isSpoiler ? 'text-amber-400' : isNsfw ? 'text-red-400' : 'text-blue-400') : 'text-th-text-4 hover:text-th-text-2'}`}
                                title="Тег контента"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
                              </button>
                              {tagMenuOpen && (
                                <div className="absolute right-0 bottom-full mb-2 w-52 bg-th-card border border-th-border rounded-xl shadow-lg z-50 overflow-hidden">
                                  <div className="px-3 py-2 text-[10px] font-bold text-th-text-4 uppercase tracking-wider border-b border-th-border-2">Тег контента</div>
                                  <button
                                    type="button"
                                    onClick={() => hasMedia && selectTag('spoiler')}
                                    className={`flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors ${!hasMedia ? 'opacity-30 cursor-not-allowed' : isSpoiler ? 'bg-amber-500/10' : 'hover:bg-th-elevated/50'}`}
                                  >
                                    <span className={`text-xs font-bold ${isSpoiler ? 'text-amber-400' : 'text-th-text-3'}`}>СПОЙЛЕР</span>
                                    <span className="text-[10px] text-th-text-4">{hasMedia ? '' : 'нужно медиа'}</span>
                                    {isSpoiler && <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-amber-400 ml-auto" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => hasMedia && selectTag('nsfw')}
                                    className={`flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors ${!hasMedia ? 'opacity-30 cursor-not-allowed' : isNsfw ? 'bg-red-500/10' : 'hover:bg-th-elevated/50'}`}
                                  >
                                    <span className={`text-xs font-bold ${isNsfw ? 'text-red-400' : 'text-th-text-3'}`}>NSFW</span>
                                    <span className="text-[10px] text-th-text-4">{hasMedia ? '18+' : 'нужно медиа'}</span>
                                    {isNsfw && <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-400 ml-auto" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => selectTag('politics')}
                                    className={`flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors ${isPolitics ? 'bg-blue-500/10' : 'hover:bg-th-elevated/50'}`}
                                  >
                                    <span className={`text-xs font-bold ${isPolitics ? 'text-blue-400' : 'text-th-text-3'}`}>ПОЛИТИКА</span>
                                    {isPolitics && <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-blue-400 ml-auto" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
                            className="hidden"
                            onChange={handleFileSelect}
                          />
                          {(content.trim() || hasMedia) && (
                              <>
                                <span className={`text-xs whitespace-nowrap ${isOverLimit ? 'text-red-400 font-semibold' : charCount > SHOUT_MAX_LENGTH * 0.9 ? 'text-yellow-400' : 'text-th-text-4'}`}>
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
                    <div className="text-th-text-3 text-sm">
                        Чтобы оставить Вопль, <button type="button" onClick={openModal} className="text-th-text hover:underline font-medium">Войдите</button> или <button type="button" onClick={openModal} className="text-th-text hover:underline font-medium">Зарегистрируйтесь</button>
                    </div>
                )}
              </div>
            </div>

            {/* Media preview */}
            {mediaPreview && (
              <div className="mt-3 ml-14 relative inline-block">
                {mediaIsVideo ? (
                  <video src={mediaPreview} className="max-h-40 rounded-lg border border-th-border" muted />
                ) : (
                  <img src={mediaPreview} alt="preview" className="max-h-40 rounded-lg border border-th-border" />
                )}
                {isUploading && (
                  <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-th-text-4 border-t-th-text rounded-full animate-spin" />
                  </div>
                )}
                {!isUploading && (
                  <button
                    type="button"
                    onClick={removeMedia}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-th-input border border-th-border rounded-full flex items-center justify-center text-th-text-2 hover:text-th-text hover:bg-th-elevated text-xs"
                  >
                    X
                  </button>
                )}
              </div>
            )}

            {/* YouTube auto-detect preview */}
            {!mediaId && detectedYtId && (
              <div className="mt-3 ml-14 flex items-center gap-3 bg-th-inset/50 rounded-lg p-2 border border-th-border-2">
                <img
                  src={`https://img.youtube.com/vi/${detectedYtId}/default.jpg`}
                  alt="YouTube"
                  className="w-20 h-15 rounded object-cover shrink-0"
                />
                <div className="text-xs text-th-text-3">
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
