import React, { useState } from 'react';
import { Shout } from '../types';
import { useAuth } from '../context/AuthContext';

interface ShoutCardProps {
  shout: Shout;
  isReply?: boolean;
  showMedia?: boolean;
  onShoutUpdated?: () => void;
  parentShoutId?: string;
}

const ShoutCard: React.FC<ShoutCardProps> = ({ shout, isReply = false, showMedia = true, onShoutUpdated, parentShoutId }) => {
  const { user, openModal } = useAuth();
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Like state — init from likedBy if user is logged in
  const [likes, setLikes] = useState(shout.likes);
  const [isLiked, setIsLiked] = useState(
    user && shout.likedBy ? shout.likedBy.includes(user.id) : false
  );

  const hasReplies = shout.replies && shout.replies.length > 0;
  const replyCount = shout.replies ? shout.replies.length : 0;

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
    } else {
        setIsReplying(false);
        setReplyContent('');
        if (!hasReplies) {
            setRepliesOpen(false);
        }
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !user || isSubmittingReply) return;

    const targetId = parentShoutId || shout.id;
    setIsSubmittingReply(true);
    console.log(`[ShoutCard] Submitting reply to shout ${targetId}`);

    try {
      const res = await fetch(`/api/shouts/${targetId}/replies`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent.trim() })
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('[ShoutCard] Reply error:', data.error);
        return;
      }

      console.log('[ShoutCard] Reply posted successfully');
      setReplyContent('');
      setIsReplying(false);
      if (onShoutUpdated) onShoutUpdated();
    } catch (err) {
      console.error('[ShoutCard] Reply network error:', err);
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

    console.log(`[ShoutCard] Toggling like on ${shout.id}`);

    try {
      const res = await fetch(`/api/shouts/${shout.id}/like`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!res.ok) {
        // Revert on failure
        setIsLiked(!newIsLiked);
        setLikes(prev => newIsLiked ? prev - 1 : prev + 1);
        console.error('[ShoutCard] Like failed');
        return;
      }

      const data = await res.json();
      setLikes(data.likes);
      setIsLiked(data.isLiked);
      console.log(`[ShoutCard] Like result: ${data.likes} likes, isLiked=${data.isLiked}`);
    } catch (err) {
      // Revert on network error
      setIsLiked(!newIsLiked);
      setLikes(prev => newIsLiked ? prev - 1 : prev + 1);
      console.error('[ShoutCard] Like network error:', err);
    }
  };

  // Format timestamp — show relative time for ISO strings, pass through for mock relative strings
  const formatTimestamp = (ts: string): string => {
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) return ts; // not a valid date, return as-is (mock data)
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
        <div className="shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800">
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
        </div>

        {/* Content */}
        <div className="grow min-w-0">
          {/* Header */}
          <div className="flex items-baseline gap-2 mb-1">
            <span className={`font-bold text-sm ${shout.user.isBanned ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
              {shout.user.name}
            </span>
            <span className="text-xs text-zinc-500">{formatTimestamp(shout.timestamp)}</span>
          </div>

          {/* Body Text */}
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

          {/* Images */}
          {showMedia && shout.image && (
             <div className="mb-3 rounded overflow-hidden max-w-[600px]">
                 <img src={shout.image} alt="attachment" className="w-full h-auto object-cover max-h-[400px]" />
             </div>
          )}

          {/* Embeds (Youtube) */}
          {showMedia && shout.embed && shout.embed.type === 'youtube' && (
              <div className="mb-3 rounded overflow-hidden w-full aspect-video bg-black">
                  <iframe
                    className="w-full h-full"
                    src={shout.embed.src}
                    title="Youtube Embed"
                    frameBorder="0"
                    allowFullScreen
                  />
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
                    <span className="text-3xl leading-none">🤘</span>
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
                 onShoutUpdated={onShoutUpdated}
                 parentShoutId={shout.id}
               />
           ))}

           {/* Reply Input Section */}
           {isReplying && (
             <div className="mt-4 bg-[#1e1e1e] p-3 rounded flex gap-3">
                 <div className="w-8 h-8 bg-zinc-700 rounded-full shrink-0 flex items-center justify-center overflow-hidden">
                      {user?.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      )}
                 </div>
                  <form className="w-full flex gap-2 items-center" onSubmit={handleReplySubmit}>
                      <input
                          type="text"
                          placeholder="Напишите ответ..."
                          className="bg-transparent border-none outline-none text-white text-sm w-full placeholder-zinc-600"
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          disabled={isSubmittingReply}
                          autoFocus
                      />
                      <button
                        type="submit"
                        disabled={!replyContent.trim() || isSubmittingReply}
                        className="text-[#0087ff] hover:text-blue-400 text-sm font-medium disabled:opacity-30"
                      >
                          {isSubmittingReply ? '...' : 'Отправить'}
                      </button>
                  </form>
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
