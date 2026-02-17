import React, { useState, useEffect, useRef } from 'react';
import { Shout } from '../types';
import { useAuth } from '../context/AuthContext';

interface ShoutCardProps {
  shout: Shout;
  isReply?: boolean;
  showMedia?: boolean;
  onReplyAdded?: (shoutId: string, reply: Shout) => void;
  parentShoutId?: string;
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

// Render text content with clickable links and @mentions, preserving whitespace
function renderContent(text: string) {
  // Split by whitespace while preserving the whitespace tokens
  const tokens = text.split(/(\s+)/);
  return tokens.map((token, i) => {
    // Whitespace tokens — preserve as-is
    if (/^\s+$/.test(token)) {
      return token;
    }
    // URL tokens
    if (/^https?:\/\//.test(token)) {
      return (
        <a key={i} href={token} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">
          {token}
        </a>
      );
    }
    // @mentions
    if (token.startsWith('@')) {
      return <span key={i} className="text-sky-500">{token}</span>;
    }
    return token;
  });
}

const ShoutCard: React.FC<ShoutCardProps> = ({ shout, isReply = false, showMedia = true, onReplyAdded, parentShoutId }) => {
  const { user, openModal } = useAuth();
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [ytLoaded, setYtLoaded] = useState(false);

  // Reply media state
  const [replyMediaId, setReplyMediaId] = useState<string | null>(null);
  const [replyMediaPreview, setReplyMediaPreview] = useState<string | null>(null);
  const [isReplyUploading, setIsReplyUploading] = useState(false);
  const [replyDetectedYtId, setReplyDetectedYtId] = useState<string | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  // Like state — synced from props when they change
  const [likes, setLikes] = useState(shout.likes);
  const [isLiked, setIsLiked] = useState(
    user && shout.likedBy ? shout.likedBy.includes(user.id) : false
  );

  // Sync like state when props change (e.g. after feed re-fetch)
  useEffect(() => {
    setLikes(shout.likes);
    setIsLiked(user && shout.likedBy ? shout.likedBy.includes(user.id) : false);
  }, [shout.likes, shout.likedBy, user]);

  const hasReplies = shout.replies && shout.replies.length > 0;
  const replyCount = shout.replies ? shout.replies.length : 0;

  const replyCharCount = replyContent.length;
  const isReplyOverLimit = replyCharCount > SHOUT_MAX_LENGTH;

  const replyHasMedia = !!replyMediaId || !!replyDetectedYtId;
  const canSubmitReply = (replyContent.trim() || replyHasMedia) && !isReplyOverLimit && !isSubmittingReply && !isReplyUploading;

  // Detect YouTube URLs in reply content (only when no image attached)
  useEffect(() => {
    if (replyMediaId) {
      setReplyDetectedYtId(null);
      return;
    }
    const id = detectYouTubeId(replyContent);
    setReplyDetectedYtId(id);
  }, [replyContent, replyMediaId]);

  const toggleReplies = () => {
    setRepliesOpen(!repliesOpen);
  };

  const handleReplyClick = () => {
    if (!user) {
      openModal();
      return;
    }
    if (!repliesOpen) {
      setRepliesOpen(true);
    } else if (!hasReplies) {
      setRepliesOpen(false);
    }
  };

  const handleReplyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > MEDIA_MAX_MB * 1024 * 1024) {
      setReplyError(`Файл слишком большой (макс. ${MEDIA_MAX_MB} МБ)`);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setReplyError('Допустимые форматы: JPG, PNG, WebP');
      return;
    }

