import React from 'react';

/** Click-to-reveal inline spoiler — same UX as ShoutCard. */
export const InlineSpoiler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [revealed, setRevealed] = React.useState(false);
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setRevealed((r) => !r);
      }}
      className={`inline rounded px-0.5 cursor-pointer transition-all duration-200 ${
        revealed
          ? 'bg-th-text-4/20 text-inherit'
          : 'bg-th-text-4/40 text-transparent select-none hover:bg-th-text-4/50'
      }`}
      title={revealed ? 'Нажмите, чтобы скрыть' : 'Нажмите, чтобы раскрыть спойлер'}
    >
      {children}
    </span>
  );
};

type RenderInlineOptions = {
  /** When false, http(s) URLs stay plain text (comments feed sidebar). Default true. */
  linkifyUrls?: boolean;
  /**
   * Sidebar: SPA-navigate mentions via this callback (preventDefault) so desktop
   * can keep the panel open; mobile callers close the overlay themselves.
   */
  onMentionNavigate?: (href: string) => void;
};

function renderMentionsAndUrls(
  text: string,
  keyPrefix: string,
  options: RenderInlineOptions = {},
): React.ReactNode[] {
  const linkifyUrls = options.linkifyUrls !== false;
  const onMentionNavigate = options.onMentionNavigate;
  const parts = text.split(/((?:@\[[^\]]+:[^\]]+\])|(?:@[a-zA-Z0-9_-]+)|(?:https?:\/\/[^\s]+))/);
  return parts.map((part, i) => {
    if (!part) return null;
    const mentionMatch = part.match(/^@\[([^\]]+):([^\]]+)\]$/);
    if (mentionMatch) {
      const [, name, id] = mentionMatch;
      const href = `/profile/${id}`;
      return (
        <a
          key={`${keyPrefix}-${i}`}
          href={href}
          className="text-blue-400 hover:underline font-medium"
          onClick={(e) => {
            e.stopPropagation();
            if (!onMentionNavigate) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            onMentionNavigate(href);
          }}
        >
          @{name}
        </a>
      );
    }
    if (/^https?:\/\//.test(part)) {
      if (!linkifyUrls) {
        return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
      }
      return (
        <a
          key={`${keyPrefix}-${i}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-500 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    if (/^@[a-zA-Z0-9_-]+$/.test(part)) {
      return (
        <span key={`${keyPrefix}-${i}`} className="text-sky-500">
          {part}
        </span>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
  });
}

/** Comment/shout body: spoilers + mentions + URLs (no truncation). */
export function renderCommentContent(
  text: string,
  options: RenderInlineOptions = {},
): React.ReactNode {
  const spoilerParts = String(text || '').split(/(\|\|[\s\S]*?\|\|)/);
  return spoilerParts.map((spoilerPart, si) => {
    const spoilerMatch = spoilerPart.match(/^\|\|([\s\S]*?)\|\|$/);
    if (spoilerMatch) {
      return (
        <InlineSpoiler key={`sp-${si}`}>
          {renderMentionsAndUrls(spoilerMatch[1], `sp-${si}`, options)}
        </InlineSpoiler>
      );
    }
    return (
      <React.Fragment key={`p-${si}`}>
        {renderMentionsAndUrls(spoilerPart, `${si}`, options)}
      </React.Fragment>
    );
  });
}

/** Sidebar feed: spoilers + mentions, URLs as plain text. */
export function renderCommentFeedContent(
  text: string,
  onMentionNavigate?: (href: string) => void,
): React.ReactNode {
  return renderCommentContent(text, { linkifyUrls: false, onMentionNavigate });
}
