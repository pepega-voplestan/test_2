# Quickstart: Validating Multi-Media Gallery Attachments

**Feature**: 006-multi-media-gallery | **Date**: 2026-07-25 (revised 2026-07-26)

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
| `web/tests/unit/` | Capacity gate rejects whole action (FR-033); partial failure retains successes (FR-034); GIF gate active (FR-035); Russian plural declensions; grid layout per item count + clamped container ratio (FR-012/FR-014) |

### Manual

1. Compose a shout, select **3 images at once** → all three appear pending.
2. Drag **4 images** onto the composer → same result via drop (FR-004/FR-005).
3. Try to add **6 total** → nothing is added, existing selection intact, Russian
   limit message shown (FR-033).
4. Drop a batch containing **one `.txt`** → valid images attach, the `.txt` is
   reported by name (FR-034).
5. With an image attached, open the GIF picker → **unavailable** (FR-035).
6. Publish a 3-image gallery → feed shows **all three** as a grid: one tall tile
   left, two stacked right (FR-012). No "+N" badge anywhere.
7. Click the **third** tile → the existing viewer opens on that image, full size,
   with zoom and drag-to-dismiss working (FR-036). Dismiss returns to the feed.
8. Post 2-, 4- and 5-image galleries → layouts match the four arrangements in
   [contracts/gallery-grid.md](./contracts/gallery-grid.md).
9. Post a gallery whose **first** image is extreme portrait (e.g. 1:4) → the
   container is clamped, not four times taller than a normal post (FR-014).
10. Compare a gallery in a **comment** vs a **shout** → the comment grid is
    visibly shorter (200px vs 300px cap) and otherwise identical (FR-015/FR-031).
11. **Regression check (SC-006)**: find a pre-existing single-image shout →
    renders exactly as before, with no grid and no change in size.
12. Set a user's `is_media_allowed = false` in admin → their multi-upload fails
    entirely with 005's existing message, nothing attaches (FR-009).

### Deploy gate

- [ ] Constitution amended (the "Single media per post/comment" constraint)
- [ ] `CLAUDE.md` / `docs/*` updated **via the `/docs` skill only**
- [ ] Pre-existing single-media content verified unchanged in production

## Stage 2 — Navigating between items

### Manual

1. Open a 4-image gallery by clicking its **third** tile → viewer opens on the third item, and inter-item navigation is now available (FR-017).
2. Navigate forward past the last → wraps to the first (FR-019).
3. Navigate back from the first → wraps to the last (FR-019).
4. Position indicator reads `1 / 4` … `4 / 4` (FR-021).
5. Each image displays **whole, uncropped** (FR-020).
6. Open a **1-item** gallery → no navigation controls (FR-022).
7. Dismiss → feed scroll position preserved (FR-023).
8. Same checks on a **comment** gallery (FR-031).

### Regression checks (existing Lightbox behavior must not break)

9. Pinch-zoom, wheel-zoom, double-tap zoom still work.
10. **While zoomed, horizontal drag still pans** and does *not* navigate
    (research D6) — this is the most likely regression in this stage.
11. Vertical drag-to-dismiss still works; Escape still closes.

### Responsive check

12. At the narrowest supported mobile width, arrows remain on-screen, reachable,
    and not overlapped by the image (FR-018, SC-005).

## Stage 3 — Curate and mix

### Manual

1. Attach 4 images, **remove the 2nd** → only it is removed, order preserved
   (FR-024).
2. **Reorder** so the last becomes first → composer reflects it; after publishing
   that item is the preview (FR-025, FR-007 of US3).
3. Force a failure during remove/reorder → UI **reverts** (Constitution V).
4. Attach 2 images **plus a GIF** → all in one gallery (FR-026); GIF gate is gone.
5. Browse the mixed gallery fullscreen → GIF animates, statics display,
   navigation unaffected (US3 #5).
6. Restricted user (005): uploading a **new** GIF is blocked, but re-selecting an
   **existing** GIF from "Мои GIF" succeeds (FR-009, SC-007).

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
- Inline grid UI: [contracts/gallery-grid.md](./contracts/gallery-grid.md)
- Write rules: [contracts/shout-comment-create.md](./contracts/shout-comment-create.md)
- Upload flow: [contracts/upload-orchestration.md](./contracts/upload-orchestration.md)
- Schema and invariants: [data-model.md](./data-model.md)
