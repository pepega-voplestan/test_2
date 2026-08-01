import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GalleryCarousel from '../../components/GalleryCarousel';
import type { GalleryItem } from '../../types';

afterEach(cleanup);

/** Build `n` gallery items; dimensions vary per item to prove the frame ignores them. */
function items(n: number): GalleryItem[] {
  return Array.from({ length: n }, (_, i) => ({
    type: 'image' as const,
    url: `/media/m${i}/960.webp`,
    thumb: `/media/m${i}/320.webp`,
    full: `/media/m${i}/1600.webp`,
    width: 200 + i * 300, // deliberately varied — should never affect the frame
    height: 900 - i * 200,
  }));
}

const carousel = () => screen.getByTestId('gallery-carousel');
const tile = () => screen.getByTestId('gallery-carousel-tile');
const prevButton = () => screen.getByTestId('gallery-carousel-prev');
const nextButton = () => screen.getByTestId('gallery-carousel-next');
const indicator = () => screen.getByTestId('gallery-carousel-indicator');
// The plain `tile().querySelector('img')` only reliably means "the current
// image" while no drag is in progress — once a pointerdown mounts the
// prev/next neighbor panels, the DOM has 3 <img>s and querySelector returns
// whichever is first in source order, not necessarily the current one. This
// helper is unambiguous in both states.
const currentImg = () => screen.getByTestId('gallery-carousel-current-img');

