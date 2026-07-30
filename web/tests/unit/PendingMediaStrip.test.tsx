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

  it('lays out items in a single bordered, horizontally-scrolling row', () => {
    const items = [item({ localId: 'a' }), item({ localId: 'b' }), item({ localId: 'c' })];
    const { container } = render(<PendingMediaStrip items={items} onRemove={vi.fn()} />);
    const strip = container.firstElementChild as HTMLElement;
    expect(strip.className).toMatch(/border/);
    expect(strip.className).toMatch(/overflow-x-auto/);
    expect(strip.className).not.toMatch(/flex-wrap/);
  });
});

describe('PendingMediaStrip — sizing (FR-040)', () => {
  it('renders every tile at the unified 80px max-height regardless of context', () => {
    const items = [item({ localId: 'a' }), item({ localId: 'b', isVideo: true })];
    render(<PendingMediaStrip items={items} onRemove={vi.fn()} />);
    const img = screen.getByAltText('preview');
    expect(img.className).toMatch(/max-h-20/);
    const video = document.querySelector('video') as HTMLElement;
    expect(video.className).toMatch(/max-h-20/);
  });

  it('keeps the remove control at its existing visible size', () => {
    render(<PendingMediaStrip items={[item()]} onRemove={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button.className).toMatch(/w-6 h-6/);
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
