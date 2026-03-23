import React, { useState } from 'react';
import { Poll } from '../types';
import { useAuth } from '../context/AuthContext';

interface PollBlockProps {
  poll: Poll;
  onVote: (pollId: string, optionIds: string[]) => void;
}

const PollBlock: React.FC<PollBlockProps> = ({ poll, onVote }) => {
  const { user } = useAuth();
  const [isVoting, setIsVoting] = useState(false);
  const [localPoll, setLocalPoll] = useState(poll);

  // Sync with parent when poll prop changes (SSE updates)
  const pollRef = React.useRef(poll);
  if (poll !== pollRef.current) {
    pollRef.current = poll;
    setLocalPoll(poll);
  }

  const totalVotes = localPoll.options.reduce((sum, o) => sum + o.votes, 0);
  const hasVoted = localPoll.userVotes.length > 0;

  const handleVote = async (optionId: string) => {
    if (isVoting || !user) return;

    setIsVoting(true);

    // Optimistic update
    const prevPoll = localPoll;
    const isSelected = localPoll.userVotes.includes(optionId);

    let nextUserVotes: string[];
    let nextOptions = localPoll.options.map(o => ({ ...o }));

    if (localPoll.multi) {
      if (isSelected) {
        nextUserVotes = localPoll.userVotes.filter(id => id !== optionId);
        nextOptions = nextOptions.map(o =>
          o.id === optionId ? { ...o, votes: Math.max(0, o.votes - 1) } : o
        );
      } else {
        nextUserVotes = [...localPoll.userVotes, optionId];
        nextOptions = nextOptions.map(o =>
          o.id === optionId ? { ...o, votes: o.votes + 1 } : o
        );
      }
    } else {
      if (isSelected) {
        // Unvote
        nextUserVotes = [];
        nextOptions = nextOptions.map(o =>
          o.id === optionId ? { ...o, votes: Math.max(0, o.votes - 1) } : o
        );
      } else {
        // Switch vote
        const prevVoteId = localPoll.userVotes[0];
        nextUserVotes = [optionId];
        nextOptions = nextOptions.map(o => {
          if (o.id === prevVoteId) return { ...o, votes: Math.max(0, o.votes - 1) };
          if (o.id === optionId) return { ...o, votes: o.votes + 1 };
          return o;
        });
      }
    }

    setLocalPoll({ ...localPoll, options: nextOptions, userVotes: nextUserVotes });

    try {
      const res = await fetch(`/api/v1/polls/${localPoll.id}/vote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: [optionId] }),
      });

      if (!res.ok) {
        // Rollback
        setLocalPoll(prevPoll);
        return;
      }

      const data = await res.json();
      // Apply server state
      setLocalPoll(prev => ({
        ...prev,
        options: prev.options.map(o => {
          const serverOpt = data.options.find((so: { id: string; votes: number }) => so.id === o.id);
          return serverOpt ? { ...o, votes: serverOpt.votes } : o;
        }),
        userVotes: data.userVotes,
      }));

      onVote(localPoll.id, data.userVotes);
    } catch {
      setLocalPoll(prevPoll);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] text-th-text-4 uppercase tracking-wider font-medium">
          Опрос {localPoll.multi ? '(несколько)' : ''}
        </span>
        {totalVotes > 0 && (
          <span className="text-[10px] text-th-text-4">
            {totalVotes} {getDeclension(totalVotes, 'голос', 'голоса', 'голосов')}
          </span>
        )}
      </div>
      {localPoll.options.map((option) => {
        const isSelected = localPoll.userVotes.includes(option.id);
        const pct = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => handleVote(option.id)}
            disabled={isVoting || !user}
            className={`relative w-full text-left rounded-lg px-3 py-2 text-sm transition-all overflow-hidden border ${
              isSelected
                ? 'border-[#0087ff]/40 bg-[#0087ff]/5'
                : 'border-th-border-2/50 hover:border-th-border-2 bg-th-card/50'
            } disabled:cursor-default`}
          >
            {/* Progress bar background */}
            {(hasVoted || !user) && (
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-300 rounded-lg ${
                  isSelected ? 'bg-[#0087ff]/10' : 'bg-th-elevated/30'
                }`}
                style={{ width: `${pct}%` }}
              />
            )}
            <div className="relative flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {user && (
                  <span className={`w-4 h-4 shrink-0 flex items-center justify-center rounded-${localPoll.multi ? 'sm' : 'full'} border ${
                    isSelected ? 'border-[#0087ff] bg-[#0087ff] text-white' : 'border-th-text-4/30'
                  }`}>
                    {isSelected && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                )}
                <span className={`truncate ${isSelected ? 'text-th-text font-medium' : 'text-th-text-2'}`}>
                  {option.text}
                </span>
              </div>
              {(hasVoted || !user) && (
                <span className={`text-xs shrink-0 ${isSelected ? 'text-[#0087ff] font-medium' : 'text-th-text-4'}`}>
                  {pct}%
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

function getDeclension(count: number, one: string, few: string, many: string): string {
  const ld = count % 10, lt = count % 100;
  if (lt >= 11 && lt <= 19) return many;
  if (ld === 1) return one;
  if (ld >= 2 && ld <= 4) return few;
  return many;
}

export default PollBlock;
