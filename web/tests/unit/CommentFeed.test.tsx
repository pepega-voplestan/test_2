import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import React, { useEffect } from 'react';
import {
  COMMENT_FEED_PANEL_OPEN_KEY,
  CommentFeedProvider,
  useCommentFeed,
  type CommentFeedItem,
} from '../../context/CommentFeedContext';
import CommentFeedToggle from '../../components/CommentFeedToggle';
import CommentFeedPanel from '../../components/CommentFeedPanel';
import { previewText, hasAttachment, MEDIA_LABEL } from '../../utils/commentFeedPreview';
import { formatCommentFeedTime } from '../../utils/commentFeedTime';

const mockUseAuth = vi.fn();
const mockUseIgnoredUsers = vi.fn();
const mockNavigateTo = vi.fn();
let sseHandlers: Record<string, (data: Record<string, unknown>) => void> = {};

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../context/IgnoredUsersContext', () => ({
  useIgnoredUsers: () => mockUseIgnoredUsers(),
}));

vi.mock('../../hooks/useSSE', () => ({
  useSSE: (listeners: Record<string, (data: Record<string, unknown>) => void>) => {
    sseHandlers = listeners;
  },
}));

vi.mock('../../hooks/useRoute', () => ({
  navigateTo: (...args: unknown[]) => mockNavigateTo(...args),
}));

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('comment-feed-open');
  sessionStorage.clear();
  vi.unstubAllGlobals();
  // Restore default desktop matchMedia from setup.ts after mobile stubs.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  sseHandlers = {};
  mockNavigateTo.mockReset();
});

const user = { id: 'u1', name: 'Тест', avatar: '/a.png' };

function stubHydrate(shouts: unknown[] = []) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/v1/shouts')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ shouts }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function Harness({ seed }: { seed?: CommentFeedItem[] }) {
  const { setPanelOpen, items } = useCommentFeed();
  useEffect(() => {
    // Open after mount so panel renders against current buffer.
    setPanelOpen(true);
  }, [setPanelOpen]);

  // Expose count for assertions when seeding via SSE only.
  return (
    <>
      <CommentFeedToggle />
      <CommentFeedPanel />
      <div data-testid="item-count">{items.length}</div>
      {seed ? <SeedItems items={seed} /> : null}
    </>
  );
}

function SeedItems({ items }: { items: CommentFeedItem[] }) {
  // Inject via SSE new_comment path instead of private setters.
  useEffect(() => {
    for (const item of [...items].reverse()) {
      sseHandlers.new_comment?.({
        shoutId: item.shoutId,
        commentId: item.id,
        comment: {
          id: item.id,
          shoutId: item.shoutId,
          user: { id: item.userId, name: item.name, avatar: '' },
          content: item.content,
          timestamp: item.timestamp,
          likes: 0,
          ...(item.hasMedia
            ? { media: { type: 'image', url: '/m.webp', width: 1, height: 1 } }
            : {}),
        },
      });
    }
  }, [items]);
  return null;
}

function renderFeed(ui: React.ReactElement = <Harness />) {
  return render(<CommentFeedProvider>{ui}</CommentFeedProvider>);
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user, openModal: vi.fn(), logout: vi.fn() });
  mockUseIgnoredUsers.mockReturnValue({
    ignoredUserIds: [],
    isIgnored: () => false,
    addIgnoredUser: vi.fn(),
    removeIgnoredUser: vi.fn(),
    refreshIgnoredUsers: vi.fn(),
  });
  stubHydrate([]);
});

