import React, { useEffect, useRef, useState } from 'react';
import {
  COMMENT_FEED_SIDEBAR_WIDTH_PX,
  isCommentFeedMobileLayout,
  useCommentFeed,
  type CommentFeedItem,
} from '../context/CommentFeedContext';
import { useIgnoredUsers } from '../context/IgnoredUsersContext';
import { navigateTo } from '../hooks/useRoute';
import type { CommentQuote } from '../types';
import { MEDIA_LABEL } from '../utils/commentFeedPreview';
import { formatCommentFeedTime } from '../utils/commentFeedTime';
import { renderCommentFeedContent } from '../utils/renderContent';

const STICK_TOP_PX = 48;

function MediaLabel({
  href,
  onNavigate,
  className = '',
}: {
  href?: string;
  onNavigate?: (href: string) => void;
  className?: string;
}) {
  const base =
    'inline-block mt-[0.1875rem] text-[0.5625rem] leading-3 font-medium text-th-text-4';
  if (!href) {
    return <span className={`${base} ${className}`.trim()}>{MEDIA_LABEL}</span>;
  }
  return (
    <button
      type="button"
      className={`${base} hover:text-th-text-2 hover:underline underline-offset-2 text-left ${className}`.trim()}
      title="Перейти к комментарию"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (onNavigate || navigateTo)(href);
      }}
    >
      {MEDIA_LABEL}
    </button>
  );
}

function IgnoreOverlay({ onReveal }: { onReveal: () => void }) {
  return (
    <button
      type="button"
      data-testid="comment-feed-ignore-overlay"
      title="Нажмите, чтобы показать"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onReveal();
      }}
      className="flex items-center gap-[0.5625rem] px-[0.5625rem] py-[0.1875rem] rounded-[0.375rem] cursor-pointer w-full text-left bg-th-text-4/40 text-th-text-4 hover:bg-th-text-4/50 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 shrink-0" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
        />
        <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
      </svg>
      <span className="text-[0.5625rem] leading-3">Контент от этого пользователя скрыт</span>
    </button>
  );
}

function FeedAvatar({
  item,
  onNavigate,
}: {
  item: CommentFeedItem;
  onNavigate: (href: string) => void;
}) {
  const initial = (item.name || '?').trim().charAt(0).toUpperCase() || '?';
  const [broken, setBroken] = useState(false);
  const showImg = Boolean(item.avatar) && !broken;

  const inner = showImg ? (
    <img
      src={item.avatar}
      alt={item.name || ''}
      decoding="async"
      className="w-full h-full object-cover block"
      onError={() => setBroken(true)}
    />
  ) : (
    <span className="text-[0.375rem] leading-none font-bold text-th-text-4 select-none">{initial}</span>
  );

  const className =
    'shrink-0 w-[0.65625rem] h-[0.65625rem] rounded-full overflow-hidden bg-th-input flex items-center justify-center no-underline';

  if (!item.userId) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <a
      href={`/profile/${item.userId}`}
      title="Открыть профиль"
      className={`${className} hover:ring-1 hover:ring-th-border`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate(`/profile/${item.userId}`);
      }}
    >
      {inner}
    </a>
  );
}

function FeedReplyQuote({
  shoutId,
  replyToId,
  quote,
  onNavigate,
}: {
  shoutId: string;
  replyToId: string | null;
  quote: CommentQuote | null;
  onNavigate: (href: string) => void;
}) {
  const { isIgnored } = useIgnoredUsers();
  if (!replyToId && !quote) return null;

  const authorId = quote?.author?.id || '';
  const quoteIgnored = Boolean(authorId && isIgnored(authorId));
  const clickable = Boolean(replyToId && quote && !quote.deleted && !quoteIgnored);

  let body: React.ReactNode;
  if (quoteIgnored) {
    body = (
      <span className="italic overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
        Ответ на комментарий игнорируемого пользователя
      </span>
    );
  } else if (!quote || quote.deleted) {
    body = (
      <span className="italic overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
        Комментарий удалён
      </span>
    );
  } else {
    body = (
      <>
        {quote.author?.name ? (
          <span className="shrink-0 font-semibold text-blue-400">@{quote.author.name}:&nbsp;</span>
        ) : null}
        <span
          className={`overflow-hidden text-ellipsis whitespace-nowrap min-w-0 ${
            quote.mediaOnly ? 'italic' : ''
          }`}
        >
          {quote.text || ''}
        </span>
      </>
    );
  }

  const className =
    'flex items-center gap-[0.1875rem] pr-[0.375rem] mb-[0.2625rem] rounded-[0.1875rem] bg-th-inset/40 text-th-text-4 text-[0.5625rem] leading-3 overflow-hidden max-w-full w-full box-border text-left border-0';

  const icon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0 w-[0.5625rem] h-[0.5625rem] opacity-50 block"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
      />
    </svg>
  );

  const content = (
    <>
      {icon}
      <div className="flex items-baseline min-w-0 overflow-hidden flex-1">{body}</div>
    </>
  );

  if (clickable && replyToId) {
    return (
      <button
        type="button"
        data-testid="comment-feed-reply"
        title="Перейти к комментарию"
        className={`${className} cursor-pointer hover:bg-th-inset/70`}
        style={{ WebkitTapHighlightColor: 'transparent' }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onNavigate(`/shout/${shoutId}?comment=${replyToId}`);
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} data-testid="comment-feed-reply">
      {content}
    </div>
  );
}

