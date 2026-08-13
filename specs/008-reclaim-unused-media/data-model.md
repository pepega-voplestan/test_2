# Data Model: Reclaim Unused Media Storage

**Feature**: 008-reclaim-unused-media | **Date**: 2026-08-12

**No Prisma schema migration.** All state lives in the existing
`media.media_meta` JSON column, per [research D1](./research.md#d1). Every table
below is existing structure, documented for the reference-checking rules.

---

## Modified: `media.media_meta` (JSON string)

Existing keys — unchanged by this feature:

| Key | Type | Set when |
|---|---|---|
| `w`, `h` | int | Always, at upload |
| `size` | int | Always — source file size at upload |
| `mime` | string | Always |
| `animated` | bool | Always — `true` for multi-page GIF |
| `orig` | string | JPG/PNG only; removed by `original-downgrade` |
| `uploaded_at` | ISO string | With `orig` |
| `converted` | bool | JPG/PNG only; `true` after original reclaimed |
| `orientation` | int | JPG/PNG with non-default EXIF; removed with `orig` |

New key added by this feature:

```jsonc
{
  "reclaimed": {
    "variants": ["320"],        // widths whose .webp files were removed
    "files": false,             // true = ALL files gone, media is unrenderable
    "at": "2026-08-12T10:00:00.000Z"
  }
}
```

**Invariants**

- `reclaimed` is written once per transition and never removed. Its presence is
  the idempotency marker (FR-018).
- `variants` and `files` are independent. Only the recurring job writes a
  marker, setting `files: true`; the one-time variant reclaim ships as a host
  shell script that reads the database and never writes it (contract C5), so
  `variants` is read-tolerated but currently written by nothing. Readers and the
  merge helper must still preserve it — a marker is never dropped once present.
- `files: true` means the media is permanently unrenderable. This is the flag
  that makes a restored post render media-free rather than broken (FR-014).
- Written to the DB **before** any `unlink`, per FR-017. A crash between the two
  leaves a stray file, never a dangling address.

**On-disk mirror**: `{mediaId}/meta.json` is updated best-effort after the DB
write, matching `original-downgrade.ts:124`. The DB is authoritative.

---

## Read-only: reference tables

The `hasLiveReference` predicate ([research D9](./research.md#d9)) consults
exactly these three. Media is **protected** if any returns a row.

| Table | Join | Protecting condition |
|---|---|---|
| `shout_media` | `media_id` → `shouts.id` | `shouts.is_deleted = 0` (live) **or** `= 2` (banned — exempt per constitution §III) |
| `comment_media` | `media_id` → `comments.id` | `comments.is_deleted = 0` **or** `= 2` |
| `user_gifs` | `media_id` | `user_gifs.is_deleted = 0` |

**Only `is_deleted = 1` fails to protect**, and only after the grace period.

`shout_media` and `comment_media` declare `onDelete: Cascade` on their parent
(`schema.prisma:92`, `:107`), but deletion is soft — the cascade never fires and
join rows always survive. This is why a `LEFT JOIN ... IS NULL` orphan test is
wrong: it finds only never-published media and silently misses everything behind
a deleted post.

---

## Candidate classification

Every `media` row with `media_type IN ('image','video')` falls into exactly one
class per sweep. `youtube` and `giphy` rows are skipped — they own no local
files.

| Class | Condition | Action | Story |
|---|---|---|---|
| **Protected** | `hasLiveReference` true | None | — |
| **Unreachable variant** | Protected, but holds a variant its kind can't display | Remove that variant, set `reclaimed.variants` | US1 |
| **Never published** | No reference of any kind, `created_at` older than `MEDIA_UNPUBLISHED_GRACE_DAYS` | Remove all files, set `reclaimed.files` | US2 |
| **Behind deleted content** | Only references are to `is_deleted = 1`, deleted longer ago than `MEDIA_DELETED_GRACE_DAYS` | Remove all files, set `reclaimed.files` | US3 |
| **In grace** | As above but inside its window | None — re-evaluated next sweep | — |

---

## Per-kind variant reachability

The rule the one-time script encodes. Derived by auditing every consumer.

| Kind | `320.webp` | `960.webp` | `1600.webp` | `original.gif` |
|---|---|---|---|---|
| Non-animated image | **Unreachable** | Inline + gallery (`url`) | Lightbox (`full`) | — |
| Animated image (GIF) | Library grid (`gifs.js:220`) | Blur placeholder (`ShoutCard.tsx:1382`) | **Unreachable** | Inline + lightbox |
| Video | Declared as `thumb`, no reader | `original.mp4` is the asset | — | — |

`960.webp` is reachable for every kind and is never reclaimed by this feature —
the guarantee the nginx fallback in [research D5](./research.md#d5) depends on.

**Video's unread `thumb`**: `types.ts:23` declares it optional and no reader
exists. Deliberately left alone — video volume is low and the reclaim would need
its own per-kind rule for negligible gain. Recorded so the omission reads as a
decision rather than an oversight.

---

## Derived: reclaim run result

In-memory only, returned by each capability and logged (FR-019). Mirrors
`DowngradeResult` in `original-downgrade.ts:18`.

| Field | Meaning |
|---|---|
| `scanned` | Candidates examined after prefilter |
| `reclaimed` | Items whose files were removed |
| `skipped` | Examined but retained (protected, or in grace) |
| `failed` | Errored — left untouched for the next run |
| `bytesFreed` | Sum of removed file sizes, `stat` before `unlink` |
| `dryRun` | Whether anything was actually removed |
