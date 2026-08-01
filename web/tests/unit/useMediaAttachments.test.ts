import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaAttachments, GALLERY_MAX_ITEMS, SUBMIT_FAILED_MESSAGE } from '../../hooks/useMediaAttachments';

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
  it('attaches files up to the limit without uploading anything (2026-07-30: upload deferred to submit)', () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    act(() => {
      result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    });

    expect(result.current.items).toHaveLength(3);
    expect(uploadCalls).toBe(0);
  });

  it('rejects the ENTIRE action when it would exceed the limit', () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    act(() => {
      result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    });
    expect(result.current.items).toHaveLength(2);

    // 2 attached + 4 more = 6 > 5 → whole action rejected.
    act(() => {
      result.current.addFiles([
        makeFile('c.jpg'), makeFile('d.jpg'), makeFile('e.jpg'), makeFile('f.jpg'),
      ]);
    });

    // Existing selection untouched.
    expect(result.current.items).toHaveLength(2);
    expect(result.current.error).toMatch(/не более/i);
  });

  it('states the limit with a correctly declined Russian noun', () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    act(() => {
      result.current.addFiles(Array.from({ length: 6 }, (_, i) => makeFile(`f${i}.jpg`)));
    });

    // 5 → "файлов", never "файла"/"файл"
    expect(result.current.error).toBe(`Можно прикрепить не более ${GALLERY_MAX_ITEMS} файлов`);
  });

  // FR-003 — adding a 2nd item forms a gallery implicitly
  it('forms a gallery implicitly on the second item, with no separate action', () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    act(() => { result.current.addFiles([makeFile('a.jpg')]); });
    expect(result.current.items).toHaveLength(1);

    act(() => { result.current.addFiles([makeFile('b.jpg')]); });
    expect(result.current.items).toHaveLength(2);
  });

  it('blocks new attachments for a media-restricted user (FR-009)', () => {
    const { result } = renderHook(() => useMediaAttachments({ mediaAllowed: false }));

    act(() => {
      result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.error).toBe('Вам запрещено прикреплять медиафайлы');
  });
});

describe('useMediaAttachments — client-side pre-validation (FR-034, narrowed 2026-07-30)', () => {
  it('keeps valid files pending and reports the invalid one by name, with no network call', () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    act(() => {
      result.current.addFiles([
        makeFile('good1.jpg'),
        makeFile('notes.txt', 'text/plain'),
        makeFile('good2.jpg'),
      ]);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.failures).toHaveLength(1);
    expect(result.current.failures[0].name).toBe('notes.txt');
    expect(uploadCalls).toBe(0);
  });

  it('keeps successes when one file is oversized', () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    act(() => {
      result.current.addFiles([
        makeFile('ok.jpg'),
        makeFile('huge.jpg', 'image/jpeg', 50 * 1024 * 1024),
      ]);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.failures.map((f) => f.name)).toEqual(['huge.jpg']);
  });
});

describe('useMediaAttachments — video (FR-028)', () => {
  it('allows a lone video when nothing else is attached', () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    act(() => {
      result.current.addFiles([makeFile('clip.mp4', 'video/mp4')]);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasVideo).toBe(true);
  });

  it('rejects a video inside a multi-file batch but keeps the images', () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    act(() => {
      result.current.addFiles([
        makeFile('a.jpg'),
        makeFile('clip.mp4', 'video/mp4'),
        makeFile('b.jpg'),
      ]);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.hasVideo).toBe(false);
    expect(result.current.failures.map((f) => f.name)).toEqual(['clip.mp4']);
  });

  it('refuses to add anything once a video is attached', () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    act(() => { result.current.addFiles([makeFile('clip.mp4', 'video/mp4')]); });
    act(() => { result.current.addFiles([makeFile('a.jpg')]); });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.error).toMatch(/Видео нельзя совмещать/);
  });
});

describe('useMediaAttachments — FR-035 gate signals (Stages 1–2)', () => {
  it('reports hasImages so the GIF picker can be disabled', () => {
    const { result } = renderHook(() => useMediaAttachments({}));
    act(() => { result.current.addFiles([makeFile('a.jpg')]); });
    expect(result.current.hasImages).toBe(true);
    expect(result.current.hasGif).toBe(false);
  });

  it('reports hasGif so image attachment can be disabled', () => {
    const { result } = renderHook(() => useMediaAttachments({}));
    act(() => {
      result.current.addExisting({ mediaId: 'g1', previewUrl: '/g1.gif', isGif: true });
    });
    expect(result.current.hasGif).toBe(true);
    expect(result.current.hasImages).toBe(false);
  });

  it('reports isFull at the item cap', () => {
    const { result } = renderHook(() => useMediaAttachments({}));
    act(() => {
      result.current.addFiles(Array.from({ length: 5 }, (_, i) => makeFile(`f${i}.jpg`)));
    });
    expect(result.current.isFull).toBe(true);
  });
});