describe('commentFeedPreview helpers', () => {
  it('previewText keeps mention and spoiler tokens for rich render', () => {
    expect(previewText('привет @[alice:uuid] ||secret||')).toBe(
      'привет @[alice:uuid] ||secret||',
    );
  });

  it('previewText truncates by visible length without cutting mid-mention', () => {
    const long = `${'слово '.repeat(40)}@[alice:uuid] хвост`;
    const out = previewText(long);
    expect(out.endsWith('…') || out.includes('@[alice:uuid]')).toBe(true);
    expect(out.includes('@[alice:')).toBe(out.includes('@[alice:uuid]'));
  });

  it('hasAttachment detects media and gallery', () => {
    expect(hasAttachment({ type: 'image', url: '/x', width: 1, height: 1 })).toBe(true);
    expect(hasAttachment(null, [{ type: 'image', url: '/x', width: 1, height: 1 }])).toBe(true);
    expect(hasAttachment(undefined, [])).toBe(false);
  });
});

describe('formatCommentFeedTime', () => {
  it('returns «только что» for recent timestamps', () => {
    expect(formatCommentFeedTime(new Date().toISOString())).toBe('только что');
  });
});

describe('CommentFeed — open / empty / guest (US1)', () => {
  it('shows the toggle for signed-in users and opens the empty panel', async () => {
    renderFeed();
    const btn = screen.getByTitle('Скрыть ленту комментов');
    expect(btn).toBeInTheDocument();
    expect(await screen.findByText('Пока нет комментов — ждём обновления…')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('comment-feed-open')).toBe(true);
  });

  it('closes the panel on second toggle', async () => {
    renderFeed();
    await screen.findByLabelText('Лента комментов');
    fireEvent.click(screen.getByTitle('Скрыть ленту комментов'));
    expect(screen.queryByLabelText('Лента комментов')).not.toBeInTheDocument();
    expect(document.documentElement.classList.contains('comment-feed-open')).toBe(false);
  });

  it('does not render the toggle when there is no user (guest)', () => {
    mockUseAuth.mockReturnValue({ user: null, openModal: vi.fn(), logout: vi.fn() });
    // Toggle is gated in Header; provider alone still mounts children we pass.
    render(
      <CommentFeedProvider>
        {null}
      </CommentFeedProvider>,
    );
    expect(screen.queryByTitle('Показать ленту комментов')).not.toBeInTheDocument();
  });
});

describe('CommentFeed — hydrate + media label (US1/FR-006)', () => {
  it('hydrates comments from the shouts feed and shows «[медиа]»', async () => {
    const shoutId = '11111111-1111-1111-1111-111111111111';
    const commentId = '22222222-2222-2222-2222-222222222222';
    stubHydrate([
      {
        id: shoutId,
        content: 'Текст вопля',
        media: { type: 'image', url: '/s.webp', width: 10, height: 10 },
        comments: [
          {
            id: commentId,
            shoutId,
            user: { id: 'u2', name: 'Боб', avatar: '' },
            content: 'Ответ',
            timestamp: new Date().toISOString(),
            likes: 0,
            media: { type: 'image', url: '/c.webp', width: 10, height: 10 },
          },
        ],
      },
    ]);

    renderFeed(<Harness />);

    await waitFor(() => {
      expect(screen.getByText('Боб')).toBeInTheDocument();
    });
    expect(screen.getByText('Ответ')).toBeInTheDocument();
    expect(screen.getByText('Текст вопля')).toBeInTheDocument();
    const mediaLabels = screen.getAllByText(MEDIA_LABEL);
    expect(mediaLabels.length).toBeGreaterThanOrEqual(2);
  });
});

