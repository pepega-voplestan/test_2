import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMediaAttachments, GALLERY_MAX_ITEMS } from '../../hooks/useMediaAttachments';

/** A File whose `size` we can control without allocating real bytes. */
function makeFile(name: string, type = 'image/jpeg', size = 1024): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

let uploadCalls = 0;

/** Default fetch stub: every upload succeeds with a unique media id. */
function stubUploadsOk() {
  globalThis.fetch = vi.fn(async () => {
    uploadCalls++;
    return {
      ok: true,
      json: async () => ({
        mediaId: `media-${uploadCalls}`,
        urls: { thumb: `/media/media-${uploadCalls}/320.webp` },
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  uploadCalls = 0;
  stubUploadsOk();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMediaAttachments — capacity gate (FR-033)', () => {
  it('attaches files up to the limit', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    await act(async () => {
      await result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    });

    expect(result.current.items).toHaveLength(3);
    expect(result.current.mediaIds).toHaveLength(3);
  });

  it('rejects the ENTIRE action when it would exceed the limit, uploading nothing', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    await act(async () => {
      await result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    });
    expect(result.current.items).toHaveLength(2);
    const callsAfterFirst = uploadCalls;

    // 2 attached + 4 more = 6 > 5 → whole action rejected.
    await act(async () => {
      await result.current.addFiles([
        makeFile('c.jpg'), makeFile('d.jpg'), makeFile('e.jpg'), makeFile('f.jpg'),
      ]);
    });

    // Existing selection untouched, and not a single extra upload was issued.
    expect(result.current.items).toHaveLength(2);
    expect(uploadCalls).toBe(callsAfterFirst);
    expect(result.current.error).toMatch(/не более/i);
  });

  it('states the limit with a correctly declined Russian noun', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    await act(async () => {
      await result.current.addFiles(Array.from({ length: 6 }, (_, i) => makeFile(`f${i}.jpg`)));
    });

    // 5 → "файлов", never "файла"/"файл"
    expect(result.current.error).toBe(`Можно прикрепить не более ${GALLERY_MAX_ITEMS} файлов`);
  });

  // FR-003 — adding a 2nd item forms a gallery implicitly
  it('forms a gallery implicitly on the second item, with no separate action', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    await act(async () => { await result.current.addFiles([makeFile('a.jpg')]); });
    expect(result.current.items).toHaveLength(1);

    await act(async () => { await result.current.addFiles([makeFile('b.jpg')]); });
    expect(result.current.items).toHaveLength(2);
    expect(result.current.mediaIds).toHaveLength(2);
  });

  it('blocks new uploads for a media-restricted user (FR-009)', async () => {
    const { result } = renderHook(() => useMediaAttachments({ mediaAllowed: false }));

    await act(async () => {
      await result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    });

    expect(result.current.items).toHaveLength(0);
    expect(uploadCalls).toBe(0);
    expect(result.current.error).toBe('Вам запрещено прикреплять медиафайлы');
  });
});

describe('useMediaAttachments — partial failure (FR-034)', () => {
  it('keeps successful files and reports the invalid one by name', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    await act(async () => {
      await result.current.addFiles([
        makeFile('good1.jpg'),
        makeFile('notes.txt', 'text/plain'),
        makeFile('good2.jpg'),
      ]);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.failures).toHaveLength(1);
    expect(result.current.failures[0].name).toBe('notes.txt');
  });

  it('keeps successes when one file is oversized', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    await act(async () => {
      await result.current.addFiles([
        makeFile('ok.jpg'),
        makeFile('huge.jpg', 'image/jpeg', 50 * 1024 * 1024),
      ]);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.failures.map((f) => f.name)).toEqual(['huge.jpg']);
  });

  it('keeps successes when one upload request fails server-side', async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => {
      n++;
      if (n === 2) {
        return { ok: false, json: async () => ({ error: 'Ошибка сервера' }) } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ mediaId: `m${n}`, urls: { thumb: `/t${n}.webp` } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useMediaAttachments({}));
    await act(async () => {
      await result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.failures).toHaveLength(1);
    expect(result.current.failures[0].message).toBe('Ошибка сервера');
  });
});

describe('useMediaAttachments — video (FR-028)', () => {
  it('allows a lone video when nothing else is attached', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    await act(async () => {
      await result.current.addFiles([makeFile('clip.mp4', 'video/mp4')]);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasVideo).toBe(true);
  });

  it('rejects a video inside a multi-file batch but keeps the images', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    await act(async () => {
      await result.current.addFiles([
        makeFile('a.jpg'),
        makeFile('clip.mp4', 'video/mp4'),
        makeFile('b.jpg'),
      ]);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.hasVideo).toBe(false);
    expect(result.current.failures.map((f) => f.name)).toEqual(['clip.mp4']);
  });

  it('refuses to add anything once a video is attached', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    await act(async () => { await result.current.addFiles([makeFile('clip.mp4', 'video/mp4')]); });
    await act(async () => { await result.current.addFiles([makeFile('a.jpg')]); });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.error).toMatch(/Видео нельзя совмещать/);
  });
});

describe('useMediaAttachments — FR-035 gate signals (Stages 1–2)', () => {
  it('reports hasImages so the GIF picker can be disabled', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));
    await act(async () => { await result.current.addFiles([makeFile('a.jpg')]); });
    expect(result.current.hasImages).toBe(true);
    expect(result.current.hasGif).toBe(false);
  });

  it('reports hasGif so image attachment can be disabled', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));
    act(() => {
      result.current.addExisting({ mediaId: 'g1', previewUrl: '/g1.gif', isGif: true });
    });
    expect(result.current.hasGif).toBe(true);
    expect(result.current.hasImages).toBe(false);
  });

  it('reports isFull at the item cap', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));
    await act(async () => {
      await result.current.addFiles(Array.from({ length: 5 }, (_, i) => makeFile(`f${i}.jpg`)));
    });
    expect(result.current.isFull).toBe(true);
  });
});

describe('useMediaAttachments — clear (Stage 1 append-only)', () => {
  it('clears the whole selection', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));
    await act(async () => { await result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]); });
    expect(result.current.items).toHaveLength(2);

    act(() => { result.current.clear(); });
    expect(result.current.items).toHaveLength(0);
    expect(result.current.failures).toHaveLength(0);
  });

  it('exposes no per-item removal until Stage 3', () => {
    const { result } = renderHook(() => useMediaAttachments({}));
    // Guard against Stage 3 work landing early and silently.
    expect((result.current as Record<string, unknown>).removeAt).toBeUndefined();
    expect((result.current as Record<string, unknown>).reorder).toBeUndefined();
  });
});
