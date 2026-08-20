import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ShoutCard from '../../components/ShoutCard';
import type { Shout } from '../../types';

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('../../context/ContentPreferencesContext', () => ({
  useContentPreferences: () => ({ prefs: { showNsfw: true, showPolitics: true } }),
}));
vi.mock('../../context/IgnoredUsersContext', () => ({
  useIgnoredUsers: () => ({ ignoredIds: new Set<string>(), isIgnored: () => false }),
}));

mockUseAuth.mockReturnValue({ user: null, openModal: vi.fn() });

afterEach(cleanup);

function makeShout(media: Shout['media']): Shout {
  return {
    id: 's1',
    content: 'текст поста',
    createdAt: new Date().toISOString(),
    author: { id: 'u1', name: 'Автор', username: 'author' },
    likeCount: 0,
    likedByMe: false,
    commentCount: 0,
    comments: [],
    media,
  } as unknown as Shout;
}

/**
 * Feature 011 FR-013: once a video file has expired the card must say so in
 * Russian and must never render a player. A `<video>` with an undefined `src`
 * reads as "still loading" and sends the reader back to retry something that is
 * permanently gone.
 */
describe('ShoutCard — expired video', () => {
  it('renders the Russian tombstone in place of the player', () => {
    render(<ShoutCard shout={makeShout({ type: 'video', expired: true, width: 1280, height: 720 })} />);

    expect(screen.getByTestId('expired-video')).toHaveTextContent('Срок хранения видео истёк');
    expect(document.querySelector('video')).toBeNull();
  });

  it('never renders a video element with an undefined src', () => {
    render(<ShoutCard shout={makeShout({ type: 'video', expired: true, width: 1280, height: 720 })} />);

    for (const v of Array.from(document.querySelectorAll('video'))) {
      expect(v.getAttribute('src')).toBeTruthy();
    }
  });

  it('offers no play control and no imagery', () => {
    render(<ShoutCard shout={makeShout({ type: 'video', expired: true, width: 1280, height: 720 })} />);

    const tombstone = screen.getByTestId('expired-video');
    expect(tombstone.querySelector('img')).toBeNull();
    expect(tombstone.querySelector('button')).toBeNull();
    expect(tombstone.querySelector('svg')).toBeNull();
  });

  it('keeps the post itself readable', () => {
    render(<ShoutCard shout={makeShout({ type: 'video', expired: true, width: 1280, height: 720 })} />);

    expect(screen.getByText('текст поста')).toBeTruthy();
  });

  it('still renders a real player for a video inside the window', () => {
    render(
      <ShoutCard
        shout={makeShout({ type: 'video', url: '/media/v/original.mp4', width: 1280, height: 720 })}
      />
    );

    expect(screen.queryByTestId('expired-video')).toBeNull();
    expect(document.querySelector('video')).toHaveAttribute('src', '/media/v/original.mp4');
  });
});
