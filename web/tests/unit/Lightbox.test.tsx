import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Lightbox from '../../components/Lightbox';

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