describe('useMediaAttachments — clear', () => {
  it('clears the whole selection', () => {
    const { result } = renderHook(() => useMediaAttachments({}));
    act(() => { result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]); });
    expect(result.current.items).toHaveLength(2);

    act(() => { result.current.clear(); });
    expect(result.current.items).toHaveLength(0);
    expect(result.current.failures).toHaveLength(0);
  });

  it('exposes no reorder until Stage 3 (FR-025 remains deferred)', () => {
    const { result } = renderHook(() => useMediaAttachments({}));
    expect((result.current as Record<string, unknown>).reorder).toBeUndefined();
  });
});

// 2026-07-30 revision: per-item removal pulled forward from Stage 3, and
// upload moves from selection-time to submit-time, atomically.
describe('useMediaAttachments — deferred upload (FR-041, research D14)', () => {
  it('does not upload anything until submit() is called', () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    act(() => {
      result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    });

    expect(result.current.items).toHaveLength(2);
    expect(uploadCalls).toBe(0);
    expect(result.current.items[0].mediaId).toBeUndefined();
    expect(result.current.items[0].previewUrl).toBe('blob:mock');
  });
});

describe('useMediaAttachments — per-item removal (FR-024)', () => {
  it('removes one pending item without affecting the others or the network', () => {
    const { result } = renderHook(() => useMediaAttachments({}));

    act(() => {
      result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    });
    const [, second] = result.current.items;

    act(() => { result.current.removeItem(second.localId); });

    expect(result.current.items.map((i) => i.file?.name)).toEqual(['a.jpg', 'c.jpg']);
    expect(uploadCalls).toBe(0);
  });
});

describe('useMediaAttachments — atomic submit (FR-041, research D15)', () => {
  it('uploads every pending file in parallel and returns ordered mediaIds only once all succeed', async () => {
    const { result } = renderHook(() => useMediaAttachments({}));
    act(() => { result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]); });

    let submitResult: { mediaIds: string[] } | null | undefined;
    await act(async () => {
      submitResult = await result.current.submit();
    });

    expect(uploadCalls).toBe(2);
    expect(submitResult?.mediaIds).toHaveLength(2);
    expect(result.current.items.every((i) => !!i.mediaId)).toBe(true);
  });

  it('posts nothing and returns null when any upload fails', async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => {
      n++;
      if (n === 2) {
        return { ok: false, json: async () => ({ error: 'Ошибка сервера' }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ mediaId: `m${n}` }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useMediaAttachments({}));
    act(() => { result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]); });

    let submitResult: { mediaIds: string[] } | null | undefined;
    await act(async () => {
      submitResult = await result.current.submit();
    });

    expect(submitResult).toBeNull();
    expect(result.current.error).toBe(SUBMIT_FAILED_MESSAGE);
    expect(result.current.failures).toHaveLength(1);
  });

  it('leaves the pending list and composed text untouched on failure, ready for retry', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'Ошибка сервера' }),
    })) as unknown as typeof fetch;

    const { result } = renderHook(() => useMediaAttachments({}));
    act(() => { result.current.addFiles([makeFile('a.jpg')]); });

    await act(async () => { await result.current.submit(); });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].file?.name).toBe('a.jpg');
  });
});

describe('useMediaAttachments — retry reuses already-obtained mediaIds (research D16)', () => {
  it('does not re-upload a file that already succeeded on a prior failed attempt', async () => {
    let n = 0;
    let failOnce = true;
    globalThis.fetch = vi.fn(async () => {
      n++;
      if (n === 2 && failOnce) {
        failOnce = false;
        return { ok: false, json: async () => ({ error: 'Ошибка сервера' }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ mediaId: `m${n}` }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useMediaAttachments({}));
    act(() => { result.current.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]); });

    await act(async () => { await result.current.submit(); });
    expect(n).toBe(2); // both attempted once; b.jpg (2nd) failed

    let retryResult: { mediaIds: string[] } | null | undefined;
    await act(async () => {
      retryResult = await result.current.submit();
    });

    // Only b.jpg (previously failed) should be retried — a.jpg's already
    // obtained mediaId must not trigger a second upload call.
    expect(n).toBe(3);
    expect(retryResult?.mediaIds).toHaveLength(2);
  });
});

describe('useMediaAttachments — permission revoked at submit time (FR-009, reworded 2026-07-30)', () => {
  it('blocks the entire submission when the server rejects an upload', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'Вам запрещено прикреплять медиафайлы' }),
    })) as unknown as typeof fetch;

    const { result } = renderHook(() => useMediaAttachments({}));
    act(() => { result.current.addFiles([makeFile('a.jpg')]); });

    let submitResult: { mediaIds: string[] } | null | undefined;
    await act(async () => {
      submitResult = await result.current.submit();
    });

    expect(submitResult).toBeNull();
    expect(result.current.failures[0].message).toBe('Вам запрещено прикреплять медиафайлы');
  });
});
