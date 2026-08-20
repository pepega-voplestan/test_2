import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Lightbox from '../../components/Lightbox';
import type { GalleryItem } from '../../types';

afterEach(cleanup);

beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

/**
 * Feature 011: past the retention window `buildMedia` omits `full`, so the DTO
 * carries only the display copy. Every surface that reads `.full` must degrade
 * to `url` — a bare `full` would put `undefined` into `src` and render the
 * broken image Constitution §III prohibits.
 */

function fresh(id: string): GalleryItem {
  return {
    type: 'image',
    url: `/media/${id}/960.webp`,
    full: `/media/${id}/1600.webp`,
    width: 1600,
    height: 1200,
  };
}

/** `full` absent — the shape buildMedia emits once the 1600 has expired. */
function expired(id: string): GalleryItem {
  return { type: 'image', url: `/media/${id}/960.webp`, width: 1600, height: 1200 };
}

const currentImg = () => screen.getByAltText('attachment');

describe('Lightbox — expired full-size variant', () => {
  it('renders the display copy when full is absent', () => {
    render(<Lightbox items={[expired('old')]} startIndex={0} onClose={vi.fn()} />);
    expect(currentImg()).toHaveAttribute('src', '/media/old/960.webp');
  });

  it('never puts undefined into src', () => {
    render(<Lightbox items={[expired('old')]} startIndex={0} onClose={vi.fn()} />);
    const src = currentImg().getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).not.toContain('undefined');
  });

  it('still prefers full when it is present', () => {
    render(<Lightbox items={[fresh('new')]} startIndex={0} onClose={vi.fn()} />);
    expect(currentImg()).toHaveAttribute('src', '/media/new/1600.webp');
  });

  // The realistic case after a first sweep: a gallery published over several
  // days, some members expired and some not. Paging must not gap.
  it('pages a mixed-age gallery end to end without a gap', () => {
    const items = [expired('a'), fresh('b'), expired('c')];
    for (const [i, expectedSrc] of [
      [0, '/media/a/960.webp'],
      [1, '/media/b/1600.webp'],
      [2, '/media/c/960.webp'],
    ] as const) {
      cleanup();
      render(<Lightbox items={items} startIndex={i} onClose={vi.fn()} />);
      expect(currentImg()).toHaveAttribute('src', expectedSrc);
    }
  });

  // Neighbours only mount once a horizontal drag locks the axis, so the swipe
  // has to be simulated — they are the frames a user sees mid-swipe, and an
  // undefined src there is just as broken as on the active image.
  it('renders neighbours from the display copy too, so a swipe reveals no gap', () => {
    render(<Lightbox items={[expired('a'), expired('b'), expired('c')]} startIndex={1} onClose={vi.fn()} />);
    const overlay = document.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.pointerDown(overlay, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(overlay, { button: 0, clientX: 120, clientY: 200 });

    const srcs = Array.from(document.querySelectorAll('img')).map((n) => n.getAttribute('src'));
    expect(srcs.every((s) => s && !s.includes('undefined'))).toBe(true);
    expect(srcs).toContain('/media/a/960.webp');
    expect(srcs).toContain('/media/c/960.webp');
  });
});