describe('GalleryCarousel — renders nothing for 0/1 items (FR-016, FR-032)', () => {
  it('renders null for an empty gallery', () => {
    const { container } = render(<GalleryCarousel items={[]} maxHeight={300} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders null for a single-item gallery — that is the single-image path\'s job', () => {
    const { container } = render(<GalleryCarousel items={items(1)} maxHeight={300} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('GalleryCarousel — paging and looping (FR-012, FR-043)', () => {
  it('always opens on the first item', () => {
    render(<GalleryCarousel items={items(4)} maxHeight={300} />);
    expect(tile().querySelector('img')).toHaveAttribute('src', '/media/m0/960.webp');
    expect(indicator()).toHaveTextContent('1 / 4');
  });

  it('advances forward through items in order', async () => {
    const user = userEvent.setup();
    render(<GalleryCarousel items={items(3)} maxHeight={300} />);

    await user.click(nextButton());
    expect(tile().querySelector('img')).toHaveAttribute('src', '/media/m1/960.webp');
    expect(indicator()).toHaveTextContent('2 / 3');

    await user.click(nextButton());
    expect(tile().querySelector('img')).toHaveAttribute('src', '/media/m2/960.webp');
    expect(indicator()).toHaveTextContent('3 / 3');
  });

  it('loops forward from the last item back to the first', async () => {
    const user = userEvent.setup();
    render(<GalleryCarousel items={items(3)} maxHeight={300} />);

    await user.click(nextButton());
    await user.click(nextButton());
    await user.click(nextButton()); // past the last (index 2) → wraps to 0

    expect(tile().querySelector('img')).toHaveAttribute('src', '/media/m0/960.webp');
    expect(indicator()).toHaveTextContent('1 / 3');
  });

  it('loops backward from the first item to the last', async () => {
    const user = userEvent.setup();
    render(<GalleryCarousel items={items(5)} maxHeight={300} />);

    await user.click(prevButton()); // before the first (index 0) → wraps to last

    expect(tile().querySelector('img')).toHaveAttribute('src', '/media/m4/960.webp');
    expect(indicator()).toHaveTextContent('5 / 5');
  });
});

describe('GalleryCarousel — fixed frame (FR-014)', () => {
  it('is a 1:1 square sized to maxHeight, regardless of any item\'s own dimensions', () => {
    render(<GalleryCarousel items={items(5)} maxHeight={300} />);
    const el = carousel();
    expect(el.className).toMatch(/aspect-square/);
    expect(el.style.maxHeight).toBe('300px');
    expect(el.style.maxWidth).toBe('300px');
  });

  it('honours a comment height of 200px, independently of the shout value', () => {
    render(<GalleryCarousel items={items(3)} maxHeight={200} />);
    expect(carousel().style.maxHeight).toBe('200px');
    expect(carousel().style.maxWidth).toBe('200px');
  });

  it('takes maxHeight as a required prop with no built-in default', () => {
    const source = GalleryCarousel.toString();
    expect(source).not.toMatch(/maxHeight\s*=\s*\d/);
  });

  it('frame dimensions do not change as the reader pages between items (SC-010)', async () => {
    const user = userEvent.setup();
    render(<GalleryCarousel items={items(4)} maxHeight={300} />);
    const before = { maxHeight: carousel().style.maxHeight, maxWidth: carousel().style.maxWidth };

    await user.click(nextButton());
    await user.click(nextButton());

    expect(carousel().style.maxHeight).toBe(before.maxHeight);
    expect(carousel().style.maxWidth).toBe(before.maxWidth);
  });
});

describe('GalleryCarousel — letterbox rendering (FR-014, mirrors PendingMediaStrip)', () => {
  it('fits the image without cropping or stretching', () => {
    render(<GalleryCarousel items={items(2)} maxHeight={300} />);
    const img = tile().querySelector('img');
    expect(img?.className).toMatch(/object-contain/);
  });

  it('fills the frame background with the page\'s own darkest background token', () => {
    render(<GalleryCarousel items={items(2)} maxHeight={300} />);
    expect(carousel().className).toMatch(/bg-th-page/);
  });
});

describe('GalleryCarousel — arrows and indicator (FR-042, FR-044)', () => {
  it('renders arrow controls and a position indicator whenever a gallery has 2+ items', () => {
    render(<GalleryCarousel items={items(3)} maxHeight={300} />);
    expect(prevButton()).toBeInTheDocument();
    expect(nextButton()).toBeInTheDocument();
    expect(indicator()).toBeInTheDocument();
  });

  it('renders no arrows or indicator for a 1-item gallery, since the component does not mount at all', () => {
    render(<GalleryCarousel items={items(1)} maxHeight={300} />);
    expect(screen.queryByTestId('gallery-carousel-prev')).toBeNull();
    expect(screen.queryByTestId('gallery-carousel-indicator')).toBeNull();
  });
});

describe('GalleryCarousel — tile activation (FR-036)', () => {
  it('invokes onOpen with the current index when the tile is activated', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<GalleryCarousel items={items(4)} maxHeight={300} onOpen={onOpen} />);

    await user.click(nextButton());
    await user.click(tile());

    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('activates on keyboard Enter', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<GalleryCarousel items={items(3)} maxHeight={300} onOpen={onOpen} />);

    tile().focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it('gives the tile an accessible name and makes it focusable', () => {
    render(<GalleryCarousel items={items(3)} maxHeight={300} />);
    expect(tile()).toHaveAccessibleName();
    expect(tile().tabIndex).toBeGreaterThanOrEqual(0);
  });
});

describe('GalleryCarousel — arrow touch target (SC-005, Phase 7 convergence)', () => {
  it('sizes the prev/next buttons to a 44px touch target', () => {
    render(<GalleryCarousel items={items(3)} maxHeight={300} />);
    expect(prevButton().className).toMatch(/w-11 h-11/);
    expect(nextButton().className).toMatch(/w-11 h-11/);
  });
});

describe('GalleryCarousel — pointer-swipe navigation (SC-005, Phase 7 convergence)', () => {
  // A committed swipe now finishes its slide visually (SETTLE_MS) before the
  // index actually changes underneath it (2026-08-01 revision). That commit
  // happens inside a setTimeout callback outside any React event handler, so
  // advancing fake timers must be wrapped in `act()` for the resulting state
  // update to flush before the assertion runs — react-dom's scheduler doesn't
  // otherwise synchronize with Vitest's fake-timer advance.
  it('advances to the next item on a leftward swipe past the distance threshold', async () => {
    vi.useFakeTimers();
    try {
      render(<GalleryCarousel items={items(3)} maxHeight={300} />);
      fireEvent.pointerDown(tile(), { clientX: 200 });
      fireEvent.pointerUp(tile(), { clientX: 100 }); // 100px left, past the 40px threshold
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(tile().querySelector('img')).toHaveAttribute('src', '/media/m1/960.webp');
    } finally {
      vi.useRealTimers();
    }
  });

  it('goes to the previous item on a rightward swipe past the distance threshold', async () => {
    vi.useFakeTimers();
    try {
      render(<GalleryCarousel items={items(3)} maxHeight={300} />);
      fireEvent.pointerDown(tile(), { clientX: 100 });
      fireEvent.pointerUp(tile(), { clientX: 200 }); // 100px right
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(tile().querySelector('img')).toHaveAttribute('src', '/media/m2/960.webp'); // wraps to last
    } finally {
      vi.useRealTimers();
    }
  });

  it('loops past the last item on a swipe, same as the arrow controls', async () => {
    vi.useFakeTimers();
    try {
      render(<GalleryCarousel items={items(3)} maxHeight={300} />);
      for (let i = 0; i < 3; i++) {
        fireEvent.pointerDown(tile(), { clientX: 200 });
        fireEvent.pointerUp(tile(), { clientX: 100 });
        await act(async () => { vi.advanceTimersByTime(500); }); // let each swipe fully settle before the next starts
      }
      expect(tile().querySelector('img')).toHaveAttribute('src', '/media/m0/960.webp');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not treat a slow small movement below the distance/velocity threshold as a swipe', async () => {
    // A synchronous pointerdown→pointerup with no elapsed time would make even
    // a 1px movement register as an infinite-velocity "swipe" — advance fake
    // time to simulate a real (slow, small) drag, which is what this case
    // is meant to guard against (e.g. an unsteady tap, not an intentional swipe).
    vi.useFakeTimers();
    try {
      render(<GalleryCarousel items={items(3)} maxHeight={300} />);
      fireEvent.pointerDown(tile(), { clientX: 100 });
      vi.advanceTimersByTime(300);
      fireEvent.pointerUp(tile(), { clientX: 110 }); // 10px over 300ms — under both thresholds
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(tile().querySelector('img')).toHaveAttribute('src', '/media/m0/960.webp');
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a fast small flick above the velocity threshold as a swipe even under the distance threshold', async () => {
    vi.useFakeTimers();
    try {
      render(<GalleryCarousel items={items(3)} maxHeight={300} />);
      fireEvent.pointerDown(tile(), { clientX: 100 });
      vi.advanceTimersByTime(20);
      fireEvent.pointerUp(tile(), { clientX: 80 }); // 20px leftward over 20ms = 1px/ms, past the 0.5 velocity threshold
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(tile().querySelector('img')).toHaveAttribute('src', '/media/m1/960.webp'); // advances forward
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not treat a near-instant tiny jitter (e.g. a real tap landing right after a swipe) as a swipe', async () => {
    // With no jitter floor, a 3px movement over ~0ms elapsed produces a
    // near-infinite velocity and would spuriously cross SWIPE_VELOCITY_THRESHOLD
    // — exactly the "tap right after a swipe sometimes doesn't open fullscreen"
    // regression this guards against.
    const onOpen = vi.fn();
    render(<GalleryCarousel items={items(3)} maxHeight={300} onOpen={onOpen} />);
    fireEvent.pointerDown(tile(), { clientX: 100 });
    fireEvent.pointerUp(tile(), { clientX: 103 });
    fireEvent.click(tile());
    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it('mounts the adjacent item and visibly tracks the finger while dragging, before any threshold is crossed', () => {
    render(<GalleryCarousel items={items(3)} maxHeight={300} />);
    fireEvent.pointerDown(tile(), { clientX: 200 });
    fireEvent.pointerMove(tile(), { clientX: 150 }); // 50px left, mid-drag — no pointerup yet
    const track = screen.getByTestId('gallery-carousel-track');
    // frameWidth measures 0 in jsdom (no real layout), so the live offset
    // clamps to ±1px here — the point is that it moved off zero *during* the
    // drag, before any commit, and that the neighbor panel is now in the DOM.
    expect(track.style.transform).not.toBe('');
    expect(track.style.transform).not.toBe('translateX(0px)');
    expect(track.querySelectorAll('img').length).toBe(3); // prev + current + next
  });

  it('springs the track back to rest and unmounts the neighbor after a non-committing drag settles', async () => {
    vi.useFakeTimers();
    try {
      render(<GalleryCarousel items={items(3)} maxHeight={300} />);
      const track = screen.getByTestId('gallery-carousel-track');
      fireEvent.pointerDown(tile(), { clientX: 100 });
      fireEvent.pointerMove(tile(), { clientX: 105 }); // tiny movement, well under threshold
      vi.advanceTimersByTime(300); // realistic gap, so velocity doesn't spuriously cross its threshold
      fireEvent.pointerUp(tile(), { clientX: 105 });
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(track.style.transform).toBe('translateX(0px)');
      expect(track.querySelectorAll('img').length).toBe(1); // back to just the current item
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes an interrupted swipe immediately when a new gesture starts before it settles, instead of dropping it', () => {
    // Regression: swiping a couple of times quickly and then tapping to open
    // used to sometimes need a second tap on mobile. Root cause — a new
    // gesture's pointerdown used to just cancel the previous swipe's pending
    // settle timer, dropping its index commit and leaving the track visually
    // mid-transition; the tap that followed then had to reconcile that stale
    // state before a *second* tap actually worked. The fix flushes the
    // pending commit synchronously instead of dropping it.
    const onOpen = vi.fn();
    render(<GalleryCarousel items={items(3)} maxHeight={300} onOpen={onOpen} />);

    // First swipe commits to index 1, but its settle timer hasn't fired yet —
    // no timers are advanced here, matching a real quick swipe-then-tap.
    fireEvent.pointerDown(tile(), { clientX: 200 });
    fireEvent.pointerUp(tile(), { clientX: 100 });

    // Immediately tap to open, before the swipe above settles.
    fireEvent.pointerDown(tile(), { clientX: 50 });
    fireEvent.pointerUp(tile(), { clientX: 50 });
    fireEvent.click(tile());

    expect(onOpen).toHaveBeenCalledWith(1);
    expect(currentImg()).toHaveAttribute('src', '/media/m1/960.webp');
  });

  it('does not open the viewer when the pointer sequence was a swipe', () => {
    const onOpen = vi.fn();
    render(<GalleryCarousel items={items(3)} maxHeight={300} onOpen={onOpen} />);
    fireEvent.pointerDown(tile(), { clientX: 200 });
    fireEvent.pointerUp(tile(), { clientX: 100 });
    fireEvent.click(tile());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('still opens the viewer on a plain tap (pointer sequence with no movement)', () => {
    const onOpen = vi.fn();
    render(<GalleryCarousel items={items(3)} maxHeight={300} onOpen={onOpen} />);
    fireEvent.pointerDown(tile(), { clientX: 100 });
    fireEvent.pointerUp(tile(), { clientX: 100 });
    fireEvent.click(tile());
    expect(onOpen).toHaveBeenCalledWith(0);
  });
});
