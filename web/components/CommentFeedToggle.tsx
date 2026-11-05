import React from 'react';
import { useCommentFeed } from '../context/CommentFeedContext';

const CommentFeedToggle: React.FC = () => {
  const { panelOpen, togglePanel, unseenWhileClosed } = useCommentFeed();
  const badge =
    !panelOpen && unseenWhileClosed > 0
      ? unseenWhileClosed > 9
        ? '9+'
        : String(unseenWhileClosed)
      : null;

  return (
    <div className="relative inline-flex items-center justify-center leading-none align-middle">
      <button
        type="button"
        title={panelOpen ? 'Скрыть ленту комментов' : 'Показать ленту комментов'}
        aria-pressed={panelOpen}
        onClick={togglePanel}
        className={`relative p-2 transition-colors ${
          panelOpen ? 'text-th-text' : 'hover:text-th-text'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z"
          />
        </svg>
        {badge && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-none flex items-center justify-center pointer-events-none">
            {badge}
          </span>
        )}
      </button>
    </div>
  );
};

export default CommentFeedToggle;
