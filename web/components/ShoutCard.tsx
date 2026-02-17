import React, { useState, useEffect, useRef } from 'react';
import { Shout, Comment } from '../types';
import { useAuth } from '../context/AuthContext';
import EmojiPicker from './EmojiPicker';

interface ShoutCardProps {
  shout: Shout;
  showMedia?: boolean;
  onCommentAdded?: (shoutId: string, comment: Comment) => void;
  onDelete?: (shoutId: string) => void;
  onCommentDeleted?: (shoutId: string, commentId: string) => void;
  isThreadOpen?: boolean;
  onThreadToggle?: (shoutId: string) => void;
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

function renderContent(text: string) {
  const tokens = text.split(/(\s+)/);
  return tokens.map((token, i) => {
    if (/^\s+$/.test(token)) return token;
    if (/^https?:\/\//.test(token)) {
      return <a key={i} href={token} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">{token}</a>;
    }
    if (token.startsWith('@')) {
      return <span key={i} className="text-sky-500">{token}</span>;
    }
    return token;
  });
}

/* ---------- Comment card (separate entity) ---------- */

interface CommentCardProps {
  comment: Comment;
  showMedia?: boolean;
  onDelete?: (commentId: string) => void;
}

const CommentCard: React.FC<CommentCardProps> = ({ comment, showMedia = true, onDelete }) => {
  const { user, openModal } = useAuth();
  const [likes, setLikes] = useState(comment.likes);
  const [isLiked, setIsLiked] = useState(
    user && comment.likedBy ? comment.likedBy.includes(user.id) : false
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [ytLoaded, setYtLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isOwner = user && user.id === comment.user.id;

  useEffect(() => {
    setLikes(comment.likes);
    setIsLiked(user && comment.likedBy ? comment.likedBy.includes(user.id) : false);
  }, [comment.likes, comment.likedBy, user]);

  const handleLike = async () => {
    if (!user) { openModal(); return; }
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikes(prev => newIsLiked ? prev + 1 : Math.max(0, prev - 1));
    try {
      const res = await fetch(`/api/v1/comments/${comment.id}/like`, { method: 'POST', credentials: 'include' });
      if (!res.ok) { setIsLiked(!newIsLiked); setLikes(prev => newIsLiked ? prev - 1 : prev + 1); return; }
      const data = await res.json();
      setLikes(data.likes); setIsLiked(data.isLiked);
    } catch { setIsLiked(!newIsLiked); setLikes(prev => newIsLiked ? prev - 1 : prev + 1); }
  };

  const handleDelete = async () => {
    if (!user || !isOwner) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/comments/${comment.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `Ошибка ${res.status}`); }
      setConfirmDelete(false);
      if (onDelete) onDelete(comment.id);
    } catch (err: unknown) {
      console.error('[CommentCard] Delete error:', err);
      setConfirmDelete(false);
    } finally { setIsDeleting(false); }
  };

  return (
    <div className="flex flex-col mt-4 border-l-2 border-zinc-800 pl-4">
      <div className="flex gap-3">
        <a href={`#/profile/${comment.user.id}`} className="shrink-0">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 hover:ring-2 hover:ring-zinc-600 transition-all">
            {comment.user.avatar ? (
              <img src={comment.user.avatar} alt={comment.user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs font-bold">
                {comment.user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </a>

        <div className="grow min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <a href={`#/profile/${comment.user.id}`} className={`font-bold text-xs hover:underline ${comment.user.isBanned ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
              {comment.user.name}
            </a>
            <span className="text-[10px] text-zinc-500">{formatTimestamp(comment.timestamp)}</span>
            {isOwner && (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-zinc-600 hover:text-red-400 transition-colors ml-auto" title="Удалить">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {comment.content && (
            <div className="text-zinc-300 text-sm leading-relaxed break-words whitespace-pre-wrap mb-2">
              {renderContent(comment.content)}
            </div>
          )}

          {showMedia && comment.media?.type === 'image' && (
            <div className="mb-2 rounded-lg overflow-hidden">
              <img
                src={comment.media.url} alt="attachment" loading="lazy"
                onClick={() => setLightboxOpen(true)}
                className="w-full cursor-pointer max-h-[200px] object-cover hover:opacity-90 transition-opacity rounded-lg"
              />
            </div>
          )}

          {lightboxOpen && comment.media?.type === 'image' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer" onClick={() => setLightboxOpen(false)}>
              <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <img src={comment.media.full} alt="attachment" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
                <button onClick={() => setLightboxOpen(false)} className="absolute -top-3 -right-3 w-8 h-8 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700 text-sm font-bold">X</button>
              </div>
            </div>
          )}

          {showMedia && comment.media?.type === 'youtube' && (
            <div className="mb-2 rounded-lg overflow-hidden bg-[#2b2d31] border border-zinc-700/50">
              <div className="w-full aspect-video bg-black relative cursor-pointer" onClick={() => !ytLoaded && setYtLoaded(true)}>
                {ytLoaded ? (
                  <iframe className="w-full h-full" src={`${comment.media.embedUrl}?autoplay=1`} title={comment.media.title || "YouTube"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                    sandbox="allow-scripts allow-same-origin allow-presentation" />
                ) : (
                  <>
                    <img src={`https://img.youtube.com/vi/${comment.media.videoId}/hqdefault.jpg`} alt={comment.media.title || "YouTube video"} loading="lazy" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-8 bg-red-600 rounded-xl flex items-center justify-center shadow-lg hover:bg-red-500 transition-colors">
                        <svg viewBox="0 0 24 24" className="w-5 h-5 text-white ml-0.5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {(comment.media.title || comment.media.channel) && (
                <div className="px-3 py-2">
                  {comment.media.title && <div className="text-xs text-zinc-200 font-medium leading-snug line-clamp-2">{comment.media.title}</div>}
                  {comment.media.channel && <div className="text-[10px] text-zinc-400 mt-0.5">{comment.media.channel}</div>}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end text-xs font-medium text-zinc-500 select-none mt-1">
            <button onClick={handleLike} className={`flex items-center gap-1 transition-transform active:scale-95 ${isLiked ? 'text-[#ffdd00]' : 'text-zinc-500 hover:text-zinc-300'}`} title={isLiked ? "Убрать лайк" : "Нравится"}>
              <span className="text-[10px] font-bold">{likes}</span>
              <span className="text-sm leading-none">{'\uD83E\uDD18'}</span>
            </button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !isDeleting && setConfirmDelete(false)}>
          <div className="bg-[#1e1e1e] border border-zinc-700 rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-white font-medium mb-2">Удалить комментарий?</div>
            <div className="text-zinc-400 text-sm mb-4">Это действие нельзя отменить. Комментарий будет скрыт от всех пользователей.</div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(false)} disabled={isDeleting} className="px-4 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors rounded">Отмена</button>
              <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors">
                {isDeleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- Main ShoutCard ---------- */

const ShoutCard: React.FC<ShoutCardProps> = ({
  shout, showMedia = true, onCommentAdded, onDelete, onCommentDeleted,
  isThreadOpen, onThreadToggle
}) => {
  const { user, openModal } = useAuth();
  const [replyContent, setReplyContent] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [ytLoaded, setYtLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [replyMediaId, setReplyMediaId] = useState<string | null>(null);
  const [replyMediaPreview, setReplyMediaPreview] = useState<string | null>(null);
  const [isReplyUploading, setIsReplyUploading] = useState(false);
  const [replyDetectedYtId, setReplyDetectedYtId] = useState<string | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const [likes, setLikes] = useState(shout.likes);
  const [isLiked, setIsLiked] = useState(
    user && shout.likedBy ? shout.likedBy.includes(user.id) : false
  );

  useEffect(() => {
    setLikes(shout.likes);
    setIsLiked(user && shout.likedBy ? shout.likedBy.includes(user.id) : false);
  }, [shout.likes, shout.likedBy, user]);

  const repliesOpen = isThreadOpen ?? false;
  const hasComments = shout.comments && shout.comments.length > 0;
  const commentCount = shout.comments ? shout.comments.length : 0;
  const replyCharCount = replyContent.length;
  const isReplyOverLimit = replyCharCount > SHOUT_MAX_LENGTH;
  const replyHasMedia = !!replyMediaId || !!replyDetectedYtId;
  const canSubmitReply = (replyContent.trim() || replyHasMedia) && !isReplyOverLimit && !isSubmittingReply && !isReplyUploading;
  const isOwner = user && user.id === shout.user.id;

  useEffect(() => {
    if (replyMediaId) { setReplyDetectedYtId(null); return; }
    setReplyDetectedYtId(detectYouTubeId(replyContent));
  }, [replyContent, replyMediaId]);

  const toggleThread = () => {
    if (onThreadToggle) onThreadToggle(shout.id);
  };

  const handleReplyClick = () => {
    if (!user) { openModal(); return; }
    toggleThread();
  };

  const handleReplyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > MEDIA_MAX_MB * 1024 * 1024) { setReplyError(`Файл слишком большой (макс. ${MEDIA_MAX_MB} МБ)`); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setReplyError('Допустимые форматы: JPG, PNG, WebP'); return; }
    setReplyError(null);
    setIsReplyUploading(true);
    const localUrl = URL.createObjectURL(file);
    setReplyMediaPreview(localUrl);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v1/upload/media', { method: 'POST', credentials: 'include', body: formData });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `Ошибка ${res.status}`); }
      const data = await res.json();
      setReplyMediaId(data.mediaId);
      setReplyMediaPreview(data.urls.thumb);
      URL.revokeObjectURL(localUrl);
    } catch (err: unknown) {
      setReplyError(err instanceof Error ? err.message : 'Ошибка загрузки');
      setReplyMediaPreview(null); URL.revokeObjectURL(localUrl);
    } finally { setIsReplyUploading(false); }
  };

  const removeReplyMedia = () => {
    if (replyMediaPreview) URL.revokeObjectURL(replyMediaPreview);
    setReplyMediaId(null); setReplyMediaPreview(null); setReplyError(null);
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitReply || !user) return;
    setIsSubmittingReply(true); setReplyError(null);
    try {
      const body: Record<string, string> = { content: replyContent.trim() };
      if (replyMediaId) body.mediaId = replyMediaId;
      else if (replyDetectedYtId) { const m = replyContent.match(/https?:\/\/[^\s]+/); if (m) body.youtubeUrl = m[0]; }
      const res = await fetch(`/api/v1/shouts/${shout.id}/replies`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `Ошибка ${res.status}`); }
      const data = await res.json();
      const newComment: Comment = {
        id: data.id, shoutId: shout.id,
        user: { id: user.id, name: user.name, avatar: user.avatar },
        content: replyContent.trim(), timestamp: new Date().toISOString(),
        likes: 0, likedBy: [],
        ...(data.media ? { media: data.media } : {}),
      };
      setReplyContent(''); setReplyMediaId(null); setReplyMediaPreview(null);
      setReplyDetectedYtId(null); setReplyError(null);
      if (onCommentAdded) onCommentAdded(shout.id, newComment);
    } catch (err: unknown) {
      setReplyError(err instanceof Error ? err.message : 'Не удалось отправить ответ');
    } finally { setIsSubmittingReply(false); }
  };

  const handleLike = async () => {
    if (!user) { openModal(); return; }
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikes(prev => newIsLiked ? prev + 1 : Math.max(0, prev - 1));
    try {
      const res = await fetch(`/api/v1/shouts/${shout.id}/like`, { method: 'POST', credentials: 'include' });
      if (!res.ok) { setIsLiked(!newIsLiked); setLikes(prev => newIsLiked ? prev - 1 : prev + 1); return; }
      const data = await res.json();
      setLikes(data.likes); setIsLiked(data.isLiked);
    } catch { setIsLiked(!newIsLiked); setLikes(prev => newIsLiked ? prev - 1 : prev + 1); }
  };

  const handleDelete = async () => {
    if (!user || !isOwner) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/shouts/${shout.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `Ошибка ${res.status}`); }
      setConfirmDelete(false);
      if (onDelete) onDelete(shout.id);
    } catch (err: unknown) {
      console.error('[ShoutCard] Delete error:', err);
      setConfirmDelete(false);
    } finally { setIsDeleting(false); }
  };

  const handleCommentDelete = (commentId: string) => {
    if (onCommentDeleted) onCommentDeleted(shout.id, commentId);
  };

  const insertEmoji = (emoji: string) => setReplyContent(prev => prev + emoji);

  return (
    <div className="flex flex-col mb-4">
      <div className="flex gap-4">
        <a href={`#/profile/${shout.user.id}`} className="shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 hover:ring-2 hover:ring-zinc-600 transition-all">
            {shout.user.avatar ? (
              <img src={shout.user.avatar} alt={shout.user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm font-bold">
                {shout.user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </a>

        <div className="grow min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <a href={`#/profile/${shout.user.id}`} className={`font-bold text-sm hover:underline ${shout.user.isBanned ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
              {shout.user.name}
            </a>
            <span className="text-xs text-zinc-500">{formatTimestamp(shout.timestamp)}</span>
            {isOwner && (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-zinc-600 hover:text-red-400 transition-colors ml-auto" title="Удалить">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {shout.content && (
            <div className="text-zinc-300 text-[15px] leading-relaxed break-words whitespace-pre-wrap mb-3">
               {renderContent(shout.content)}
            </div>
          )}

          {showMedia && shout.media?.type === 'image' && (
             <div className="mb-3 rounded-lg overflow-hidden">
                 <img
                   src={shout.media.url} alt="attachment" loading="lazy"
                   onClick={() => setLightboxOpen(true)}
                   className="w-full cursor-pointer max-h-[300px] object-cover hover:opacity-90 transition-opacity rounded-lg"
                 />
             </div>
          )}

          {lightboxOpen && shout.media?.type === 'image' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer" onClick={() => setLightboxOpen(false)}>
              <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <img src={shout.media.full} alt="attachment" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
                <button onClick={() => setLightboxOpen(false)} className="absolute -top-3 -right-3 w-8 h-8 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700 text-sm font-bold">X</button>
              </div>
            </div>
          )}

          {showMedia && shout.media?.type === 'youtube' && (
              <div className="mb-3 rounded-lg overflow-hidden bg-[#2b2d31] border border-zinc-700/50">
                <div className="w-full aspect-video bg-black relative cursor-pointer" onClick={() => !ytLoaded && setYtLoaded(true)}>
                    {ytLoaded ? (
                      <iframe className="w-full h-full" src={`${shout.media.embedUrl}?autoplay=1`} title={shout.media.title || "YouTube"}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                        sandbox="allow-scripts allow-same-origin allow-presentation" />
                    ) : (
                      <>
                        <img src={`https://img.youtube.com/vi/${shout.media.videoId}/hqdefault.jpg`} alt={shout.media.title || "YouTube video"} loading="lazy" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-14 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg hover:bg-red-500 transition-colors">
                            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white ml-0.5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          </div>
                        </div>
                      </>
                    )}
                </div>
                {(shout.media.title || shout.media.channel) && (
                  <div className="px-3 py-2">
                    {shout.media.title && <div className="text-sm text-zinc-200 font-medium leading-snug line-clamp-2">{shout.media.title}</div>}
                    {shout.media.channel && <div className="text-xs text-zinc-400 mt-0.5">{shout.media.channel}</div>}
                  </div>
                )}
              </div>
          )}

          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 select-none mt-2">
            <div className="flex items-center gap-4">
              <button onClick={handleReplyClick} className={`hover:text-zinc-300 transition-colors ${repliesOpen ? 'text-white' : ''}`}>Ответить</button>
              {hasComments ? (
                <button onClick={toggleThread} className={`transition-colors ${repliesOpen ? 'text-white' : 'hover:text-zinc-300'}`}>
                  {repliesOpen ? 'Закрыть' : `${commentCount} ${getReplyDeclension(commentCount)}`}
                </button>
              ) : (
                <span className="opacity-50 cursor-default">0 ответов</span>
              )}
            </div>
            <div className="flex items-center">
                <button onClick={handleLike} className={`flex items-center gap-1 transition-transform active:scale-95 ${isLiked ? 'text-[#ffdd00]' : 'text-zinc-500 hover:text-zinc-300'}`} title={isLiked ? "Убрать лайк" : "Нравится"}>
                    <span className="text-xs font-bold">{likes}</span>
                    <span className="text-base leading-none">{'\uD83E\uDD18'}</span>
                </button>
            </div>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !isDeleting && setConfirmDelete(false)}>
          <div className="bg-[#1e1e1e] border border-zinc-700 rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-white font-medium mb-2">Удалить вопль?</div>
            <div className="text-zinc-400 text-sm mb-4">Это действие нельзя отменить. Вопль будет скрыт от всех пользователей.</div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(false)} disabled={isDeleting} className="px-4 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors rounded">Отмена</button>
              <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors">
                {isDeleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {repliesOpen && (
        <div className="ml-10 mt-2">
           {hasComments && shout.comments!.map(comment => (
               <CommentCard key={comment.id} comment={comment} showMedia={showMedia} onDelete={handleCommentDelete} />
           ))}
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
                      <input type="text" placeholder="Напишите ответ..."
                          className="bg-transparent border-none outline-none text-white text-sm w-full placeholder-zinc-600"
                          value={replyContent} onChange={(e) => { setReplyContent(e.target.value); setReplyError(null); }}
                          disabled={isSubmittingReply} maxLength={SHOUT_MAX_LENGTH + 50} />
                      <div className="flex items-center gap-2 justify-end">
                        <div className="flex items-center gap-1 shrink-0">
                          <EmojiPicker size="sm" onSelect={insertEmoji} />
                          <button type="button" onClick={() => replyFileInputRef.current?.click()}
                            disabled={isReplyUploading || !!replyMediaId}
                            className={`p-0.5 transition-colors ${replyMediaId ? 'text-[#0087ff]' : 'text-zinc-500 hover:text-zinc-300'} disabled:opacity-40`}
                            title={replyMediaId ? 'Изображение прикреплено' : 'Прикрепить изображение'}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                        <input ref={replyFileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleReplyFileSelect} />
                        {(replyContent.trim() || replyHasMedia) && (
                          <span className={`text-xs whitespace-nowrap ${isReplyOverLimit ? 'text-red-400 font-semibold' : replyCharCount > SHOUT_MAX_LENGTH * 0.9 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                            {replyCharCount}/{SHOUT_MAX_LENGTH}
                          </span>
                        )}
                        <button type="submit" disabled={!canSubmitReply} className="text-[#0087ff] hover:text-blue-400 text-sm font-medium disabled:opacity-30">
                            {isSubmittingReply ? '...' : 'Отправить'}
                        </button>
                      </div>
                      {replyMediaPreview && (
                        <div className="relative inline-block mt-1">
                          <img src={replyMediaPreview} alt="preview" className="max-h-24 rounded border border-zinc-700" />
                          {isReplyUploading && <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center"><div className="w-4 h-4 border-2 border-zinc-500 border-t-white rounded-full animate-spin" /></div>}
                          {!isReplyUploading && <button type="button" onClick={removeReplyMedia} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700 text-[10px]">X</button>}
                        </div>
                      )}
                      {!replyMediaId && replyDetectedYtId && (
                        <div className="flex items-center gap-2 mt-1 bg-zinc-900/50 rounded p-1.5 border border-zinc-800">
                          <img src={`https://img.youtube.com/vi/${replyDetectedYtId}/default.jpg`} alt="YouTube" className="w-14 h-10 rounded object-cover shrink-0" />
                          <div className="text-[10px] text-zinc-400">YouTube видео</div>
                        </div>
                      )}
                  </form>
               </div>
               {replyError && <div className="mt-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{replyError}</div>}
             </div>
           )}
        </div>
      )}
    </div>
  );
};

function formatTimestamp(ts: string): string {
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
  } catch { return ts; }
}

function getReplyDeclension(count: number): string {
    const ld = count % 10, lt = count % 100;
    if (lt >= 11 && lt <= 19) return 'ответов';
    if (ld === 1) return 'ответ';
    if (ld >= 2 && ld <= 4) return 'ответа';
    return 'ответов';
}

function getDeclension(count: number, one: string, few: string, many: string): string {
    const ld = count % 10, lt = count % 100;
    if (lt >= 11 && lt <= 19) return many;
    if (ld === 1) return one;
    if (ld >= 2 && ld <= 4) return few;
    return many;
}

export default ShoutCard;
