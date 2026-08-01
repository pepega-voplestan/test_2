import { describe, it, expect } from 'vitest';
// Vite's `?raw` suffix inlines the file as a string at transform time. Used
// instead of fs/path so this test needs no Node type declarations — the web
// package has no @types/node, and the production `tsc && vite build` type-checks
// test files too, so a Node import here breaks the Docker build.
import shoutInput from '../../components/ShoutInput.tsx?raw';
import shoutCard from '../../components/ShoutCard.tsx?raw';

/**
 * Composer parity guard (FR-031).
 *
 * There are TWO composers: `ShoutInput.tsx` (shouts) and the reply composer
 * inside `ShoutCard.tsx` (comments). Before feature 006 they had independently
 * duplicated upload logic, and the reply composer had no drag-and-drop at all —
 * a gap that made FR-031 unsatisfiable and was only caught during analysis.
 *
 * These are structural assertions over source text rather than behavioural
 * renders: ShoutCard is a ~1800-line component whose reply composer only mounts
 * behind auth + expansion state, so a full render test would assert far more
 * setup than signal. What actually matters — and what regressed before — is that
 * both composers go through the SAME hook and expose the same affordances.
 */

describe('composer parity — shared attachment hook (FR-031)', () => {
  it('both composers consume useMediaAttachments', () => {
    expect(shoutInput).toContain("from '../hooks/useMediaAttachments'");
    expect(shoutCard).toContain("from '../hooks/useMediaAttachments'");
    expect(shoutInput).toMatch(/useMediaAttachments\(\{/);
    expect(shoutCard).toMatch(/useMediaAttachments\(\{/);
  });

  it('neither composer keeps its own upload-to-/upload/media implementation', () => {
    // The endpoint may only be called from the shared hook now.
    expect(shoutInput).not.toContain("'/api/v1/upload/media'");
    expect(shoutCard).not.toContain("'/api/v1/upload/media'");
  });

  it('neither composer redeclares its own size limit', () => {
    expect(shoutInput).not.toMatch(/const MEDIA_MAX_MB\s*=/);
    expect(shoutCard).not.toMatch(/const MEDIA_MAX_MB\s*=/);
  });
});

describe('composer parity — multi-select and drag-and-drop (FR-004, FR-005)', () => {
  it('both file inputs accept multiple files', () => {
    // Each composer has exactly one media file input, and it must be `multiple`.
    const inputRe = /<input[^>]*type="file"[^>]*>/gs;
    for (const [name, src] of [['ShoutInput', shoutInput], ['ShoutCard', shoutCard]] as const) {
      const inputs = src.match(inputRe) ?? [];
      const mediaInputs = inputs.filter((i: string) => i.includes('image/jpeg'));
      expect(mediaInputs.length, `${name} media file inputs`).toBeGreaterThan(0);
      for (const input of mediaInputs) {
        expect(input, `${name} file input must allow multi-select`).toContain('multiple');
      }
    }
  });

  it('both composers wire a drop handler onto their form', () => {
    expect(shoutInput).toMatch(/onDrop=\{handleDrop\}/);
    // This is the gap that feature 006 closed — the reply composer had none.
    expect(shoutCard).toMatch(/onDrop=\{handleReplyDrop\}/);
    expect(shoutCard).toMatch(/const handleReplyDrop\b/);
  });

  it('both drop handlers pass the whole file list, not just the first file', () => {
    expect(shoutInput).toMatch(/addFiles\(files\)/);
    expect(shoutCard).toMatch(/addFiles\(files\)/);
    // The old single-file pattern must be gone from both.
    expect(shoutInput).not.toMatch(/dataTransfer\.files\?\.\[0\]/);
    expect(shoutCard).not.toMatch(/dataTransfer\.files\?\.\[0\]/);
  });
});

describe('composer parity — gallery submission (FR-006)', () => {
  it('both composers send mediaIds for a gallery and mediaId for a single item', () => {
    expect(shoutInput).toMatch(/body\.mediaIds\s*=/);
    expect(shoutCard).toMatch(/body\.mediaIds\s*=/);
    expect(shoutInput).toMatch(/body\.mediaId\s*=/);
    expect(shoutCard).toMatch(/body\.mediaId\s*=/);
  });
});

describe('composer parity — FR-035 gate, permanent as of 2026-07-31', () => {
  it('both composers gate the GIF picker while images are attached', () => {
    expect(shoutInput).toMatch(/gifPickerBlocked/);
    expect(shoutCard).toMatch(/replyGifBlocked/);
  });

  it('both composers gate image attachment while a GIF is attached', () => {
    expect(shoutInput).toMatch(/imageAttachBlocked/);
    expect(shoutCard).toMatch(/replyImageBlocked/);
  });

  it('both GIF-picker gates also block once a GIF is already attached, not just when an image is (research D19)', () => {
    // Closes the "stack multiple GIFs" gap: hasGif must be part of the
    // blocking condition, not only hasImages/hasVideo/isFull.
    expect(shoutInput).toMatch(/gifPickerBlocked = media\.hasImages \|\| media\.hasVideo \|\| media\.isFull \|\| media\.hasGif/);
    expect(shoutCard).toMatch(/replyGifBlocked = replyMedia\.hasImages \|\| replyMedia\.hasVideo \|\| replyMedia\.isFull \|\| replyMedia\.hasGif/);
  });

  it('both gates are documented as permanent, not time-boxed to a stage', () => {
    // Guards against the gate silently reverting to "temporary" framing —
    // FR-026 (mixed galleries) is reversed for good, not deferred.
    expect(shoutInput).toMatch(/PERMANENT/);
    expect(shoutCard).toMatch(/PERMANENT/);
    expect(shoutInput).not.toMatch(/REMOVE THIS GATE IN STAGE 3/);
    expect(shoutCard).not.toMatch(/Remove in Stage 3/);
  });
});

describe('composer parity — pending-preview & upload-timing revision (2026-07-30)', () => {
  it('both composers render the shared PendingMediaStrip instead of ad hoc preview markup', () => {
    expect(shoutInput).toContain("from './PendingMediaStrip'");
    expect(shoutCard).toContain("from './PendingMediaStrip'");
    expect(shoutInput).toMatch(/<PendingMediaStrip\b/);
    expect(shoutCard).toMatch(/<PendingMediaStrip\b/);
  });

  it('both composers call media.submit() before building the create request (FR-041)', () => {
    expect(shoutInput).toMatch(/await media\.submit\(\)/);
    expect(shoutCard).toMatch(/await replyMedia\.submit\(\)/);
  });

  it('both composers bail out without posting when submit() returns null', () => {
    expect(shoutInput).toMatch(/if \(!uploadResult\) return/);
    expect(shoutCard).toMatch(/if \(!uploadResult\) return/);
  });

  it('both composers expose a "Попробовать снова" retry action tied to the atomic-submit failure', () => {
    expect(shoutInput).toMatch(/SUBMIT_FAILED_MESSAGE/);
    expect(shoutCard).toMatch(/SUBMIT_FAILED_MESSAGE/);
    expect(shoutInput).toContain('Попробовать снова');
    expect(shoutCard).toContain('Попробовать снова');
  });

  it('both composers use removeItem for per-item removal, not clear() (FR-024)', () => {
    expect(shoutInput).toMatch(/media\.removeItem\(/);
    expect(shoutCard).toMatch(/replyMedia\.removeItem\(/);
  });

  it('ShoutInput cancels its form\'s p-4 so the divider reaches the box edges; ShoutCard\'s reply form has no padding to cancel', () => {
    expect(shoutInput).toMatch(/<PendingMediaStrip\b[^>]*\bedgeToEdge\b/);
    expect(shoutCard).not.toMatch(/<PendingMediaStrip\b[^>]*\bedgeToEdge\b/);
  });
});

describe('gallery rendering — single-item carousel (FR-012, FR-031, FR-036, revised 2026-07-31)', () => {
  it('ShoutCard renders GalleryCarousel (not the retired GalleryGrid) for both shouts and comments', () => {
    expect(shoutCard).toContain("import GalleryCarousel from './GalleryCarousel'");
    expect(shoutCard).not.toContain("GalleryGrid");
    expect(shoutCard).toMatch(/shout\.gallery && shout\.gallery\.length > 1/);
    expect(shoutCard).toMatch(/comment\.gallery && comment\.gallery\.length > 1/);
  });

  it('the replaced first-item-only preview is gone', () => {
    expect(shoutCard).not.toMatch(/GalleryPreview/);
  });

  it('passes the per-context max height — 300 for shouts, 200 for comments (FR-015)', () => {
    expect(shoutCard).toMatch(/items=\{shout\.gallery\}[\s\S]{0,80}maxHeight=\{300\}/);
    expect(shoutCard).toMatch(/items=\{comment\.gallery\}[\s\S]{0,40}maxHeight=\{200\}/);
  });

  it('opens the viewer on the activated tile rather than always the first (FR-036)', () => {
    expect(shoutCard).toMatch(/onOpen=\{setGalleryIndex\}/);
    expect(shoutCard).toMatch(/galleryIndex !== null && shout\.gallery\?\.\[galleryIndex\]/);
    expect(shoutCard).toMatch(/galleryIndex !== null && comment\.gallery\?\.\[galleryIndex\]/);
  });

  it('no longer branches on animated/gif for gallery items, since galleries are images-only', () => {
    // The Lightbox src for a gallery item used to ternary on `.animated && .gif`
    // — that branch can never fire anymore (FR-035), so it's dead code, removed.
    expect(shoutCard).not.toMatch(/shout\.gallery\[galleryIndex\]\.animated/);
    expect(shoutCard).not.toMatch(/comment\.gallery\[galleryIndex\]\.animated/);
  });
});

describe('upload-failure filenames wrap on narrow viewports (FR-034, Phase 7 convergence)', () => {
  it('both composers apply word-break to the per-file failure list', () => {
    expect(shoutInput).toMatch(/media\.failures\.map[\s\S]{0,80}break-words/);
    expect(shoutCard).toMatch(/replyMedia\.failures\.map[\s\S]{0,120}break-words/);
  });
});
