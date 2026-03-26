import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Shout, Comment } from '../types';
import { navigateTo } from '../hooks/useRoute';
import { useContentPreferences } from '../context/ContentPreferencesContext';
import { useAuth } from '../context/AuthContext';
import { useSSE } from '../hooks/useSSE';
import ShoutCard from './ShoutCard';

interface ShoutPageProps {
  shoutId: string;
  focusCommentId?: string;
}

const ShoutPage: React.FC<ShoutPageProps> = ({ shoutId, focusCommentId }) => {
  const { prefs } = useContentPreferences();
  const { user } = useAuth();
  const [shout, setShout] = useState<Shout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  useEffect(() => {
    setLoading(true);
    setError(null);
    setShout(null);
    fetch(`/api/v1/shouts/${shoutId}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.shout) setShout(data.shout);
        else setError('Запись не найдена');
      })
      .catch(() => setError('Не удалось загрузить запись'))
      .finally(() => setLoading(false));
  }, [shoutId]);

  function handleCommentAdded(_shoutId: string, comment: Comment) {
    setShout((prev) =>
      prev ? { ...prev, comments: [...(prev.comments || []), comment] } : prev
    );
  }

  function handleCommentDeleted(_shoutId: string, commentId: string) {
    setShout((prev) =>
      prev
        ? { ...prev, comments: (prev.comments || []).filter((c) => c.id !== commentId) }
        : prev
    );
  }

  function handleDelete() {
    // Mark as deleted in-place so comments remain visible
    setShout((prev) =>
      prev ? { ...prev, isDeleted: true, content: '', media: undefined, user: null } : prev
    );
  }

  const sseListeners = useMemo(() => ({
    delete_shout: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      if (data.shoutId === shoutId) {
        setShout((prev) =>
          prev ? { ...prev, isDeleted: true, content: '', media: undefined, user: null } : prev
        );
      }
    },
    new_comment: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      if (data.shoutId !== shoutId) return;
      const comment = data.comment as Comment | undefined;
      if (comment) {
        setShout((prev) =>
          prev ? { ...prev, comments: [...(prev.comments || []), comment] } : prev
        );
      }
    },
    delete_comment: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      if (data.shoutId !== shoutId) return;
      const commentId = data.commentId as string;
      setShout((prev) =>
        prev
          ? { ...prev, comments: (prev.comments || []).filter((c) => c.id !== commentId) }
          : prev
      );
    },
    shout_like: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      if (data.shoutId !== shoutId) return;
      const likes = data.likes as number;
      setShout((prev) => prev ? { ...prev, likes } : prev);
    },
    comment_like: (data: Record<string, unknown>) => {
      if (data.userId === userIdRef.current) return;
      const commentId = data.commentId as string;
      const likes = data.likes as number;
      setShout((prev) =>
        prev
          ? { ...prev, comments: (prev.comments || []).map((c) => c.id === commentId ? { ...c, likes } : c) }
          : prev
      );
    },
    poll_update: (data: Record<string, unknown>) => {
      const pollId = data.pollId as string;
      const options = data.options as { id: string; votes: number }[];
      const totalVoters = data.totalVoters as number;
      setShout((prev) => {
        if (!prev?.poll || prev.poll.id !== pollId) return prev;
        return {
          ...prev,
          poll: {
            ...prev.poll,
            totalVoters,
            options: prev.poll.options.map(o => {
              const updated = options.find(u => u.id === o.id);
              return updated ? { ...o, votes: updated.votes } : o;
            }),
          },
        };
      });
    },
  }), [shoutId]);

  useSSE(sseListeners);

  // Jump to the focused comment once the shout has loaded
  useEffect(() => {
    if (!focusCommentId || !shout) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`comment-${focusCommentId}`);
      if (el) {
        el.scrollIntoView({ block: 'center' });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [focusCommentId, shout]);

  return (
    <div>
      <button
        onClick={() => navigateTo('/')}
        className="flex items-center gap-1.5 text-sm text-th-text-3 hover:text-th-text transition-colors mb-4"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
        </svg>
        Назад
      </button>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-th-border border-t-th-text-3 rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="text-center text-th-text-3 py-12">{error}</div>
      )}

      {shout && (
        <div className="bg-th-feed rounded-xl px-5 py-4 border border-th-border-2">
          <ShoutCard
            shout={shout}
            showMedia={prefs.showMedia}
            isThreadOpen
            onCommentAdded={handleCommentAdded}
            onDelete={handleDelete}
            onCommentDeleted={handleCommentDeleted}
          />
        </div>
      )}
    </div>
  );
};

export default ShoutPage;
