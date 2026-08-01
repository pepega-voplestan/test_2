# Quickstart: Validating Multi-Media Gallery Attachments

**Feature**: 006-multi-media-gallery | **Date**: 2026-07-25 (revised 2026-07-26, 2026-07-30, 2026-07-31)

How to run and verify each stage. Stages are independently deployable — validate
and ship one before starting the next (SC-009).

## Prerequisites

```sh
make install                 # root + api + web + workers deps
cd web && npm run dev        # API :3000 + Vite :5173
```

Database changes (Stage 1 only):

```sh
cd api && npx prisma migrate dev --name add_media_galleries
```

> Local Prisma commands that reset data require
> `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1`. `migrate dev` on an additive
> migration should not need it.

Test suites:

```sh
make test        # API
make test-web    # web
make test-all    # both
```

## Stage 1 — Publish and view galleries

### Automated

```sh
make test-all
```

Expected new coverage:

| File | Asserts |
|---|---|
| `api/tests/integration/shouts.test.js` | 5 ids accepted; 6 rejected (R2); duplicate ids rejected (R6); gallery + `youtubeUrl` rejected (R3); non-existent id rejected (R4); **Invariant I1** — `media_id` equals position-0 row |
| `api/tests/integration/comments.test.js` | Same rules apply identically to comments (FR-031) |
| `api/tests/integration/feed.test.js` | `gallery` present with 2+ items, **absent** with 1 (FR-016); `gallery[0]` deep-equals `media` (G1); order stable (G2) |
| `api/tests/integration/upload.test.js` | Unchanged per-file behavior still passes; restricted user (005) still blocked |
| `web/tests/unit/` | Capacity gate rejects whole action (FR-033); client-side pre-validation retains valid files (FR-034); GIF gate active and now permanent (FR-035); Russian plural declensions; **(2026-07-30)** no upload call fires before submit; per-item removal (FR-024); pending tile opens Lightbox on its object URL (FR-037); atomic submit blocks all-or-nothing on a failing upload (FR-041); retry reuses already-obtained `mediaId`s without re-uploading (research D16); **(2026-07-31)** carousel paging/looping arithmetic, fixed 1:1-square frame regardless of item ratio (FR-012/FR-014); GIF picker also blocked once one GIF is attached, either source (research D19) |
| `api/tests/integration/shouts.test.js` / `comments.test.js` | **(2026-07-31)** A 2+-item `mediaIds` array containing an uploaded animated GIF file is rejected (extended R5, research D19) — in addition to the pre-existing Giphy-picker-GIF rejection |

### Manual

1. Compose a shout, select **3 images at once** → all three appear pending in
   the bordered, horizontally-scrolling `PendingMediaStrip`, at the unified 80px
   size — and confirm in devtools' Network tab that **no request to
   `/upload/media` has fired yet** (2026-07-30: upload is now deferred to
   submit).
2. Drag **4 images** onto the composer → same result via drop (FR-004/FR-005).
3. Try to add **6 total** → nothing is added, existing selection intact, Russian
   limit message shown (FR-033).
4. Drop a batch containing **one `.txt`** → valid images become pending
   immediately (client-side check, no network call), the `.txt` is reported by
   name (FR-034).
5. With an image attached, open the GIF picker → **unavailable** (FR-035).
6. **(2026-07-30)** With four items pending, activate the remove control on the
   **second** one → only it disappears, the other three keep their relative
   order, and nothing hits the network (FR-024).
7. **(2026-07-30)** Click one of the pending tiles → the existing `Lightbox`
   opens on that item's local preview, with the same zoom/pan/dismiss behavior
   as a published image (FR-037).
8. **(2026-07-30)** Submit a post with several pending items on a healthy
   connection → all upload (check Network tab: requests fire only now, at
   submit, in parallel), then the create request follows, and the composer
   clears.
9. **(2026-07-30)** Simulate a failing upload for one file in a multi-item batch
   (e.g. throttle/block one request in devtools) and submit → **nothing is
   posted**, the specific failing file is named, all other pending items and any
   typed text remain exactly as they were, and a "Try again" button is shown
   (FR-041). Restore the connection and click **Try again** → confirm (Network
   tab) that files which already succeeded are **not** re-uploaded, only the
   previously-failing one is retried, and the submission then completes.
10. Publish a 3-image gallery → feed shows the **first** image in a carousel
    frame, with arrows on the frame's left/right edges and a position
    indicator ("1 / 3") at the bottom of the frame. *(Revised 2026-07-31 —
    supersedes "shows all three as a grid.")*
11. Navigate forward twice, then once more → the carousel wraps back to the
    first image (FR-043); navigate backward from the first → wraps to the
    last. *(Added 2026-07-31 — absorbed from the retired Stage 2.)*
12. Activate the currently-displayed image → the existing viewer opens on it,
    full size, with zoom and drag-to-dismiss working (FR-036). Dismiss returns
    to the feed at the same carousel position.