function FeedRow({
  item,
  softHidden,
  onReveal,
  onNavigate,
  metaResolved,
}: {
  item: CommentFeedItem;
  softHidden: boolean;
  onReveal: () => void;
  onNavigate: (href: string) => void;
  metaResolved: boolean;
}) {
  const commentHref = `/shout/${item.shoutId}?comment=${item.id}`;
  const shoutHref = `/shout/${item.shoutId}`;

  let quoteBody: React.ReactNode;
  if (item.shoutPreview) {
    quoteBody = (
      <div className="overflow-hidden text-ellipsis whitespace-nowrap w-full direction-ltr [unicode-bidi:isolate]">
        {renderCommentFeedContent(item.shoutPreview, onNavigate)}
      </div>
    );
  } else if (item.shoutHasMedia) {
    quoteBody = null;
  } else if (metaResolved) {
    quoteBody = <div className="overflow-hidden text-ellipsis whitespace-nowrap w-full">—</div>;
  } else {
    quoteBody = <div className="overflow-hidden whitespace-nowrap w-full">&nbsp;</div>;
  }

  return (
    <article
      className="block px-3 py-[10.5px] rounded-[0.5625rem] mb-3 bg-th-feed"
      data-testid="comment-feed-row"
      data-comment-id={item.id}
    >
      <div
        role="link"
        tabIndex={0}
        data-testid="comment-feed-shout-quote"
        className="flex flex-col gap-[0.2625rem] no-underline text-th-text-4 text-[0.5625rem] leading-3 font-normal mb-[7.5px] px-[0.375rem] py-[0.1875rem] rounded-[0.1875rem] bg-th-inset/40 hover:bg-th-inset/70 cursor-pointer"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          const t = e.target as HTMLElement;
          if (
            t.closest(
              'a, [title="Нажмите, чтобы раскрыть спойлер"], [title="Нажмите, чтобы скрыть"]',
            )
          ) {
            return;
          }
          e.preventDefault();
          onNavigate(shoutHref);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          const t = e.target as HTMLElement;
          if (
            t.closest(
              'a, [title="Нажмите, чтобы раскрыть спойлер"], [title="Нажмите, чтобы скрыть"]',
            )
          ) {
            return;
          }
          e.preventDefault();
          onNavigate(shoutHref);
        }}
      >
        {quoteBody}
        {item.shoutHasMedia && <MediaLabel className="mt-0" />}
      </div>

      <div className="border-l-[1.5px] border-th-border-2 pl-3">
        {softHidden ? (
          <IgnoreOverlay onReveal={onReveal} />
        ) : (
          <>
            <FeedReplyQuote
              shoutId={item.shoutId}
              replyToId={item.replyToId}
              quote={item.quote}
              onNavigate={onNavigate}
            />

            <div className="flex items-center gap-[0.375rem] mb-[0.2625rem] min-w-0">
              <FeedAvatar item={item} onNavigate={onNavigate} />
              <div className="flex-1 min-w-0 flex items-baseline flex-wrap gap-[0.375rem]">
                {item.userId ? (
                  <a
                    href={`/profile/${item.userId}`}
                    title="Открыть профиль"
                    className="text-[0.65625rem] leading-[0.9375rem] font-bold text-th-text-2 truncate max-w-[70%] hover:underline underline-offset-2"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      e.preventDefault();
                      onNavigate(`/profile/${item.userId}`);
                    }}
                  >
                    {item.name || '…'}
                  </a>
                ) : (
                  <span className="text-[0.65625rem] leading-[0.9375rem] font-bold text-th-text-2 truncate max-w-[70%]">
                    {item.name || '…'}
                  </span>
                )}
                <span
                  className="text-[0.5625rem] leading-3 text-th-text-4 shrink-0"
                  title={item.timestamp}
                >
                  {formatCommentFeedTime(item.timestamp)}
                </span>
              </div>
            </div>

            {item.content ? (
              <div
                role="link"
                tabIndex={0}
                className="text-th-text-2 text-[11.25px] font-normal leading-relaxed break-words whitespace-pre-wrap cursor-pointer line-clamp-4 direction-ltr [unicode-bidi:isolate]"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  const t = e.target as HTMLElement;
                  if (
                    t.closest(
                      'a, [title="Нажмите, чтобы раскрыть спойлер"], [title="Нажмите, чтобы скрыть"]',
                    )
                  ) {
                    return;
                  }
                  onNavigate(commentHref);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate(commentHref);
                  }
                }}
              >
                {renderCommentFeedContent(item.content, onNavigate)}
              </div>
            ) : null}

            {item.hasMedia ? <MediaLabel href={commentHref} onNavigate={onNavigate} /> : null}
          </>
        )}
      </div>
    </article>
  );
}

