import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Lightbox from '../../components/Lightbox';
import type { GalleryItem } from '../../types';

afterEach(cleanup);

beforeAll(() => {
  // jsdom implements neither of these; the overlay calls setPointerCapture on
  // every pointerdown.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

/**
 * Lightbox dismissal and the ghost-click trap.
 *
 * Closing by pointerup on the backdrop arms a capture-phase click blocker to
 * swallow the ghost click that trails the interaction. The regression these
 * cover: that trap outliving its target and eating the user's *next* real
 * click — reported as "close the viewer by clicking outside, then clicking
 * another gallery tile sometimes needs two clicks".
 */

/** Lightbox plus an unrelated sibling button, mirroring a tile in the feed. */
function Harness({ onNext }: { onNext: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={onNext}>next tile</button>
      {open && <Lightbox src="/media/a/1600.webp" onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Dismiss by pressing and releasing on the backdrop without dragging. */
function closeViaBackdrop() {
  const overlay = document.querySelector('.fixed.inset-0') as HTMLElement;
  expect(overlay).toBeTruthy();
  fireEvent.pointerDown(overlay, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(overlay, { button: 0, clientX: 10, clientY: 10 });
}

describe('Lightbox — backdrop dismissal', () => {
  it('closes when the backdrop is clicked without dragging', () => {
    render(<Harness onNext={vi.fn()} />);
    expect(document.querySelector('.fixed.inset-0')).toBeTruthy();

    closeViaBackdrop();
    expect(document.querySelector('.fixed.inset-0')).toBeNull();
  });
});

describe('Lightbox — ghost-click trap does not outlive its target', () => {
  it('still swallows the ghost click that trails dismissal', () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    closeViaBackdrop();

    // A ghost click is a bare `click` with no pointerdown of its own.
    fireEvent.click(screen.getByText('next tile'));
    expect(onNext).not.toHaveBeenCalled();
  });

  it('lets the very next real click through (the two-click regression)', () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    closeViaBackdrop();

    // A real click opens with pointerdown — which must disarm the trap even
    // though no ghost click ever arrived to consume it.
    const next = screen.getByText('next tile');
    fireEvent.pointerDown(next, { button: 0 });
    fireEvent.pointerUp(next, { button: 0 });
    fireEvent.click(next);

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('does not need the 400ms backstop to expire first', () => {
    vi.useFakeTimers();
    try {
      const onNext = vi.fn();
      render(<Harness onNext={onNext} />);
      closeViaBackdrop();

      // Zero elapsed time: previously the trap stayed armed for the full
      // window and this click was lost.
      const next = screen.getByText('next tile');
      fireEvent.pointerDown(next, { button: 0 });
      fireEvent.click(next);

      expect(onNext).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves no listener behind once disarmed', () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    closeViaBackdrop();

    const next = screen.getByText('next tile');
    fireEvent.pointerDown(next, { button: 0 });
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);

    // Every subsequent click lands; the trap fired at most once.
    expect(onNext).toHaveBeenCalledTimes(3);
  });
});

/**
 * Gallery mode (D20 reversed 2026-08-05 — see specs/006-multi-media-gallery/
 * research.md): Lightbox pages between items itself, mirroring
 * GalleryCarousel's looping/swipe/arrows/indicator UX, while dismiss/zoom/pan
 * and the ghost-click trap above keep working unmodified.
 */

/** Build `n` gallery items; `orientation` lets a test vary it per index. */
function items(n: number, opts: { orientation?: (i: number) => number | undefined } = {}): GalleryItem[] {
  return Array.from({ length: n }, (_, i) => ({
    type: 'image' as const,
    url: `/media/m${i}/960.webp`,
    thumb: `/media/m${i}/320.webp`,
    full: `/media/m${i}/1600.webp`,
    width: 800,
    height: 600,
    orientation: opts.orientation?.(i),
  }));
}

const overlay = () => document.querySelector('.fixed.inset-0') as HTMLElement;
const currentImg = () => screen.getByAltText('attachment');
const wrapper = () => currentImg().parentElement as HTMLElement;
const prevButton = () => screen.getByTestId('lightbox-prev');
const nextButton = () => screen.getByTestId('lightbox-next');
const indicator = () => screen.getByTestId('lightbox-indicator');

describe('Lightbox — gallery mode: paging and looping', () => {
  it('opens on startIndex and pages forward via the next arrow, looping past the end', async () => {
    const user = userEvent.setup();
    render(<Lightbox items={items(3)} startIndex={1} onClose={vi.fn()} />);
    expect(currentImg()).toHaveAttribute('src', '/media/m1/1600.webp');
    expect(indicator()).toHaveTextContent('2 / 3');

    await user.click(nextButton());
    expect(currentImg()).toHaveAttribute('src', '/media/m2/1600.webp');
    await user.click(nextButton()); // past the last → wraps to the first
    expect(currentImg()).toHaveAttribute('src', '/media/m0/1600.webp');
    expect(indicator()).toHaveTextContent('1 / 3');
  });

  it('pages backward via the prev arrow, looping before the start', async () => {
    const user = userEvent.setup();
    render(<Lightbox items={items(3)} startIndex={0} onClose={vi.fn()} />);
    await user.click(prevButton());
    expect(currentImg()).toHaveAttribute('src', '/media/m2/1600.webp');
  });

  it('pages with Left/Right arrow keys, looping the same way as the on-screen arrows', async () => {
    const user = userEvent.setup();
    render(<Lightbox items={items(3)} startIndex={0} onClose={vi.fn()} />);
    await user.keyboard('{ArrowRight}');
    expect(currentImg()).toHaveAttribute('src', '/media/m1/1600.webp');
    await user.keyboard('{ArrowLeft}');
    await user.keyboard('{ArrowLeft}'); // before the first → wraps to the last
    expect(currentImg()).toHaveAttribute('src', '/media/m2/1600.webp');
  });
});

describe('Lightbox — gallery mode: arrows and indicator', () => {
  it('renders prev/next arrows and a position indicator for 2+ items', () => {
    render(<Lightbox items={items(2)} startIndex={0} onClose={vi.fn()} />);
    expect(prevButton()).toBeInTheDocument();
    expect(nextButton()).toBeInTheDocument();
    expect(indicator()).toHaveTextContent('1 / 2');
  });

  it('renders none of them for a single-item gallery', () => {
    render(<Lightbox items={items(1)} startIndex={0} onClose={vi.fn()} />);
    expect(screen.queryByTestId('lightbox-prev')).toBeNull();
    expect(screen.queryByTestId('lightbox-next')).toBeNull();
    expect(screen.queryByTestId('lightbox-indicator')).toBeNull();
  });

  it('fades the arrows and indicator out immediately once a swipe-dismiss commits, instead of leaving them static for the full 300ms exit', () => {
    render(<Lightbox items={items(3)} startIndex={0} onClose={vi.fn()} />);
    fireEvent.pointerDown(overlay(), { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(overlay(), { button: 0, clientX: 100, clientY: 300 }); // dy=200, past DISMISS_THRESHOLD, locks vertical
    fireEvent.pointerUp(overlay(), { button: 0, clientX: 100, clientY: 300 });

    expect(prevButton().className).toMatch(/opacity-0/);
    expect(nextButton().className).toMatch(/opacity-0/);
    expect(indicator().className).toMatch(/opacity-0/);
  });
});

describe('Lightbox — gallery mode: pointer-swipe navigation', () => {
  // Mirrors GalleryCarousel.test.tsx's own swipe suite — same thresholds,
  // same fake-timer settle pattern, driven at the overlay instead of a tile.
  it('advances on a leftward swipe past the distance threshold', async () => {
    vi.useFakeTimers();
    try {
      render(<Lightbox items={items(3)} startIndex={0} onClose={vi.fn()} />);
      fireEvent.pointerDown(overlay(), { button: 0, clientX: 200 });
      fireEvent.pointerUp(overlay(), { button: 0, clientX: 100 }); // 100px left, past the 40px threshold
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(currentImg()).toHaveAttribute('src', '/media/m1/1600.webp');
    } finally {
      vi.useRealTimers();
    }
  });

  it('goes to the previous item on a rightward swipe, looping before the start', async () => {
    vi.useFakeTimers();
    try {
      render(<Lightbox items={items(3)} startIndex={0} onClose={vi.fn()} />);
      fireEvent.pointerDown(overlay(), { button: 0, clientX: 100 });
      fireEvent.pointerUp(overlay(), { button: 0, clientX: 200 }); // 100px right
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(currentImg()).toHaveAttribute('src', '/media/m2/1600.webp'); // wraps to last
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not treat a slow small movement below the distance/velocity threshold as a swipe', async () => {
    vi.useFakeTimers();
    try {
      render(<Lightbox items={items(3)} startIndex={0} onClose={vi.fn()} />);
      fireEvent.pointerDown(overlay(), { button: 0, clientX: 100 });
      vi.advanceTimersByTime(300);
      fireEvent.pointerUp(overlay(), { button: 0, clientX: 110 }); // 10px over 300ms — under both thresholds
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(currentImg()).toHaveAttribute('src', '/media/m0/1600.webp');
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a fast small flick above the velocity threshold as a swipe even under the distance threshold', async () => {
    vi.useFakeTimers();
    try {
      render(<Lightbox items={items(3)} startIndex={0} onClose={vi.fn()} />);
      fireEvent.pointerDown(overlay(), { button: 0, clientX: 100 });
      vi.advanceTimersByTime(20);
      fireEvent.pointerUp(overlay(), { button: 0, clientX: 80 }); // 20px over 20ms = 1px/ms, past the 0.5 velocity threshold
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(currentImg()).toHaveAttribute('src', '/media/m1/1600.webp');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Lightbox — gallery mode: dominant-axis disambiguation', () => {
  it('a mostly-vertical drag dismisses without paging', () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<Lightbox items={items(3)} startIndex={0} onClose={onClose} />);
      fireEvent.pointerDown(overlay(), { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(overlay(), { button: 0, clientX: 105, clientY: 250 }); // dy=150 >> dx=5, locks vertical
      fireEvent.pointerUp(overlay(), { button: 0, clientX: 105, clientY: 250 });
      expect(currentImg()).toHaveAttribute('src', '/media/m0/1600.webp'); // no page change
      act(() => { vi.advanceTimersByTime(400); });
      expect(onClose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a mostly-horizontal drag pages without dismissing', () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<Lightbox items={items(3)} startIndex={0} onClose={onClose} />);
      fireEvent.pointerDown(overlay(), { button: 0, clientX: 200, clientY: 100 });
      fireEvent.pointerMove(overlay(), { button: 0, clientX: 100, clientY: 105 }); // dx=100 >> dy=5, locks horizontal
      fireEvent.pointerUp(overlay(), { button: 0, clientX: 100, clientY: 105 });
      act(() => { vi.advanceTimersByTime(400); });
      expect(currentImg()).toHaveAttribute('src', '/media/m1/1600.webp');
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Lightbox — gallery mode: zoom resets on index change', () => {
  it('resets zoom to 1x after paging to a new item', async () => {
    const user = userEvent.setup();
    render(<Lightbox items={items(2)} startIndex={0} onClose={vi.fn()} />);

    // Two rapid clicks on the backdrop simulate the double-tap-to-zoom gesture.
    fireEvent.click(overlay());
    fireEvent.click(overlay());
    expect(wrapper().style.transform).toContain('scale(2.5)');

    await user.click(nextButton());
    expect(wrapper().style.transform).not.toContain('2.5');
  });
});

describe('Lightbox — gallery mode: orientation re-applies per item', () => {
  it("applies each item's own EXIF orientation transform as the index changes", async () => {
    const user = userEvent.setup();
    const gallery = items(2, { orientation: (i) => (i === 0 ? 6 : undefined) });
    render(<Lightbox items={gallery} startIndex={0} onClose={vi.fn()} />);
    expect(currentImg().style.transform).toBe('rotate(90deg)');

    await user.click(nextButton());
    expect(currentImg().style.transform).toBe('');
  });

  it("applies each neighbour's own orientation transform while a swipe is in flight", () => {
    // Arrow paging never mounts the neighbours — only a horizontal drag does,
    // which is why this needs a real pointer gesture rather than a click.
    const gallery = items(3, { orientation: (i) => (i === 1 ? 6 : undefined) });
    render(<Lightbox items={gallery} startIndex={0} onClose={vi.fn()} />);
    const el = overlay();

    fireEvent.pointerDown(el, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(el, { button: 0, clientX: 150, clientY: 200 }); // past AXIS_LOCK_THRESHOLD

    // DOM order inside the track: prev, current, next.
    const imgs = screen.getByTestId('lightbox-track').querySelectorAll('img');
    expect(imgs).toHaveLength(3);
    // Item 1 is the next neighbour and carries orientation 6.
    expect((imgs[2] as HTMLElement).style.transform).toBe('rotate(90deg)');
    expect((imgs[2] as HTMLElement).style.maxWidth).toBe('90vh');
    // Item 2 is the prev neighbour and has none.
    expect((imgs[0] as HTMLElement).style.transform).toBe('');
  });

  // jsdom performs no layout and applies no transforms, so these assert the
  // styles the fix turns on, not the geometry they produce. The clipping they
  // guard against only reproduces in a real viewport narrow enough for 90vw to
  // bind (a phone in portrait) — see the wrapper/img mismatch in maxBox().
  it('gives the transform wrapper the same swapped max box as a rotated image', () => {
    render(<Lightbox items={items(2, { orientation: () => 6 })} startIndex={0} onClose={vi.fn()} />);
    expect(currentImg().style.maxWidth).toBe('90vh');
    expect(wrapper().style.maxWidth).toBe('90vh');
    expect(wrapper().style.maxHeight).toBe('90vw');
  });

  it('leaves the wrapper box unswapped when the image needs no rotation', () => {
    render(<Lightbox items={items(2)} startIndex={0} onClose={vi.fn()} />);
    expect(wrapper().style.maxWidth).toBe('90vw');
    expect(wrapper().style.maxHeight).toBe('90vh');
  });
});

describe('Lightbox — gallery mode: ghost-click trap still works when paging is present', () => {
  function GalleryHarness({ onNext }: { onNext: () => void }) {
    const [open, setOpen] = useState(true);
    return (
      <div>
        <button onClick={onNext}>next tile</button>
        {open && <Lightbox items={items(3)} startIndex={0} onClose={() => setOpen(false)} />}
      </div>
    );
  }

  it('swallows the ghost click that trails closing a gallery-mode Lightbox', () => {
    const onNext = vi.fn();
    render(<GalleryHarness onNext={onNext} />);
    const overlayEl = overlay();
    fireEvent.pointerDown(overlayEl, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(overlayEl, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByText('next tile'));
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('Lightbox — single-image mode is unaffected', () => {
  it('renders no gallery affordances when items is omitted', () => {
    render(<Lightbox src="/media/a/1600.webp" onClose={vi.fn()} />);
    expect(screen.queryByTestId('lightbox-prev')).toBeNull();
    expect(screen.queryByTestId('lightbox-next')).toBeNull();
    expect(screen.queryByTestId('lightbox-indicator')).toBeNull();
    expect(screen.queryByTestId('lightbox-track')).toBeNull();
  });
});
