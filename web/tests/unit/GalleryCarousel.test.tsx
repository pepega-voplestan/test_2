import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