    setReplyError(null);
    setIsReplyUploading(true);
    const localUrl = URL.createObjectURL(file);
    setReplyMediaPreview(localUrl);

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
      setReplyMediaId(data.mediaId);
      setReplyMediaPreview(data.urls.thumb);
      URL.revokeObjectURL(localUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки';
      setReplyError(msg);
      setReplyMediaPreview(null);
      URL.revokeObjectURL(localUrl);
    } finally {
      setIsReplyUploading(false);
    }
  };

  const removeReplyMedia = () => {
    if (replyMediaPreview) URL.revokeObjectURL(replyMediaPreview);
    setReplyMediaId(null);
    setReplyMediaPreview(null);
    setReplyError(null);
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitReply || !user) return;

    const targetId = parentShoutId || shout.id;
    setIsSubmittingReply(true);
    setReplyError(null);
    console.log(`[ShoutCard] Submitting reply to shout ${targetId}`);

    try {
      const body: Record<string, string> = { content: replyContent.trim() };
      if (replyMediaId) {
        body.mediaId = replyMediaId;
      } else if (replyDetectedYtId) {
        const ytMatch = replyContent.match(/https?:\/\/[^\s]+/);
        if (ytMatch) body.youtubeUrl = ytMatch[0];
      }

      const res = await fetch(`/api/v1/shouts/${targetId}/replies`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Ошибка ${res.status}`);
      }

      const data = await res.json();
      console.log(`[ShoutCard] Reply posted: ${data.id}`);

      const newReply: Shout = {
        id: data.id,
        user: { id: user.id, name: user.name, avatar: user.avatar },
        content: replyContent.trim(),
        timestamp: new Date().toISOString(),
        likes: 0,
        likedBy: [],
        replies: [],
        ...(data.media ? { media: data.media } : {}),
      };

      setReplyContent('');
      setReplyMediaId(null);
      setReplyMediaPreview(null);
      setReplyDetectedYtId(null);
      setReplyError(null);

      if (onReplyAdded) {
        onReplyAdded(targetId, newReply);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось отправить ответ';
      console.error('[ShoutCard] Reply error:', msg);
      setReplyError(msg);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleLike = async () => {
    if (!user) {
      openModal();
      return;
    }

    // Optimistic update
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikes(prev => newIsLiked ? prev + 1 : Math.max(0, prev - 1));

    console.log(`[ShoutCard] Toggling like on ${shout.id}, optimistic: isLiked=${newIsLiked}`);

    try {
      const res = await fetch(`/api/v1/shouts/${shout.id}/like`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!res.ok) {
        setIsLiked(!newIsLiked);
        setLikes(prev => newIsLiked ? prev - 1 : prev + 1);
        console.error('[ShoutCard] Like failed, reverted');
        return;
      }

      const data = await res.json();
      setLikes(data.likes);
      setIsLiked(data.isLiked);
      console.log(`[ShoutCard] Like confirmed: ${data.likes} likes, isLiked=${data.isLiked}`);
    } catch (err) {
      setIsLiked(!newIsLiked);
      setLikes(prev => newIsLiked ? prev - 1 : prev + 1);
      console.error('[ShoutCard] Like network error, reverted:', err);
    }
  };

  // Format timestamp — show relative time for ISO strings
  const formatTimestamp = (ts: string): string => {
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) return ts;
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'только что';
      if (diffMin < 60) return `${diffMin} ${getDeclension(diffMin, 'минуту', 'минуты', 'минут')} назад`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours} ${getDeclension(diffHours, 'час', 'часа', 'часов')} назад`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} ${getDeclension(diffDays, 'день', 'дня', 'дней')} назад`;
    } catch {
      return ts;
    }
  };

  return (
    <div className={`flex flex-col mb-4 ${isReply ? 'mt-4 border-l-2 border-zinc-800 pl-4' : ''}`}>
      <div className="flex gap-4">
        {/* Avatar */}
        <a href={`#/profile/${shout.user.id}`} className="shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 hover:ring-2 hover:ring-zinc-600 transition-all">
            {shout.user.avatar ? (
              <img
                  src={shout.user.avatar}
                  alt={shout.user.name}
                  className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm font-bold">
                {shout.user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </a>

        {/* Content */}
        <div className="grow min-w-0">
          {/* Header */}
          <div className="flex items-baseline gap-2 mb-1">
            <a href={`#/profile/${shout.user.id}`} className={`font-bold text-sm hover:underline ${shout.user.isBanned ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
              {shout.user.name}
            </a>
            <span className="text-xs text-zinc-500">{formatTimestamp(shout.timestamp)}</span>
          </div>

          {/* Body Text */}
          {shout.content && (
            <div className="text-zinc-300 text-[15px] leading-relaxed break-words whitespace-pre-wrap mb-3">
               {renderContent(shout.content)}
            </div>
          )}

          {/* Image attachment — smaller thumbnail, click opens lightbox */}
          {showMedia && shout.media?.type === 'image' && (
             <div className="mb-3 rounded-lg overflow-hidden max-w-[300px]">
                 <img
                   src={shout.media.url}
                   alt="attachment"
                   loading="lazy"
                   onClick={() => setLightboxOpen(true)}
                   className="w-full cursor-pointer max-h-[300px] object-cover hover:opacity-90 transition-opacity"
                 />
             </div>
          )}

          {/* Lightbox modal for full-size image */}
          {lightboxOpen && shout.media?.type === 'image' && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
              onClick={() => setLightboxOpen(false)}
            >
              <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <img
                  src={shout.media.full}
                  alt="attachment"
                  className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
                />
                <button
                  onClick={() => setLightboxOpen(false)}
                  className="absolute -top-3 -right-3 w-8 h-8 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700 text-sm font-bold"
                >
                  X
                </button>
              </div>
            </div>
          )}

          {/* YouTube embed — Discord-style with title inside the box */}
          {showMedia && shout.media?.type === 'youtube' && (
              <div className="mb-3 max-w-[400px] rounded-lg overflow-hidden bg-[#2b2d31] border border-zinc-700/50">
                <div
                  className="w-full aspect-video bg-black relative cursor-pointer"
                  onClick={() => !ytLoaded && setYtLoaded(true)}
                >
                    {ytLoaded ? (
                      <iframe
                        className="w-full h-full"
                        src={`${shout.media.embedUrl}?autoplay=1`}
                        title={shout.media.title || "YouTube"}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        sandbox="allow-scripts allow-same-origin allow-presentation"
                      />
                    ) : (
                      <>
                        <img
                          src={`https://img.youtube.com/vi/${shout.media.videoId}/hqdefault.jpg`}
                          alt={shout.media.title || "YouTube video"}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-14 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg hover:bg-red-500 transition-colors">
                            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white ml-0.5" fill="currentColor">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          </div>
                        </div>
                      </>
                    )}
                </div>
                {(shout.media.title || shout.media.channel) && (
                  <div className="px-3 py-2">
                    {shout.media.title && (
                      <div className="text-sm text-zinc-200 font-medium leading-snug line-clamp-2">{shout.media.title}</div>
                    )}
                    {shout.media.channel && (
                      <div className="text-xs text-zinc-400 mt-0.5">{shout.media.channel}</div>
                    )}
                  </div>
                )}
              </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 select-none mt-2">
            <div className="flex items-center gap-4">
                {!isReply && (
                  <button
                      onClick={handleReplyClick}
                      className={`hover:text-zinc-300 transition-colors ${repliesOpen ? 'text-white' : ''}`}
                  >
                      Ответить
                  </button>
                )}
                {!isReply && hasReplies ? (
                    <button
                        onClick={toggleReplies}
                        className={`transition-colors ${repliesOpen ? 'text-white' : 'hover:text-zinc-300'}`}
                    >
                        {repliesOpen ? 'Закрыть' : `${replyCount} ${getReplyDeclension(replyCount)}`}
                    </button>
                ) : !isReply ? (
                    <span className="opacity-50 cursor-default">0 ответов</span>
                ) : null}
            </div>

            <div className="flex items-center">
                <button
                    onClick={handleLike}
                    className={`flex items-center gap-1 transition-transform active:scale-95 ${isLiked ? 'text-[#ffdd00]' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title={isLiked ? "Убрать лайк" : "Нравится"}
                >
                    <span className="text-xs font-bold">{likes}</span>
                    <span className="text-base leading-none">{'\uD83E\uDD18'}</span>
                </button>
            </div>
          </div>
        </div>
      </div>

      {/* Nested Replies — textbox always visible when thread is open */}
      {!isReply && repliesOpen && (
        <div className="ml-10 mt-2">
           {hasReplies && shout.replies!.map(reply => (
               <ShoutCard
                 key={reply.id}
                 shout={reply}
                 isReply={true}
                 showMedia={showMedia}
                 onReplyAdded={onReplyAdded}
                 parentShoutId={shout.id}
               />
           ))}

           {/* Reply Input — always visible when thread is open */}
           {user && (
             <div className="mt-4">
               <div className="bg-[#1e1e1e] p-3 rounded flex gap-3">
                 <div className="w-8 h-8 bg-zinc-700 rounded-full shrink-0 flex items-center justify-center overflow-hidden">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      )}
                 </div>
                  <form className="w-full flex flex-col gap-2" onSubmit={handleReplySubmit}>
                      <div className="flex gap-2 items-center">
                        <input
                            type="text"
                            placeholder="Напишите ответ..."
                            className="bg-transparent border-none outline-none text-white text-sm w-full placeholder-zinc-600"
                            value={replyContent}
                            onChange={(e) => { setReplyContent(e.target.value); setReplyError(null); }}
                            disabled={isSubmittingReply}
                            maxLength={SHOUT_MAX_LENGTH + 50}
                        />
                        {/* Image upload button for replies */}
                        <button
                          type="button"
                          onClick={() => replyFileInputRef.current?.click()}
                          disabled={isReplyUploading || !!replyMediaId}
                          className={`shrink-0 p-0.5 transition-colors ${replyMediaId ? 'text-[#0087ff]' : 'text-zinc-500 hover:text-zinc-300'} disabled:opacity-40`}
                          title={replyMediaId ? 'Изображение прикреплено' : 'Прикрепить изображение'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <input
                          ref={replyFileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={handleReplyFileSelect}
                        />
                        {(replyContent.trim() || replyHasMedia) && (
                          <span className={`text-xs whitespace-nowrap ${isReplyOverLimit ? 'text-red-400 font-semibold' : replyCharCount > SHOUT_MAX_LENGTH * 0.9 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                            {replyCharCount}/{SHOUT_MAX_LENGTH}
                          </span>
                        )}
                        <button
                          type="submit"
                          disabled={!canSubmitReply}
                          className="text-[#0087ff] hover:text-blue-400 text-sm font-medium disabled:opacity-30"
                        >
                            {isSubmittingReply ? '...' : 'Отправить'}
                        </button>
                      </div>

                      {/* Reply media preview */}
                      {replyMediaPreview && (
                        <div className="relative inline-block mt-1">
                          <img src={replyMediaPreview} alt="preview" className="max-h-24 rounded border border-zinc-700" />
                          {isReplyUploading && (
                            <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
                              <div className="w-4 h-4 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                            </div>
                          )}
                          {!isReplyUploading && (
                            <button
                              type="button"
                              onClick={removeReplyMedia}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700 text-[10px]"
                            >
                              X
                            </button>
                          )}
                        </div>
                      )}

                      {/* Reply YouTube auto-detect preview */}
                      {!replyMediaId && replyDetectedYtId && (
                        <div className="flex items-center gap-2 mt-1 bg-zinc-900/50 rounded p-1.5 border border-zinc-800">
                          <img
                            src={`https://img.youtube.com/vi/${replyDetectedYtId}/default.jpg`}
                            alt="YouTube"
                            className="w-14 h-10 rounded object-cover shrink-0"
                          />
                          <div className="text-[10px] text-zinc-400">YouTube видео</div>
                        </div>
                      )}
                  </form>
               </div>
               {replyError && (
                 <div className="mt-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                   {replyError}
                 </div>
               )}
             </div>
           )}
        </div>
      )}
    </div>
  );
};

// Helper for Russian pluralization (replies)
function getReplyDeclension(count: number): string {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'ответов';
    if (lastDigit === 1) return 'ответ';
    if (lastDigit >= 2 && lastDigit <= 4) return 'ответа';
    return 'ответов';
}

// Generic Russian pluralization helper
function getDeclension(count: number, one: string, few: string, many: string): string {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return many;
    if (lastDigit === 1) return one;
    if (lastDigit >= 2 && lastDigit <= 4) return few;
    return many;
}

export default ShoutCard;