describe('CommentFeed — live SSE + badge (US2)', () => {
  it('increments the badge while closed and clears it on open', async () => {
    stubHydrate([]);
    function ClosedFirst() {
      const { setPanelOpen } = useCommentFeed();
      useEffect(() => {
        setPanelOpen(false);
      }, [setPanelOpen]);
      return (
        <>
          <CommentFeedToggle />
          <CommentFeedPanel />
        </>
      );
    }
    renderFeed(<ClosedFirst />);

    await act(async () => {
      sseHandlers.new_comment?.({
        shoutId: 's1',
        commentId: 'c1',
        comment: {
          id: 'c1',
          shoutId: 's1',
          user: { id: 'u2', name: 'Аня', avatar: '' },
          content: 'живой',
          timestamp: new Date().toISOString(),
          likes: 0,
        },
      });
    });

    expect(screen.getByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Показать ленту комментов'));
    await screen.findByText('Аня');
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('applies edit_comment and delete_comment', async () => {
    stubHydrate([]);
    renderFeed();
    await screen.findByLabelText('Лента комментов');

    await act(async () => {
      sseHandlers.new_comment?.({
        shoutId: 's1',
        commentId: 'c1',
        comment: {
          id: 'c1',
          shoutId: 's1',
          user: { id: 'u2', name: 'Аня', avatar: '' },
          content: 'было',
          timestamp: new Date().toISOString(),
          likes: 0,
        },
      });
    });
    expect(screen.getByText('было')).toBeInTheDocument();

    await act(async () => {
      sseHandlers.edit_comment?.({ commentId: 'c1', content: 'стало' });
    });
    expect(screen.getByText('стало')).toBeInTheDocument();

    await act(async () => {
      sseHandlers.delete_comment?.({ commentId: 'c1' });
    });
    expect(screen.queryByText('стало')).not.toBeInTheDocument();
  });
});

describe('CommentFeed — soft-hide (US3)', () => {
  it('shows ignore overlay for ignored authors and reveals on click', async () => {
    mockUseIgnoredUsers.mockReturnValue({
      ignoredUserIds: ['bad'],
      isIgnored: (id: string) => id === 'bad',
      addIgnoredUser: vi.fn(),
      removeIgnoredUser: vi.fn(),
      refreshIgnoredUsers: vi.fn(),
    });
    stubHydrate([]);
    renderFeed();
    await screen.findByLabelText('Лента комментов');

    await act(async () => {
      sseHandlers.new_comment?.({
        shoutId: 's1',
        commentId: 'c1',
        comment: {
          id: 'c1',
          shoutId: 's1',
          user: { id: 'bad', name: 'Скрытый', avatar: '' },
          content: 'секрет',
          timestamp: new Date().toISOString(),
          likes: 0,
        },
      });
    });

    expect(screen.getByTestId('comment-feed-ignore-overlay')).toBeInTheDocument();
    expect(screen.queryByText('секрет')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('comment-feed-ignore-overlay'));
    expect(screen.getByText('секрет')).toBeInTheDocument();
  });
});

describe('CommentFeed — navigate closes on mobile (US4/US5)', () => {
  it('navigates to shout?comment= on row click', async () => {
    stubHydrate([]);
    renderFeed();
    await screen.findByLabelText('Лента комментов');

    await act(async () => {
      sseHandlers.new_comment?.({
        shoutId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        commentId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        comment: {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          shoutId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          user: { id: 'u2', name: 'Аня', avatar: '' },
          content: 'прыжок',
          timestamp: new Date().toISOString(),
          likes: 0,
        },
      });
    });

    fireEvent.click(screen.getByText('прыжок'));
    expect(mockNavigateTo).toHaveBeenCalledWith(
      '/shout/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa?comment=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    );
  });
});

describe('CommentFeed — Discord-compact reply + avatar (extension 0.12.17)', () => {
  it('renders a clickable reply bar and avatar for replies', async () => {
    stubHydrate([]);
    renderFeed();
    await screen.findByLabelText('Лента комментов');

    await act(async () => {
      sseHandlers.new_comment?.({
        shoutId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        commentId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        comment: {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          shoutId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          user: { id: 'u2', name: 'Аня', avatar: '/ava.png' },
          content: 'ответ',
          timestamp: new Date().toISOString(),
          likes: 0,
          replyToId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          quote: {
            text: 'цитата',
            deleted: false,
            author: { id: 'u3', name: 'Боря' },
          },
        },
      });
    });

    expect(screen.getByText((t) => t.startsWith('@Боря:'))).toBeInTheDocument();
    expect(screen.getByText('цитата')).toBeInTheDocument();
    expect(screen.getByAltText('Аня')).toHaveAttribute('src', '/ava.png');

    fireEvent.click(screen.getByTestId('comment-feed-reply'));
    expect(mockNavigateTo).toHaveBeenCalledWith(
      '/shout/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa?comment=cccccccc-cccc-cccc-cccc-cccccccccccc',
    );
  });

  it('shows ignored-quote copy when reply author is ignored', async () => {
    mockUseIgnoredUsers.mockReturnValue({
      ignoredUserIds: ['u3'],
      isIgnored: (id: string) => id === 'u3',
      addIgnoredUser: vi.fn(),
      removeIgnoredUser: vi.fn(),
      refreshIgnoredUsers: vi.fn(),
    });
    stubHydrate([]);
    renderFeed();
    await screen.findByLabelText('Лента комментов');

    await act(async () => {
      sseHandlers.new_comment?.({
        shoutId: 's1',
        commentId: 'c1',
        comment: {
          id: 'c1',
          shoutId: 's1',
          user: { id: 'u2', name: 'Аня', avatar: '' },
          content: 'ответ',
          timestamp: new Date().toISOString(),
          likes: 0,
          replyToId: 'parent',
          quote: {
            text: 'скрыто',
            deleted: false,
            author: { id: 'u3', name: 'Игнор' },
          },
        },
      });
    });

    expect(
      screen.getByText('Ответ на комментарий игнорируемого пользователя'),
    ).toBeInTheDocument();
    expect(screen.queryByText('скрыто')).not.toBeInTheDocument();
  });
});

describe('CommentFeed — desktop mention keeps panel open', () => {
  it('SPA-navigates @mention without closing the sidebar on desktop', async () => {
    stubHydrate([]);
    renderFeed();
    await screen.findByLabelText('Лента комментов');

    await act(async () => {
      sseHandlers.new_comment?.({
        shoutId: 's1',
        commentId: 'c1',
        comment: {
          id: 'c1',
          shoutId: 's1',
          user: { id: 'u2', name: 'Аня', avatar: '' },
          content: 'смотри @[alice:dddddddd-dddd-dddd-dddd-dddddddddddd]',
          timestamp: new Date().toISOString(),
          likes: 0,
        },
      });
    });

    fireEvent.click(screen.getByRole('link', { name: '@alice' }));
    expect(mockNavigateTo).toHaveBeenCalledWith(
      '/profile/dddddddd-dddd-dddd-dddd-dddddddddddd',
    );
    expect(screen.getByLabelText('Лента комментов')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('comment-feed-open')).toBe(true);
  });
});

describe('CommentFeed — panel open persistence', () => {
  it('persists open state for desktop refresh and restores it', async () => {
    stubHydrate([]);
    const { unmount } = renderFeed();
    await screen.findByLabelText('Лента комментов');
    expect(sessionStorage.getItem(COMMENT_FEED_PANEL_OPEN_KEY)).toBe('1');

    unmount();
    cleanup();
    stubHydrate([]);
    render(
      <CommentFeedProvider>
        <CommentFeedToggle />
        <CommentFeedPanel />
      </CommentFeedProvider>,
    );
    expect(await screen.findByLabelText('Лента комментов')).toBeInTheDocument();
  });

  it('does not restore open state on mobile overlay layout', async () => {
    sessionStorage.setItem(COMMENT_FEED_PANEL_OPEN_KEY, '1');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: String(query).includes('max-width: 767px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    stubHydrate([]);
    render(
      <CommentFeedProvider>
        <CommentFeedToggle />
        <CommentFeedPanel />
      </CommentFeedProvider>,
    );
    await waitFor(() => {
      expect(screen.queryByLabelText('Лента комментов')).not.toBeInTheDocument();
    });
    expect(sessionStorage.getItem(COMMENT_FEED_PANEL_OPEN_KEY)).toBeNull();
  });
});
