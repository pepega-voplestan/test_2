import React, { useState, useCallback } from 'react';
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
  const [pendingVotes, setPendingVotes] = useState<string[]>([]);

  // Sync with parent when poll prop changes (SSE updates)
  const pollRef = React.useRef(poll);
  if (poll !== pollRef.current) {
    pollRef.current = poll;
    // Preserve local userVotes if user has already voted
    setLocalPoll(prev => ({
      ...poll,
      userVotes: prev.userVotes.length > 0 ? prev.userVotes : poll.userVotes,
    }));
  }

  const totalVotes = localPoll.options.reduce((sum, o) => sum + o.votes, 0);
  const hasVoted = localPoll.userVotes.length > 0;

  const submitVote = useCallback(async (optionIds: string[]) => {
    if (isVoting || !user || optionIds.length === 0 || hasVoted) return;

    setIsVoting(true);

    // Optimistic update
    const prevPoll = localPoll;
    const nextOptions = localPoll.options.map(o => ({
      ...o,
      votes: optionIds.includes(o.id) ? o.votes + 1 : o.votes,
    }));
    setLocalPoll({ ...localPoll, options: nextOptions, userVotes: optionIds, totalVoters: localPoll.totalVoters + 1 });

    try {
      const res = await fetch(`/api/v1/polls/${localPoll.id}/vote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds }),
      });

      if (!res.ok) {
        setLocalPoll(prevPoll);
        setPendingVotes([]);
        return;
      }

      const data = await res.json();
      setLocalPoll(prev => ({
        ...prev,
        options: prev.options.map(o => {
          const serverOpt = data.options.find((so: { id: string; votes: number }) => so.id === o.id);
          return serverOpt ? { ...o, votes: serverOpt.votes } : o;
        }),
        userVotes: data.userVotes,
      }));
      setPendingVotes([]);
      onVote(localPoll.id, data.userVotes);
    } catch {
      setLocalPoll(prevPoll);
      setPendingVotes([]);
    } finally {
      setIsVoting(false);
    }
  }, [isVoting, user, hasVoted, localPoll, onVote]);

  const togglePending = (optionId: string) => {
    if (hasVoted || isVoting || !user) return;

    if (localPoll.multi) {
      setPendingVotes(prev =>
        prev.includes(optionId)
          ? prev.filter(id => id !== optionId)
          : [...prev, optionId]
      );
    } else {
      // Single-select: auto-submit immediately
      submitVote([optionId]);
    }
  };

  const confirmVote = async () => {
    await submitVote(pendingVotes);
  };

  // When user has pending selections, preview with their votes included
  const previewTotal = pendingVotes.length > 0 ? totalVotes + pendingVotes.length : totalVotes;
  const canVote = user && !hasVoted;

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-xs text-th-text-3 font-bold">
          Опрос
        </span>
        {localPoll.totalVoters > 0 && (
          <span className="text-xs text-th-text-4">
            {localPoll.totalVoters} {getDeclension(localPoll.totalVoters, 'проголосовавший', 'проголосовавших', 'проголосовавших')}
          </span>
        )}
      </div>
      {localPoll.options.map((option) => {
        const isSelected = hasVoted
          ? localPoll.userVotes.includes(option.id)
          : pendingVotes.includes(option.id);
        const displayVotes = isSelected && !hasVoted ? option.votes + 1 : option.votes;
        const displayTotal = pendingVotes.length > 0 ? previewTotal : totalVotes;
        const pct = displayTotal > 0
          ? Math.round((displayVotes / displayTotal) * 100)
          : 0;

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => togglePending(option.id)}
            disabled={isVoting || !user || hasVoted}
            className={`relative w-full text-left rounded-lg px-3 py-2 text-sm transition-all overflow-hidden border ${
              isSelected
                ? 'border-[#0087ff]/40 bg-[#0087ff]/5'
                : 'border-th-border-2/50 hover:border-th-border-2 bg-th-card/50'
            } ${hasVoted ? 'cursor-default' : ''} disabled:cursor-default`}
          >
            {/* Progress bar background — always visible when there are votes */}
            {(displayTotal > 0) && (
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-300 rounded-lg ${
                  isSelected ? 'bg-[#0087ff]/20' : 'bg-th-text/10'
                }`}
                style={{ width: `${pct}%` }}
              />
            )}
            <div className="relative flex flex-col gap-0.5">
              <div className="flex items-start gap-2">
                {canVote && localPoll.multi && (
                  <span className={`w-4 h-4 mt-0.5 shrink-0 flex items-center justify-center rounded-sm border ${
                    isSelected ? 'border-[#0087ff] bg-[#0087ff] text-white' : 'border-th-text-4/30'
                  }`}>
                    {isSelected && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                )}
                <span className={`break-all ${isSelected ? 'text-th-text font-medium' : 'text-th-text-2'}`}>
                  {option.text}
                </span>
              </div>
              {displayTotal > 0 && (
                <span className={`flex items-center gap-1.5 text-xs self-end ${isSelected ? 'text-[#0087ff] font-medium' : 'text-th-text-3'}`}>
                  {displayVotes} / <span className="font-bold">{pct}%</span>
                </span>
              )}
            </div>
          </button>
        );
      })}

      {/* Confirm vote button — only for multi-select */}
      {user && !hasVoted && localPoll.multi && pendingVotes.length > 0 && (
        <button
          type="button"
          onClick={confirmVote}
          disabled={isVoting}
          className="mt-1 text-sm font-bold px-3 py-1 rounded bg-th-card text-th-text-2 border border-th-border shadow-sm hover:bg-th-elevated active:bg-th-elevated transition-colors disabled:opacity-50 self-start"
        >
          {isVoting ? '...' : 'Подтвердить голос(а)'}
        </button>
      )}
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
