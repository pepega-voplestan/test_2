import React, { useState, useEffect } from 'react';
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

const ShoutCard: React.FC<ShoutCardProps> = ({ shout, isReply = false, showMedia = true, onReplyAdded, parentShoutId }) => {
  const { user, openModal } = useAuth();
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [ytLoaded, setYtLoaded] = useState(false);

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

  const toggleReplies = () => {
    setRepliesOpen(!repliesOpen);
  };

  const handleReplyClick = () => {
    if (!user) {
      openModal();
      return;
    }
    if (!isReplying) {
        setIsReplying(true);
        setRepliesOpen(true);
        setReplyError(null);
    } else {
        setIsReplying(false);
        setReplyContent('');
        setReplyError(null);
        if (!hasReplies) {
            setRepliesOpen(false);
        }
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !user || isSubmittingReply || isReplyOverLimit) return;

    const targetId = parentShoutId || shout.id;
    setIsSubmittingReply(true);
    setReplyError(null);
    console.log(`[ShoutCard] Submitting reply to shout ${targetId}`);

    try {
      const res = await fetch(`/api/v1/shouts/${targetId}/replies`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent.trim() })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Ошибка ${res.status}`);
      }

      const data = await res.json();
      console.log(`[ShoutCard] Reply posted: ${data.id}`);

      // Build reply object and add to local state instead of re-fetching entire feed
      const newReply: Shout = {
        id: data.id,
        user: { id: user.id, name: user.name, avatar: user.avatar },
        content: replyContent.trim(),
        timestamp: new Date().toISOString(),
        likes: 0,
        likedBy: [],
        replies: [],
      };

      setReplyContent('');
      setIsReplying(false);
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
        // Revert on failure
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
      // Revert on network error
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
               {shout.content.split(' ').map((word, i) => {
                   if (word.startsWith('http')) {
                       return <a key={i} href={word} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">{word} </a>;
                   }
                   if (word.startsWith('@')) {
                       return <span key={i} className="text-sky-500">{word} </span>;
                   }
                   return word + ' ';
               })}
            </div>
          )}

          {/* Image attachment */}
          {showMedia && shout.media?.type === 'image' && (
             <div className="mb-3 rounded-lg overflow-hidden max-w-[600px]">
                 <img
                   src={imageExpanded ? shout.media.full : shout.media.url}
                   alt="attachment"
                   loading="lazy"
                   onClick={() => setImageExpanded(!imageExpanded)}
                   className={`w-full cursor-pointer transition-all ${imageExpanded ? '' : 'max-h-[600px] object-cover'}`}
                 />
             </div>
          )}

          {/* YouTube embed — lazy: show thumbnail first, load iframe on click */}
          {showMedia && shout.media?.type === 'youtube' && (
              <div
                className="mb-3 rounded-lg overflow-hidden w-full aspect-video bg-black relative cursor-pointer"
                onClick={() => !ytLoaded && setYtLoaded(true)}
              >
                  {ytLoaded ? (
                    <iframe
                      className="w-full h-full"
                      src={`${shout.media.embedUrl}?autoplay=1`}
                      title="YouTube"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      sandbox="allow-scripts allow-same-origin allow-presentation"
                    />
                  ) : (
                    <>
                      <img
                        src={`https://img.youtube.com/vi/${shout.media.videoId}/hqdefault.jpg`}
                        alt="YouTube video"
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center shadow-lg hover:bg-red-500 transition-colors">
                          <svg viewBox="0 0 24 24" className="w-8 h-8 text-white ml-1" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    </>
                  )}
              </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 select-none mt-2">
            <div className="flex items-center gap-4">
                {!isReply && (
                  <button
                      onClick={handleReplyClick}
                      className={`hover:text-zinc-300 transition-colors ${isReplying ? 'text-white' : ''}`}
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
                    className={`flex items-center gap-2 transition-transform active:scale-95 ${isLiked ? 'text-[#ffdd00]' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title={isLiked ? "Убрать лайк" : "Нравится"}
                >
                    <span className="text-xl font-bold">{likes}</span>
                    <span className="text-3xl leading-none">{'\uD83E\uDD18'}</span>
                </button>
            </div>
          </div>
        </div>
      </div>

      {/* Nested Replies */}
      {!isReply && (repliesOpen && (hasReplies || isReplying)) && (
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

           {/* Reply Input Section */}
           {isReplying && (
             <div className="mt-4">
               <div className="bg-[#1e1e1e] p-3 rounded flex gap-3">
                 <div className="w-8 h-8 bg-zinc-700 rounded-full shrink-0 flex items-center justify-center overflow-hidden">
                      {user?.avatar ? (
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
                            autoFocus
                            maxLength={SHOUT_MAX_LENGTH + 50}
                        />
                        {replyContent.trim() && (
                          <span className={`text-xs whitespace-nowrap ${isReplyOverLimit ? 'text-red-400 font-semibold' : replyCharCount > SHOUT_MAX_LENGTH * 0.9 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                            {replyCharCount}/{SHOUT_MAX_LENGTH}
                          </span>
                        )}
                        <button
                          type="submit"
                          disabled={!replyContent.trim() || isSubmittingReply || isReplyOverLimit}
                          className="text-[#0087ff] hover:text-blue-400 text-sm font-medium disabled:opacity-30"
                        >
                            {isSubmittingReply ? '...' : 'Отправить'}
                        </button>
                      </div>
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
