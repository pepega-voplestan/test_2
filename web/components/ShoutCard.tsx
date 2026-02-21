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

const SHOUT_MAX_LENGTH = 400;
const NEWLINE_CHAR_COST = 40;
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

/* ---------- Scroll lock helper ---------- */

function useScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;
    const scrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [isLocked]);
}

/* ---------- Embed detection & rendering ---------- */

type EmbedInfo =
  | { type: 'imgur'; imageId: string; ext: string }
  | { type: 'coub'; videoId: string }
  | { type: 'tenor'; url: string; tenorId: string }
  | { type: 'imgur-direct'; url: string };

function extractEmbeds(text: string): EmbedInfo[] {
  const embeds: EmbedInfo[] = [];
  const urls = text.match(/https?:\/\/[^\s]+/g) || [];
  for (const url of urls) {
    // Direct imgur image: i.imgur.com/XXXX.ext
    const imgurDirect = url.match(/https?:\/\/i\.imgur\.com\/([a-zA-Z0-9]+)\.(jpg|jpeg|png|gif|webp|mp4)/i);
    if (imgurDirect) {
      embeds.push({ type: 'imgur-direct', url });
      continue;
    }
    // Imgur page: imgur.com/XXXX (not album, not gallery)
    const imgurPage = url.match(/https?:\/\/(?:www\.)?imgur\.com\/([a-zA-Z0-9]{5,10})(?:[?#]|$)/);
    if (imgurPage) {
      embeds.push({ type: 'imgur', imageId: imgurPage[1], ext: 'jpg' });
      continue;
    }
    // Imgur album: imgur.com/a/XXXX or imgur.com/gallery/XXXX
    const imgurAlbum = url.match(/https?:\/\/(?:www\.)?imgur\.com\/(?:a|gallery)\/([a-zA-Z0-9]+)/);
    if (imgurAlbum) {
      embeds.push({ type: 'imgur', imageId: imgurAlbum[1], ext: 'jpg' });
      continue;
    }
    // Coub: coub.com/view/XXXX
    const coub = url.match(/https?:\/\/(?:www\.)?coub\.com\/view\/([a-zA-Z0-9_-]+)/);
    if (coub) {
      embeds.push({ type: 'coub', videoId: coub[1] });
      continue;
    }
    // Tenor: tenor.com/view/xxx-12345
    const tenor = url.match(/https?:\/\/(?:www\.)?tenor\.com\/(?:[a-z]{2}\/)?view\/[\w-]+-(\d+)/);
    if (tenor) {
      embeds.push({ type: 'tenor', url, tenorId: tenor[1] });
      continue;
    }
    // Direct tenor media
    const tenorDirect = url.match(/https?:\/\/media1?\.tenor\.com\/[^\s]+\.(gif|mp4)/i);
    if (tenorDirect) {
      embeds.push({ type: 'imgur-direct', url });
      continue;
    }
  }
  return embeds;
}

const EmbedCard: React.FC<{ embed: EmbedInfo }> = ({ embed }) => {
  const [imgError, setImgError] = useState(false);

  if (embed.type === 'imgur-direct') {
    if (imgError) return null;
    if (embed.url.endsWith('.mp4')) {
      return (
        <div className="mb-2 rounded-lg overflow-hidden max-w-full">
          <video src={embed.url} controls muted loop className="max-h-[300px] max-w-full rounded-lg" />
        </div>
      );
    }
    return (
      <div className="mb-2 rounded-lg">
        <img src={embed.url} alt="Imgur" loading="lazy" onError={() => setImgError(true)} className="max-h-[300px] max-w-full h-auto object-contain rounded-lg" />
      </div>
    );
  }

  if (embed.type === 'imgur') {
    if (imgError) return null;
    return (
      <div className="mb-2 rounded-lg">
        <img src={`https://i.imgur.com/${embed.imageId}.${embed.ext}`} alt="Imgur" loading="lazy" onError={() => setImgError(true)} className="max-h-[300px] max-w-full h-auto object-contain rounded-lg" />
      </div>
    );
  }

  if (embed.type === 'coub') {
    return (
      <div className="mb-2 rounded-lg overflow-hidden border border-th-border/50">
        <div className="w-full aspect-video">
          <iframe
            src={`https://coub.com/embed/${embed.videoId}?muted=false&autostart=false&originalSize=false&startWithHD=true`}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            title="Coub"
          />
        </div>
      </div>
    );
  }

  if (embed.type === 'tenor') {
    return (
      <div className="mb-2 rounded-lg overflow-hidden border border-th-border/50">
        <div className="w-full" style={{ paddingBottom: '75%', position: 'relative' }}>
          <iframe
            src={`https://tenor.com/embed/${embed.tenorId}`}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation"
            title="Tenor GIF"
          />
        </div>
      </div>
    );
  }

  return null;
};

/* ---------- Content rendering ---------- */

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

  // Separate effects: update likes count from props, but only update isLiked when likedBy changes
  useEffect(() => {
    setLikes(comment.likes);
  }, [comment.likes]);

  useEffect(() => {
    setIsLiked(user && comment.likedBy ? comment.likedBy.includes(user.id) : false);
  }, [comment.likedBy, user]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen]);

  // Scroll lock for lightbox
  useScrollLock(lightboxOpen);

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

  const embeds = comment.content ? extractEmbeds(comment.content) : [];

  return (
    <div className="flex flex-col mt-4 border-l-2 border-th-border-2 pl-4">
      <div className="flex gap-3">
        <a href={`#/profile/${comment.user.id}`} className="shrink-0">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-th-input hover:ring-2 hover:ring-th-border transition-all">
            {comment.user.avatar ? (
              <img src={comment.user.avatar} alt={comment.user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-th-text-4 text-xs font-bold">
                {comment.user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </a>

        <div className="grow min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <a href={`#/profile/${comment.user.id}`} className={`font-bold text-xs hover:underline ${comment.user.isBanned ? 'text-th-text-4 line-through' : 'text-th-text-2'}`}>
              {comment.user.name}
            </a>
            <span className="text-[10px] text-th-text-4">{formatTimestamp(comment.timestamp)}</span>
            {isOwner && (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-th-text-4 hover:text-red-400 transition-colors ml-auto" title="Удалить">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {comment.content && (
            <div className="text-th-text-2 text-sm leading-relaxed break-words whitespace-pre-wrap mb-2">
              {renderContent(comment.content)}
            </div>
          )}

          {showMedia && embeds.map((embed, idx) => (
            <EmbedCard key={`embed-${idx}`} embed={embed} />
          ))}

          {showMedia && comment.media?.type === 'image' && (
            <div className="mb-2 rounded-lg">
              <img
                src={comment.media.animated && comment.media.gif ? comment.media.gif : comment.media.url} alt="attachment" loading="lazy"
                onClick={() => setLightboxOpen(true)}
                className="block cursor-pointer max-h-[200px] max-w-full h-auto object-contain hover:opacity-90 transition-opacity rounded-lg"
              />
            </div>
          )}

          {lightboxOpen && comment.media?.type === 'image' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer" onClick={() => setLightboxOpen(false)}>
              <div className="relative max-w-[90vw] max-h-[90vh]">
                <img src={comment.media.animated && comment.media.gif ? comment.media.gif : comment.media.full} alt="attachment" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg cursor-pointer" />
                <button onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }} className="absolute -top-3 -right-3 w-8 h-8 bg-th-input border border-th-border rounded-full flex items-center justify-center text-th-text-2 hover:text-th-text hover:bg-th-elevated text-sm font-bold">X</button>
              </div>
            </div>
          )}

          {showMedia && comment.media?.type === 'youtube' && (
            <div className="mb-2 rounded-lg overflow-hidden bg-th-card border border-th-border/50">
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
                  {comment.media.title && <div className="text-xs text-th-text-2 font-medium leading-snug line-clamp-2">{comment.media.title}</div>}
                  {comment.media.channel && <div className="text-[10px] text-th-text-3 mt-0.5">{comment.media.channel}</div>}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end text-xs font-medium text-th-text-4 select-none mt-1">
            <button onClick={handleLike} className={`flex items-center gap-1 transition-transform active:scale-95 ${isLiked ? 'text-[#e6a700]' : 'text-th-text-4 hover:text-th-text-2'}`} title={isLiked ? "Убрать лайк" : "Нравится"}>
              <span className="text-[10px] font-bold">{likes}</span>
              <span className="text-sm leading-none">{'\uD83E\uDD18'}</span>
            </button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !isDeleting && setConfirmDelete(false)}>
          <div className="bg-th-card border border-th-border rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-th-text font-medium mb-2">Удалить комментарий?</div>
            <div className="text-th-text-3 text-sm mb-4">Это действие нельзя отменить. Комментарий будет скрыт от всех пользователей.</div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(false)} disabled={isDeleting} className="px-4 py-1.5 text-sm text-th-text-3 hover:text-th-text transition-colors rounded">Отмена</button>
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
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [likes, setLikes] = useState(shout.likes);
  const [isLiked, setIsLiked] = useState(
    user && shout.likedBy ? shout.likedBy.includes(user.id) : false
  );

  // Separate effects: update likes count from props, but only update isLiked when likedBy changes
  useEffect(() => {
    setLikes(shout.likes);
  }, [shout.likes]);

  useEffect(() => {
    setIsLiked(user && shout.likedBy ? shout.likedBy.includes(user.id) : false);
  }, [shout.likedBy, user]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen]);

  // Scroll lock for lightbox
  useScrollLock(lightboxOpen);

  const repliesOpen = isThreadOpen ?? false;
  const hasComments = shout.comments && shout.comments.length > 0;
  const commentCount = shout.comments ? shout.comments.length : 0;
  const replyNewlineCount = (replyContent.match(/\n/g) || []).length;
  const replyCharCount = replyContent.length + replyNewlineCount * (NEWLINE_CHAR_COST - 1);
  const isReplyOverLimit = replyCharCount > SHOUT_MAX_LENGTH;
  const replyHasMedia = !!replyMediaId || !!replyDetectedYtId;
  const canSubmitReply = (replyContent.trim() || replyHasMedia) && !isReplyOverLimit && !isSubmittingReply && !isReplyUploading;
  const isOwner = user && user.id === shout.user.id;

  useEffect(() => {
    if (replyMediaId) { setReplyDetectedYtId(null); return; }
    setReplyDetectedYtId(detectYouTubeId(replyContent));
  }, [replyContent, replyMediaId]);

  useEffect(() => {
    const ta = replyTextareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  }, [replyContent]);

  const toggleThread = () => {
    if (onThreadToggle) onThreadToggle(shout.id);
  };

  const handleReplyClick = () => {
    if (!user) { openModal(); return; }
    toggleThread();
  };

  const uploadReplyFile = async (file: File) => {
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

  const handleReplyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await uploadReplyFile(file);
  };

  const handleReplyPaste = async (e: React.ClipboardEvent) => {
    if (replyMediaId || isReplyUploading) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await uploadReplyFile(file);
        return;
      }
    }
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

  const embeds = shout.content ? extractEmbeds(shout.content) : [];

  return (
    <div className="flex flex-col">
      <div className="flex gap-4">
        <a href={`#/profile/${shout.user.id}`} className="shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-th-input hover:ring-2 hover:ring-th-border transition-all">
            {shout.user.avatar ? (
              <img src={shout.user.avatar} alt={shout.user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-th-text-4 text-sm font-bold">
                {shout.user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </a>

        <div className="grow min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <a href={`#/profile/${shout.user.id}`} className={`font-bold text-sm hover:underline ${shout.user.isBanned ? 'text-th-text-4 line-through' : 'text-th-text-2'}`}>
              {shout.user.name}
            </a>
            <span className="text-xs text-th-text-4">{formatTimestamp(shout.timestamp)}</span>
            {isOwner && (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-th-text-4 hover:text-red-400 transition-colors ml-auto" title="Удалить">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {shout.content && (
            <div className="text-th-text-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap mb-3">
               {renderContent(shout.content)}
            </div>
          )}

          {showMedia && embeds.map((embed, idx) => (
            <EmbedCard key={`embed-${idx}`} embed={embed} />
          ))}

          {showMedia && shout.media?.type === 'image' && (
             <div className="mb-3 rounded-lg">
                 <img
                   src={shout.media.animated && shout.media.gif ? shout.media.gif : shout.media.url} alt="attachment" loading="lazy"
                   onClick={() => setLightboxOpen(true)}
                   className="block cursor-pointer max-h-[300px] max-w-full h-auto object-contain hover:opacity-90 transition-opacity rounded-lg"
                 />
             </div>
          )}

          {lightboxOpen && shout.media?.type === 'image' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer" onClick={() => setLightboxOpen(false)}>
              <div className="relative max-w-[90vw] max-h-[90vh]">
                <img src={shout.media.animated && shout.media.gif ? shout.media.gif : shout.media.full} alt="attachment" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg cursor-pointer" />
                <button onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }} className="absolute -top-3 -right-3 w-8 h-8 bg-th-input border border-th-border rounded-full flex items-center justify-center text-th-text-2 hover:text-th-text hover:bg-th-elevated text-sm font-bold">X</button>
              </div>
            </div>
          )}

          {showMedia && shout.media?.type === 'youtube' && (
              <div className="mb-3 rounded-lg overflow-hidden bg-th-card border border-th-border/50">
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
                    {shout.media.title && <div className="text-sm text-th-text-2 font-medium leading-snug line-clamp-2">{shout.media.title}</div>}
                    {shout.media.channel && <div className="text-xs text-th-text-3 mt-0.5">{shout.media.channel}</div>}
                  </div>
                )}
              </div>
          )}

          <div className="flex items-center justify-between text-xs font-medium text-th-text-4 select-none mt-2">
            <div className="flex items-center gap-4">
              <button onClick={handleReplyClick} className={`hover:text-th-text-2 transition-colors ${repliesOpen ? 'text-th-text' : ''}`}>Ответить</button>
              {hasComments ? (
                <button onClick={toggleThread} className={`transition-colors ${repliesOpen ? 'text-th-text' : 'hover:text-th-text-2'}`}>
                  {repliesOpen ? 'Закрыть' : `${commentCount} ${getReplyDeclension(commentCount)}`}
                </button>
              ) : (
                <span className="opacity-50 cursor-default">0 ответов</span>
              )}
            </div>
            <div className="flex items-center">
                <button onClick={handleLike} className={`flex items-center gap-1 transition-transform active:scale-95 ${isLiked ? 'text-[#e6a700]' : 'text-th-text-4 hover:text-th-text-2'}`} title={isLiked ? "Убрать лайк" : "Нравится"}>
                    <span className="text-xs font-bold">{likes}</span>
                    <span className="text-base leading-none">{'\uD83E\uDD18'}</span>
                </button>
            </div>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !isDeleting && setConfirmDelete(false)}>
          <div className="bg-th-card border border-th-border rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-th-text font-medium mb-2">Удалить вопль?</div>
            <div className="text-th-text-3 text-sm mb-4">Это действие нельзя отменить. Вопль будет скрыт от всех пользователей.</div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(false)} disabled={isDeleting} className="px-4 py-1.5 text-sm text-th-text-3 hover:text-th-text transition-colors rounded">Отмена</button>
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
               <div className="bg-th-card p-3 rounded flex gap-3">
                 <div className="w-8 h-8 bg-th-elevated rounded-full shrink-0 flex items-center justify-center overflow-hidden">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-th-text-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      )}
                 </div>
                  <form className="w-full flex flex-col gap-2" onSubmit={handleReplySubmit}>
                      <textarea ref={replyTextareaRef} placeholder="Напишите ответ..."
                          className="bg-transparent border-none outline-none text-th-text text-sm w-full placeholder-th-text-4 resize-none overflow-hidden"
                          rows={1}
                          value={replyContent} onChange={(e) => { setReplyContent(e.target.value); setReplyError(null); }}
                          onPaste={handleReplyPaste}
                          disabled={isSubmittingReply} />
                      <div className="flex items-center gap-2 justify-end">
                        <div className="flex items-center gap-1 shrink-0">
                          <EmojiPicker size="sm" onSelect={insertEmoji} />
                          <button type="button" onClick={() => replyFileInputRef.current?.click()}
                            disabled={isReplyUploading || !!replyMediaId}
                            className={`p-0.5 transition-colors ${replyMediaId ? 'text-[#0087ff]' : 'text-th-text-4 hover:text-th-text-2'} disabled:opacity-40`}
                            title={replyMediaId ? 'Изображение прикреплено' : 'Прикрепить изображение'}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                        <input ref={replyFileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleReplyFileSelect} />
                        {(replyContent.trim() || replyHasMedia) && (
                          <span className={`text-xs whitespace-nowrap ${isReplyOverLimit ? 'text-red-400 font-semibold' : replyCharCount > SHOUT_MAX_LENGTH * 0.9 ? 'text-yellow-400' : 'text-th-text-4'}`}>
                            {replyCharCount}/{SHOUT_MAX_LENGTH}
                          </span>
                        )}
                        <button type="submit" disabled={!canSubmitReply} className="text-[#0087ff] hover:text-blue-400 text-sm font-medium disabled:opacity-30">
                            {isSubmittingReply ? '...' : 'Отправить'}
                        </button>
                      </div>
                      {replyMediaPreview && (
                        <div className="relative inline-block mt-1">
                          <img src={replyMediaPreview} alt="preview" className="max-h-24 rounded border border-th-border" />
                          {isReplyUploading && <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center"><div className="w-4 h-4 border-2 border-th-text-4 border-t-th-text rounded-full animate-spin" /></div>}
                          {!isReplyUploading && <button type="button" onClick={removeReplyMedia} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-th-input border border-th-border rounded-full flex items-center justify-center text-th-text-2 hover:text-th-text hover:bg-th-elevated text-[10px]">X</button>}
                        </div>
                      )}
                      {!replyMediaId && replyDetectedYtId && (
                        <div className="flex items-center gap-2 mt-1 bg-th-inset/50 rounded p-1.5 border border-th-border-2">
                          <img src={`https://img.youtube.com/vi/${replyDetectedYtId}/default.jpg`} alt="YouTube" className="w-14 h-10 rounded object-cover shrink-0" />
                          <div className="text-[10px] text-th-text-3">YouTube видео</div>
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
