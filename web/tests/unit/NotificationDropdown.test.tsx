import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationDropdown from '../../components/NotificationDropdown';
import { navigateTo, goBack } from '../../hooks/useRoute';

const mockUseNotifications = vi.fn();
vi.mock('../../context/NotificationsContext', () => ({
  useNotifications: () => mockUseNotifications(),
}));

afterEach(cleanup);

const FOOTER_TEXT = 'Хотите чтобы вопли жили? Поддержать проект можно здесь:';

function baseNotificationsContext() {
  return {
    sortedNotifications: [],
    unreadCount: 0,
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    flushReads: vi.fn(),
  };
}

function stubAnnouncementsFetch(items: Array<{ id: string; title: string; content: string; createdAt: string }>) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ items }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openAnnouncementsTab(fetchMock: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByTitle('Уведомления'));
  fireEvent.click(screen.getByText('Объявления'));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
}

beforeEach(() => {
  mockUseNotifications.mockReturnValue(baseNotificationsContext());
});

describe('NotificationDropdown — donation footer (US1: FR-001..FR-004, FR-009, FR-010)', () => {
  it('shows the donation footer on the Объявления tab when announcements exist', async () => {
    const fetchMock = stubAnnouncementsFetch([{ id: '1', title: 'Заголовок', content: 'Текст', createdAt: new Date().toISOString() }]);
    render(<NotificationDropdown />);
    await openAnnouncementsTab(fetchMock);
    await screen.findByText('Заголовок');

    expect(screen.getByText(FOOTER_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Поддержать' })).toBeInTheDocument();
  });

  it('still shows the donation footer when the announcement list is empty (FR-010)', async () => {
    const fetchMock = stubAnnouncementsFetch([]);
    render(<NotificationDropdown />);
    await openAnnouncementsTab(fetchMock);
    await screen.findByText('Нет объявлений');

    expect(screen.getByText(FOOTER_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Поддержать' })).toBeInTheDocument();
  });

  it('does not show the donation footer on the Уведомления tab (FR-009)', () => {
    render(<NotificationDropdown />);
    fireEvent.click(screen.getByTitle('Уведомления'));
    expect(screen.queryByText(FOOTER_TEXT)).not.toBeInTheDocument();
  });

  it('opens the donation widget preview when the footer button is clicked (FR-005)', async () => {
    const fetchMock = stubAnnouncementsFetch([]);
    render(<NotificationDropdown />);
    await openAnnouncementsTab(fetchMock);
    await screen.findByText('Нет объявлений');

    fireEvent.click(screen.getByRole('button', { name: 'Поддержать' }));
    expect(await screen.findByTitle('Поддержать проект')).toBeInTheDocument();
  });
});

describe('NotificationDropdown — notification click navigation (Назад bugfix)', () => {
  beforeEach(() => {
    // A non-empty notification list renders the dropdown's own
    // IntersectionObserver-based pagination sentinel, which jsdom doesn't
    // implement natively.
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    history.replaceState(null, '', '/');
  });

  function notificationsWithShout() {
    return {
      ...baseNotificationsContext(),
      sortedNotifications: [{
        id: 'n1',
        type: 'mention' as const,
        actor: { id: 'u1', name: 'Alice', avatar: '' },
        shoutId: 'shout-abc',
        commentId: null,
        isRead: false,
        timestamp: new Date().toISOString(),
      }],
    };
  }

  it('navigates exactly once per click — App.tsx global handler must not also fire (regression: Назад needed 2 clicks)', () => {
    mockUseNotifications.mockReturnValue(notificationsWithShout());
    render(<NotificationDropdown />);
    fireEvent.click(screen.getByTitle('Уведомления'));

    const pushSpy = vi.spyOn(history, 'pushState');
    fireEvent.click(screen.getByText(/упомянул вас/));

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/shout/shout-abc');
    pushSpy.mockRestore();
  });

  it('one Назад click (goBack) is enough to return to the page open before the notification — even with App.tsx\'s global <a> interceptor also listening', async () => {
    // The test above renders NotificationDropdown alone, so nothing else on
    // `document` competes for the click — it would pass even without
    // stopPropagation(), since there'd be no second navigateTo() call to
    // suppress. Reproduce App.tsx's own document-level interceptor here
    // (simplified: same shape, minus the modifier-key/href-prefix guards
    // this test doesn't need) so the double-push bug scenario is actually
    // exercised end-to-end, through goBack()'s real (unmocked) history.back()
    // — mocking it, as the sibling test above and useRoute.test.ts's goBack
    // suite both do, would only prove goBack() is CALLED once, not that one
    // call is enough to actually land back on the origin page: with the
    // double-push bug, goBack() still only ever calls history.back() once
    // per invocation, it's just that one call isn't enough (see comment
    // below).
    const globalAnchorInterceptor = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('/')) return;
      e.preventDefault();
      navigateTo(href);
    };
    document.addEventListener('click', globalAnchorInterceptor);

    history.replaceState(null, '', '/');
    mockUseNotifications.mockReturnValue(notificationsWithShout());
    render(<NotificationDropdown />);
    fireEvent.click(screen.getByTitle('Уведомления'));
    fireEvent.click(screen.getByText(/упомянул вас/));
    document.removeEventListener('click', globalAnchorInterceptor);
    expect(window.location.pathname).toBe('/shout/shout-abc');

    // jsdom resolves history.back() asynchronously, so this only settles
    // once the (real, unmocked) popstate has actually fired. With the
    // double-push bug, a single goBack() call here would only pop the
    // duplicate second push, leaving location at '/shout/shout-abc' — this
    // assertion would time out rather than pass, exactly the "Назад needed
    // 2 clicks" regression.
    goBack();
    await vi.waitFor(() => expect(window.location.pathname).toBe('/'));
  });
});

describe('NotificationDropdown — closing the donation modal preserves state (US3: FR-008, FR-012)', () => {
  it('leaves the announcements list and active tab unchanged after opening and closing the modal via the backdrop', async () => {
    const fetchMock = stubAnnouncementsFetch([{ id: '1', title: 'Заголовок', content: 'Текст', createdAt: new Date().toISOString() }]);
    render(<NotificationDropdown />);
    await openAnnouncementsTab(fetchMock);
    await screen.findByText('Заголовок');

    fireEvent.click(screen.getByRole('button', { name: 'Поддержать' }));
    await screen.findByTitle('Поддержать проект');

    // userEvent (not fireEvent) so the backdrop click dispatches a real
    // mousedown too — this is what NotificationDropdown's own
    // outside-click-closes-the-dropdown listener reacts to, and it must NOT
    // also close the dropdown out from under the donation modal.
    const [backdrop] = screen.getAllByLabelText('Закрыть');
    await userEvent.click(backdrop);

    await waitFor(() => expect(screen.queryByTitle('Поддержать проект')).not.toBeInTheDocument());
    expect(screen.getByText('Заголовок')).toBeInTheDocument();
    expect(screen.getByText('Объявления').className).toContain('border-b-2');
  });
});
