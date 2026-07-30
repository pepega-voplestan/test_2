import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PendingMediaStrip from '../../components/PendingMediaStrip';
import type { PendingItem } from '../../hooks/useMediaAttachments';

afterEach(cleanup);

function item(overrides: Partial<PendingItem> = {}): PendingItem {
  return {
    localId: overrides.localId ?? `pending-${Math.random()}`,
    previewUrl: 'blob:mock',
    isVideo: false,
    isGif: false,
    ...overrides,
  };
}

/**
 * 2026-07-30 revision: pending items get their own bordered, horizontally
 * scrolling strip (FR-038/FR-039) at a unified 80px size (FR-040), each with a
 * remove control (FR-024) and click-to-Lightbox on its local preview (FR-037).
 */

describe('PendingMediaStrip — container layout (FR-038, FR-039)', () => {
  it('renders nothing when there are no pending items', () => {
    const { container } = render(<PendingMediaStrip items={[]} onRemove={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lays out items in a full-width horizontally-scrolling row with only a top divider', () => {
    const items = [item({ localId: 'a' }), item({ localId: 'b' }), item({ localId: 'c' })];
    const { container } = render(<PendingMediaStrip items={items} onRemove={vi.fn()} />);
    const strip = container.firstElementChild as HTMLElement;
    const classes = strip.className.split(/\s+/);
    expect(classes).toContain('border-t');
    // Only a top divider — no side/bottom border or box chrome (a color
    // modifier like border-th-border is fine; a bare all-sides `border` or a
    // rounded corner is not).
    expect(classes).not.toContain('border');
    expect(classes).not.toContain('border-b');
    expect(classes).not.toContain('border-l');
    expect(classes).not.toContain('border-r');
    expect(classes.some((c) => c.startsWith('rounded'))).toBe(false);
    expect(classes).toContain('overflow-x-auto');
    expect(classes).not.toContain('flex-wrap');
  });

  it('does not cancel ambient padding by default, so the divider matches its immediate container\'s width', () => {
    const { container } = render(<PendingMediaStrip items={[item()]} onRemove={vi.fn()} />);
    const strip = container.firstElementChild as HTMLElement;
    const classes = strip.className.split(/\s+/);
    expect(classes).not.toContain('-mx-4');
  });

  it('cancels a p-4 ancestor\'s horizontal padding when edgeToEdge is set, so the divider reaches the true edges of the composer box', () => {
    const { container } = render(<PendingMediaStrip items={[item()]} onRemove={vi.fn()} edgeToEdge />);
    const strip = container.firstElementChild as HTMLElement;
    const classes = strip.className.split(/\s+/);
    expect(classes).toContain('-mx-4');
    expect(classes).toContain('px-4');
  });
});

describe('PendingMediaStrip — sizing and ratio (FR-040)', () => {
  it('renders every tile in a uniform 80×80 square box regardless of context or the item\'s own aspect ratio', () => {
    const items = [item({ localId: 'a' }), item({ localId: 'b', isVideo: true })];
    render(<PendingMediaStrip items={items} onRemove={vi.fn()} />);
    const img = screen.getByAltText('preview');
    const video = document.querySelector('video') as HTMLElement;
    // The outer tile wrapper (grandparent of the media, parent of the letterbox
    // clipping div) carries the fixed box size.
    for (const el of [img.parentElement?.parentElement as HTMLElement, video.parentElement?.parentElement as HTMLElement]) {
      expect(el.className).toMatch(/w-20/);
      expect(el.className).toMatch(/h-20/);
    }
  });

  it('fits the media inside its box without cropping or stretching, letterboxing thin/short items', () => {
    render(<PendingMediaStrip items={[item()]} onRemove={vi.fn()} />);
    const img = screen.getByAltText('preview');
    expect(img.className).toMatch(/object-contain/);
  });

  it('fills letterbox gaps with the page\'s own darkest background token', () => {
    render(<PendingMediaStrip items={[item()]} onRemove={vi.fn()} />);
    const clip = screen.getByAltText('preview').parentElement as HTMLElement;
    expect(clip.className).toMatch(/bg-th-page/);
    expect(clip.className).toMatch(/overflow-hidden/);
  });

  it('keeps the remove control at its existing visible size, on a wrapper that does not clip it', () => {
    render(<PendingMediaStrip items={[item()]} onRemove={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button.className).toMatch(/w-6 h-6/);
    // The button's own parent (the outer w-20 h-20 tile wrapper) must NOT
    // clip content, or the button's negative-offset position gets cut off.
    expect(button.parentElement?.className).not.toMatch(/overflow-hidden/);
  });
});

describe('PendingMediaStrip — per-item removal (FR-024)', () => {
  it('calls onRemove with only the activated item\'s localId', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const items = [item({ localId: 'a' }), item({ localId: 'b' }), item({ localId: 'c' })];
    render(<PendingMediaStrip items={items} onRemove={onRemove} />);

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[1]);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('b');
  });

  it('hides remove controls while disabled (submit in flight)', () => {
    render(<PendingMediaStrip items={[item()]} onRemove={vi.fn()} disabled />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('PendingMediaStrip — tile activation opens Lightbox on the local preview (FR-037)', () => {
  it('opens the existing Lightbox on the activated image tile\'s object URL', async () => {
    const user = userEvent.setup();
    const items = [
      item({ localId: 'a', previewUrl: 'blob:a' }),
      item({ localId: 'b', previewUrl: 'blob:b' }),
    ];
    render(<PendingMediaStrip items={items} onRemove={vi.fn()} />);

    expect(screen.queryByAltText('attachment')).toBeNull();

    const tiles = screen.getAllByAltText('preview');
    await user.click(tiles[1]);

    const lightboxImg = screen.getByAltText('attachment') as HTMLImageElement;
    expect(lightboxImg.src).toContain('blob:b');
  });

  it('does not offer inter-item navigation — no cycling props are involved', async () => {
    // Stage 2's multi-item viewer is out of scope here; each tile opens
    // independently on itself only (Clarifications, Session 2026-07-30).
    const user = userEvent.setup();
    const items = [item({ localId: 'a', previewUrl: 'blob:a' }), item({ localId: 'b', previewUrl: 'blob:b' })];
    render(<PendingMediaStrip items={items} onRemove={vi.fn()} />);
    await user.click(screen.getAllByAltText('preview')[0]);
    expect(screen.queryByText(/1 \/ 2/)).toBeNull();
  });

  it('does not open Lightbox for a video tile', async () => {
    const user = userEvent.setup();
    render(<PendingMediaStrip items={[item({ isVideo: true })]} onRemove={vi.fn()} />);
    const video = document.querySelector('video') as HTMLElement;
    await user.click(video);
    expect(screen.queryByAltText('attachment')).toBeNull();
  });
});
