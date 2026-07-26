import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GalleryGrid, { containerRatio } from '../../components/GalleryGrid';
import type { GalleryItem } from '../../types';

afterEach(cleanup);

/** Build `n` gallery items; the first can be given custom dimensions. */
function items(n: number, firstDims?: { width: number; height: number }): GalleryItem[] {
  return Array.from({ length: n }, (_, i) => ({
    type: 'image' as const,
    url: `/media/m${i}/960.webp`,
    thumb: `/media/m${i}/320.webp`,
    full: `/media/m${i}/1600.webp`,
    width: i === 0 ? (firstDims?.width ?? 400) : 999,
    height: i === 0 ? (firstDims?.height ?? 400) : 999,
  }));
}

const grid = () => screen.getByTestId('gallery-grid');
const tiles = () => screen.getAllByTestId(/^gallery-tile-/);

describe('GalleryGrid — layout selection (FR-012, U3)', () => {
  it.each([[2], [3], [4], [5]])('renders exactly %i tiles for that many items', (n) => {
    render(<GalleryGrid items={items(n)} maxHeight={300} />);
    expect(tiles()).toHaveLength(n);
  });

  it('labels the container with its item count so the layout is selectable in CSS', () => {
    for (const n of [2, 3, 4, 5]) {
      render(<GalleryGrid items={items(n)} maxHeight={300} />);
      expect(grid()).toHaveAttribute('data-count', String(n));
      cleanup();
    }
  });

  it('renders tiles in gallery order (U3)', () => {
    render(<GalleryGrid items={items(4)} maxHeight={300} />);
    const srcs = tiles().map((t) => t.querySelector('img')?.getAttribute('src'));
    expect(srcs).toEqual([
      '/media/m0/960.webp',
      '/media/m1/960.webp',
      '/media/m2/960.webp',
      '/media/m3/960.webp',
    ]);
  });

  it('renders nothing for fewer than 2 items — the single-image path owns that case', () => {
    const { container } = render(<GalleryGrid items={items(1)} maxHeight={300} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('never renders more than the five-item cap', () => {
    render(<GalleryGrid items={items(5).concat(items(3))} maxHeight={300} />);
    expect(tiles().length).toBeLessThanOrEqual(5);
  });
});

describe('GalleryGrid — container shape (FR-014, research D12)', () => {
  // Asserted against the pure function rather than the DOM: jsdom's CSS parser
  // silently drops `aspect-ratio`, so it never reaches the style attribute and
  // cannot be read back from the rendered element.

  it('derives the ratio from the FIRST item only', () => {
    const [first] = items(3, { width: 400, height: 300 });
    // Other items are 999x999 and must not influence it.
    expect(containerRatio(first)).toBeCloseTo(4 / 3, 5);
  });

  it('clamps a wide panorama at 2.0', () => {
    expect(containerRatio({ ...items(1)[0], width: 4000, height: 500 })).toBe(2);
  });

  it('clamps a tall portrait at 0.5', () => {
    expect(containerRatio({ ...items(1)[0], width: 500, height: 4000 })).toBe(0.5);
  });

  it('falls back to square when dimensions are 0 (older media rows)', () => {
    expect(containerRatio({ ...items(1)[0], width: 0, height: 0 })).toBe(1);
  });

  it('falls back to square when a dimension is missing entirely', () => {
    const { width: _w, ...noWidth } = items(1)[0];
    expect(containerRatio(noWidth as GalleryItem)).toBe(1);
  });

  it('falls back to square when the item itself is absent', () => {
    expect(containerRatio(undefined)).toBe(1);
  });

  it('passes ordinary ratios through unclamped', () => {
    expect(containerRatio({ ...items(1)[0], width: 1600, height: 900 })).toBeCloseTo(16 / 9, 5);
  });
});

describe('GalleryGrid — per-context height (FR-015, U4)', () => {
  it('honours a shout height of 300px', () => {
    render(<GalleryGrid items={items(3)} maxHeight={300} />);
    expect(grid().style.maxHeight).toBe('300px');
  });

  it('honours a comment height of 200px', () => {
    render(<GalleryGrid items={items(3)} maxHeight={200} />);
    expect(grid().style.maxHeight).toBe('200px');
  });

  // Guards the defect from the first Stage 1 build, where 300px was hardcoded
  // and comments rendered oversized.
  it('takes maxHeight as a required prop with no built-in default', () => {
    const source = GalleryGrid.toString();
    expect(source).not.toMatch(/maxHeight\s*=\s*\d/);
  });
});

describe('GalleryGrid — tile activation (FR-036)', () => {
  it('invokes onOpen with the index of the activated tile', async () => {
    const onOpen = vi.fn();
    render(<GalleryGrid items={items(4)} maxHeight={300} onOpen={onOpen} />);

    await userEvent.click(tiles()[2]);
    expect(onOpen).toHaveBeenCalledWith(2);
  });

  it('activates on keyboard Enter', async () => {
    const onOpen = vi.fn();
    render(<GalleryGrid items={items(3)} maxHeight={300} onOpen={onOpen} />);

    tiles()[1].focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('gives every tile an accessible name and makes it focusable', () => {
    render(<GalleryGrid items={items(3)} maxHeight={300} />);
    for (const tile of tiles()) {
      expect(tile).toHaveAccessibleName();
      expect(tile.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });

  // Reported after the Phase 1b deploy: clicking a tile left a blue box behind,
  // because the tile keeps DOM focus once the viewer closes and `focus:ring`
  // paints for pointer focus too. jsdom implements neither :focus-visible
  // matching nor the CDN's class generation, so this asserts the variant that
  // decides it rather than computed style.
  it('shows the focus ring only for keyboard focus, not after a mouse click', () => {
    render(<GalleryGrid items={items(3)} maxHeight={300} />);
    for (const tile of tiles()) {
      expect(tile.className).toMatch(/focus-visible:ring-2/);
      expect(tile.className).not.toMatch(/(?<!-)\bfocus:ring/);
    }
  });
});

describe('GalleryGrid — animated items', () => {
  it('animates GIF tiles normally', () => {
    const gif = items(2);
    gif[0] = { ...gif[0], animated: true, gif: '/media/m0/original.gif' };
    render(<GalleryGrid items={gif} maxHeight={300} />);
    expect(tiles()[0].querySelector('img')).toHaveAttribute('src', '/media/m0/original.gif');
  });

  it('uses the static image when the gallery is behind a blur', () => {
    const gif = items(2);
    gif[0] = { ...gif[0], animated: true, gif: '/media/m0/original.gif' };
    render(<GalleryGrid items={gif} maxHeight={300} staticOnly />);
    expect(tiles()[0].querySelector('img')).toHaveAttribute('src', '/media/m0/960.webp');
  });
});

describe('GalleryGrid — no "+N" badge (FR-013 removed)', () => {
  it('renders no overflow count anywhere', () => {
    render(<GalleryGrid items={items(5)} maxHeight={300} />);
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });
});