const CommentFeedPanel: React.FC = () => {
  const {
    panelOpen,
    setPanelOpen,
    items,
    stickToTop,
    setStickToTop,
    isSoftHidden,
    revealIgnored,
    shoutMetaResolved,
  } = useCommentFeed();

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen || !stickToTop) return;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [panelOpen, stickToTop, items]);

  // Close overlay only on mobile — desktop keeps the sidebar while navigating.
  const onNavigate = (href: string) => {
    if (isCommentFeedMobileLayout() && panelOpen) setPanelOpen(false);
    navigateTo(href);
  };

  const onListScroll = () => {
    const list = listRef.current;
    if (!list) return;
    setStickToTop(list.scrollTop <= STICK_TOP_PX);
  };

  const jumpToNewest = () => {
    setStickToTop(true);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  if (!panelOpen) return null;

  return (
    <>
      <style>{`
        html.comment-feed-open {
          --comment-feed-width: ${COMMENT_FEED_SIDEBAR_WIDTH_PX}px;
        }
        html.comment-feed-open main {
          margin-right: var(--comment-feed-width);
        }
        @media (max-width: 767px) {
          html.comment-feed-open {
            --comment-feed-width: 100%;
            overflow: hidden;
          }
          html.comment-feed-open main {
            margin-right: 0;
            visibility: hidden;
            pointer-events: none;
          }
          #comment-feed-panel {
            left: 0;
            width: 100%;
            border-left: 0;
            z-index: 45;
          }
        }
      `}</style>

      <aside
        id="comment-feed-panel"
        aria-label="Лента комментов"
        className="fixed top-[52px] right-0 bottom-0 z-40 flex flex-col bg-th-page border-l border-th-border text-th-text"
        style={{ width: `var(--comment-feed-width, ${COMMENT_FEED_SIDEBAR_WIDTH_PX}px)` }}
      >
        <div className="relative flex flex-col flex-1 min-h-0">
          {!stickToTop && items.length > 0 && (
            <button
              type="button"
              onClick={jumpToNewest}
              className="absolute left-1/2 top-2.5 -translate-x-1/2 z-[2] inline-flex border border-th-border bg-th-elevated text-th-text rounded-full px-3 py-1.5 text-xs cursor-pointer shadow-md whitespace-nowrap"
            >
              К новым ↑
            </button>
          )}

          <div
            ref={listRef}
            data-testid="comment-feed-list"
            className="flex-1 overflow-y-auto overscroll-contain p-2 min-h-0"
            onScroll={onListScroll}
          >
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-th-text-4 text-[13px]">
                Пока нет комментов — ждём обновления…
              </div>
            ) : (
              items.map((item) => (
                <FeedRow
                  key={item.id}
                  item={item}
                  softHidden={isSoftHidden(item)}
                  onReveal={() => revealIgnored(item.id)}
                  onNavigate={onNavigate}
                  metaResolved={shoutMetaResolved(item.shoutId)}
                />
              ))
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default CommentFeedPanel;
