import React, { useEffect, useRef } from 'react';
import {
  COMMENT_FEED_MOBILE_MQ,
  COMMENT_FEED_SIDEBAR_WIDTH_PX,
  useCommentFeed,
  type CommentFeedItem,
} from '../context/CommentFeedContext';
import { navigateTo } from '../hooks/useRoute';
import { MEDIA_LABEL } from '../utils/commentFeedPreview';
import { formatCommentFeedTime } from '../utils/commentFeedTime';
import { renderCommentContent } from '../utils/renderContent';

const STICK_TOP_PX = 48;

function isMobileFeedLayout(): boolean {
  try {
    return window.matchMedia(COMMENT_FEED_MOBILE_MQ).matches;
  } catch {
    return false;
  }
}

function MediaLabel({ href, onNavigate }: { href?: string; onNavigate?: (href: string) => void }) {
  if (!href) {
    return <span className="inline-block mt-1 text-xs font-medium text-th-text-4">{MEDIA_LABEL}</span>;
  }
  return (
    <button
      type="button"
      className="inline-block mt-1 text-xs font-medium text-th-text-4 hover:text-th-text-2 hover:underline underline-offset-2 text-left"
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
      className="flex items-center gap-3 px-3 py-1 rounded-lg cursor-pointer w-full text-left bg-th-text-4/40 text-th-text-4 hover:bg-th-text-4/50 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
        />
        <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
      </svg>
      <span className="text-xs">Контент от этого пользователя скрыт</span>
    </button>
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
      <div className="overflow-hidden text-ellipsis whitespace-nowrap w-full">{item.shoutPreview}</div>
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
      className="block px-4 py-3.5 rounded-xl mb-3 bg-th-feed"
      data-testid="comment-feed-row"
      data-comment-id={item.id}
    >
      <a
        href={shoutHref}
        className="flex flex-col gap-1.5 no-underline text-th-text-4 text-xs font-normal mb-2.5 px-2 py-1 rounded bg-th-inset/40 hover:bg-th-inset/70"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onNavigate(shoutHref);
        }}
      >
        {quoteBody}
        {item.shoutHasMedia && <MediaLabel />}
      </a>

      <div className="border-l-2 border-th-border-2 pl-4">
        {softHidden ? (
          <IgnoreOverlay onReveal={onReveal} />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1 min-w-0">
              {item.userId ? (
                <a
                  href={`/profile/${item.userId}`}
                  title="Открыть профиль"
                  className="text-sm font-bold text-th-text-2 truncate max-w-[70%] hover:underline underline-offset-2"
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    onNavigate(`/profile/${item.userId}`);
                  }}
                >
                  {item.name || '…'}
                </a>
              ) : (
                <span className="text-sm font-bold text-th-text-2 truncate max-w-[70%]">
                  {item.name || '…'}
                </span>
              )}
              <span className="text-xs text-th-text-4 shrink-0" title={item.timestamp}>
                {formatCommentFeedTime(item.timestamp)}
              </span>
            </div>

            {item.content ? (
              <div
                role="link"
                tabIndex={0}
                className="text-th-text-2 text-[15px] font-normal leading-relaxed break-words whitespace-pre-wrap cursor-pointer line-clamp-4"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  const t = e.target as HTMLElement;
                  if (t.closest('a, [title="Нажмите, чтобы раскрыть спойлер"], [title="Нажмите, чтобы скрыть"]')) {
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
                {renderCommentContent(item.content)}
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

  const onNavigate = (href: string) => {
    if (isMobileFeedLayout() && panelOpen) setPanelOpen(false);
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