13. Post 2-, 4- and 5-image galleries with mixed aspect ratios (some portrait,
    some landscape, some square) → the frame is the **same fixed 1:1 square**
    for every one of them, every image is letterboxed to fit whole (never
    cropped or stretched), and gaps are filled with the page's darkest
    background — see [contracts/gallery-carousel.md](./contracts/gallery-carousel.md).
    *(Revised 2026-07-31 — supersedes the "layouts match the four arrangements"
    and "extreme portrait clamped" checks, which described the retired grid.)*
14. Compare a gallery in a **comment** vs a **shout** → the comment carousel
    frame is visibly smaller (200px vs 300px cap) and otherwise identical
    (FR-015/FR-031); confirm the pending `PendingMediaStrip` itself is the
    **same 80×80 size in both composers** (FR-040).
15. **Regression check (SC-006)**: find a pre-existing single-image shout →
    renders exactly as before, with no carousel controls and no change in size.
16. Set a user's `is_media_allowed = false` in admin → their submit fails
    entirely with 005's existing message, nothing attaches, nothing posts
    (FR-009).
17. **(2026-07-31)** With one GIF already attached (either an uploaded `.gif`
    file or one picked from "Мои GIF"/Giphy search), open the GIF picker
    again → **unavailable** — a gallery may never contain more than one GIF
    (research D19). Attach an image instead while a GIF is attached → also
    unavailable, unchanged from before.
18. **(2026-07-31)** Attempt to submit a `mediaIds` request containing an
    uploaded animated `.gif` file alongside another image (e.g. via a modified
    client, bypassing the composer's own gate) → the server rejects it (R5,
    extended to check `media_meta.animated`, not just `media_type`) — confirm
    this in `api/tests/integration/shouts.test.js`/`comments.test.js`, since
    the composer UI itself should never let a real user reach this state.

### Deploy gate

- [ ] Constitution amended (the "Single media per post/comment" constraint)
- [ ] `CLAUDE.md` / `docs/*` updated **via the `/docs` skill only**
- [ ] Pre-existing single-media content verified unchanged in production
- [ ] **(2026-07-30)** No `/upload/media` request observed before submit is
      clicked, in a manual network trace
- [ ] **(2026-07-30)** Failed-submit retry verified to skip already-uploaded
      files (research D16)
- [ ] **(2026-07-31)** Carousel frame verified fixed-size/letterboxed across a
      gallery with mixed aspect ratios, at the narrowest supported mobile width
      (SC-005/SC-010)
- [ ] **(2026-07-31)** Uploaded-animated-GIF gap in R5 verified closed
      server-side (research D19), and the client GIF-picker gate verified to
      block a second GIF of either source
- [ ] **(2026-07-31)** Second `/docs` correction landed — constitution v2.0.0
      and `CLAUDE.md` no longer say "images/GIFs"

## ~~Stage 2 — Navigating between items~~ — RETIRED 2026-07-31

*Retired in full — see `plan.md`'s Stage 2 section and `research.md` D20.*
Looping navigation, edge-anchored arrows, and the position indicator are all
now covered by Stage 1's carousel (manual steps 10–12 above); there is no
separate fullscreen navigation stage left to validate. The regression checks
below remain relevant to `Lightbox.tsx` in general (they were never actually
gallery-specific) and are worth keeping as a standing regression list, not
because Stage 2 still exists:

- Pinch-zoom, wheel-zoom, double-tap zoom still work.
- Vertical drag-to-dismiss still works; Escape still closes.
- At the narrowest supported mobile width, `Lightbox`'s own controls remain
  reachable and are never overlapped by the image.

## Stage 3 — Reorder

**Scope note (narrowed 2026-07-30, narrowed again 2026-07-31)**: per-item
removal moved to Stage 1 — see manual step 6 in that section. GIF-mixing work
is removed entirely — GIFs are now permanently excluded from galleries (see
Stage 1's steps 17–18) — so this stage covers only reordering.

### Manual

1. **Reorder** so the last becomes first → composer reflects it; after publishing
   that item opens the carousel first (FR-025, FR-007 of US3).
2. Force a failure during reorder → UI **reverts** (Constitution V).

## Cross-stage: the 24-hour compression window

Gallery items inherit the original-quality window per item (FR-010, SC-008).

```sh
# Verify no gallery item is treated as orphaned (research D7)
grep -n "liveShout\|liveComment" workers/src/jobs/original-downgrade.ts
```

Run the job with a shortened window against a published gallery and confirm
**every** item is converted — not just the preview item.

## Reference

- Read shape: [contracts/gallery-dto.md](./contracts/gallery-dto.md)
- Inline carousel UI: [contracts/gallery-carousel.md](./contracts/gallery-carousel.md) (replaces the retired [contracts/gallery-grid.md](./contracts/gallery-grid.md))
- Write rules: [contracts/shout-comment-create.md](./contracts/shout-comment-create.md)
- Upload flow: [contracts/upload-orchestration.md](./contracts/upload-orchestration.md)
- Schema and invariants: [data-model.md](./data-model.md)
