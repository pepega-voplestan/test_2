# Phase 1 Data Model: Time-Limited Media Retention

**No schema migration.** No table, column, index, or relation is added, altered, or dropped. Every state this feature needs lives in the existing `media.media_meta` JSON column, and every removal is a file removal (FR-023).

---

## Existing entities touched

### `media` (Prisma model, unchanged)

| Field | Used for |
|---|---|
| `id` | Cursor paging key; CAS target |
| `media_type` | Candidate filter — `"image"` for US1, `"video"` for US2 |
| `media_url` | Directory name under the media volume |
| `media_meta` | Reclaim state (below); also the CAS guard value |
| `created_at` | The **only** age clock, per D1 and FR-016 |

Rows are read and their `media_meta` updated. No row is ever deleted.

### `shout_media` / `comment_media` / `user_gifs`

`shout_media` and `comment_media` are read **only** by the existing `media-reclaim` job. Neither new sweep consults them: age-based expiry deliberately ignores reachability (D4), and video expiry applies to live posts by design.

`user_gifs` **is** read by the image sweep, as a categorical exemption (FR-004a). It is the one reference table that matters here, and it must be consulted directly rather than through the existing helpers. `hasLiveReference` and `hasAnyReference` both OR the library lookup together with `shout_media`/`comment_media`, so either one returns true for any image attached to a live post — the entire target population of this feature. Using them as the guard would make the sweep a silent no-op that still reports success. The image sweep therefore uses a narrow `libraryMediaIds` helper, added alongside them in `workers/src/helpers/media-refs.ts` so the reference queries stay in one place.

The video sweep needs no such guard: `user_gifs` holds GIFs only, which are stored `media_type: "image"`, and the video sweep queries `media_type: "video"`.

---

## `ReclaimedMarker` — the one structure that changes

Declared in `workers/src/helpers/reclaim.ts`, serialized into `media_meta.reclaimed`.

```ts
export interface ReclaimedMarker {
  /** Variant widths whose .webp files were removed, e.g. ["320", "1600"]. */
  variants?: string[];
  /** True once EVERY file is gone — the media is permanently unrenderable. */
  files?: boolean;
  /** NEW: the uploaded mp4 expired by age. Row and post survive; a tombstone renders. */
  video?: boolean;
  at: string;
}
```

`mergeReclaimed` gains one clause, mirroring how it already preserves `files`:

```ts
...(patch.video || prior?.video ? { video: true } : {}),
```

`variants` continues to accumulate as a set union across runs, so a later sweep never forgets an earlier one's removals.

### State matrix

These three states must stay distinguishable — this is FR-022's entire purpose.

| State | Set by | Files gone | `buildMedia` returns | Attachment visible? |
|---|---|---|---|---|
| *(no marker)* | — | none | full DTO | yes |
| `variants: ["1600"]` | **this feature, US1** | `1600.webp` | image DTO **without** `full` | yes, at display resolution |
| `video: true` | **this feature, US2** | `original.mp4` | `{ type:"video", expired:true }` | yes, as a Russian tombstone |
| `files: true` | feature 008 reclaim | all | `undefined` | **no** — post renders media-free |

`files: true` dominates: `isMediaReclaimed` is checked first in `buildMedia`, so a wholesale-reclaimed item never reaches the per-class branches. Both sweeps skip such media (FR-024) and must not count its bytes again.

---

## Retention window (constants)

Two per-class values, hardcoded in `workers/src/helpers/retention.ts`:

```ts
export const IMAGE_RETENTION_DAYS = 7;
export const VIDEO_RETENTION_DAYS = 30;
```

| Constant | Value | Governs |
|---|---|---|
| `IMAGE_RETENTION_DAYS` | `7` | Age past which `1600.webp` expires |
| `VIDEO_RETENTION_DAYS` | `30` | Age past which `original.mp4` expires |

Not environment variables. These windows are a product decision, not a per-deployment knob — nobody tunes them at runtime, and every environment wants the same answer. Changing one is a code change, reviewed and deployed like any other.

**On FR-015a** — the constitutional requirement that an absent, zero, negative, or unparseable window make the sweep remove nothing and fail loudly is satisfied *structurally* rather than at runtime. A literal cannot be absent, empty, or unparseable; the type checker rejects a non-number; and a negative or zero value is visible in the diff at review time. There is nothing to parse, so there is no parse to get wrong — which is precisely the failure mode the rule exists to prevent. This removes the feature's most destructive available shortcut (`Number(env) || DEFAULT`, where `Number("-1") || 7` yields `-1` and puts the age cutoff in the future) by removing the input entirely.

---

## Sweep result (in-memory, per run)

Extends the shared `ReclaimResult` (`scanned`, `reclaimed`, `skipped`, `failed`, `bytesFreed`, `dryRun`), following `MediaReclaimResult`'s precedent that `skipped` is a total and `retained` explains it. Without the split, a zero-expiry run is indistinguishable from a broken one (FR-020).

### `ImageVariantExpiryResult.retained`

| Reason | Meaning |
|---|---|
| `inWindow` | Younger than the retention window |
| `animated` | Animated image — never eligible, at any age (FR-004) |
| `library` | Saved in a user's personal library — never eligible, at any age (FR-004a) |
| `pendingOriginal` | `orig` present and not yet converted — see research R2 |
| `alreadyExpired` | `variants` already records `1600` |
| `alreadyReclaimed` | `files: true` — feature 008 got there first (FR-024) |
| `noSurvivor` | `960.webp` missing or empty — refuse to remove the last copy |
| `raced` | CAS matched no row; replanned next sweep |
| `unreadableMeta` | Unparseable `media_meta` — counted, never removed on a guess |

### `VideoExpiryResult.retained`

| Reason | Meaning |
|---|---|
| `inWindow` | Younger than the retention window |
| `alreadyExpired` | `video: true` already set |
| `alreadyReclaimed` | `files: true` — 008 got there first |
| `raced` | CAS matched no row |
| `unreadableMeta` | Unparseable `media_meta` |

Remote kinds (`youtube`, `giphy`) never enter either candidate set — the query filters on `media_type`, so they are not even scanned (FR-010).

---

## Invariants

1. **No row is deleted, ever.** Files only (FR-023, §III Records).
2. **`960.webp` is never removed** by this feature and remains the universal serving fallback.
3. **Animated media is never touched** at any age — not its `320.webp`, not its `960.webp`, not `original.gif` (FR-004), enforced by the `meta.animated` check.
4. **Personal-library media is never touched** at any age (FR-004a), enforced by a `user_gifs` lookup. This is a *separate* invariant from the one above, and the distinction is load-bearing: `meta.animated` is false for a single-frame GIF, because `gifs.js` derives it from `pages > 1` and `buildMedia` then serves such a GIF as a still — with a `1600.webp` written for it, which the lightbox reads as `full`. A guard resting on `meta.animated` alone therefore expires a file that §III exempts absolutely. Library membership must be looked up, never inferred.
5. **Avatars are outside the model** — they carry no `media` row and live on a separate volume, so no exclusion is needed (the same reasoning already recorded in `media-reclaim.ts`).
6. **Marker before unlink**, always, via `performReclaim`. A crash leaves a stray file, never an advertised address with no file (FR-018, SC-008).
7. **The advertised DTO tracks the marker.** Any state added here must be reflected in `buildMedia` in the same change, or FR-003 is violated.
