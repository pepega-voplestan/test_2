import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationDropdown from '../../components/NotificationDropdown';

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
