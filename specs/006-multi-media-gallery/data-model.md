# Phase 1 Data Model: Multi-Media Gallery Attachments

**Feature**: 006-multi-media-gallery | **Date**: 2026-07-25

Grounded in `api/prisma/schema.prisma` as of commit `99ead65`.

> **Unaffected by the 2026-07-26 Stage 1 grid redesign.** That revision changes
> only how the already-delivered `gallery` array is rendered; no table, column,
> index or invariant below changes. The schema shipped in `d85c6bb` stands.

## Existing structures (unchanged)

```prisma
model Media {
  id         String   @id @default(uuid())
  user_id    String
  media_type String   // "image" | "video" | "youtube" | (gif stored as image w/ animated meta)
  media_url  String
  media_meta String?  // JSON: { w, h, orig?, converted?, uploaded_at?, orientation?, animated? }
  created_at DateTime @default(now())
  // ...back-relations
}
```

`Media` requires **no changes**. It is already reusable across many shouts and
comments, which is what makes gallery membership a pure join concern.

`Shout.media_id` and `Comment.media_id` are **retained**, with a narrowed
meaning — see Invariant I1.

## New entities

```prisma
model ShoutMedia {
  shout_id String
  media_id String
  position Int

  shout Shout @relation(fields: [shout_id], references: [id], onDelete: Cascade)
  media Media @relation(fields: [media_id], references: [id])

  @@id([shout_id, position])
  @@unique([shout_id, media_id])
  @@index([shout_id], name: "idx_shout_media_shout")
  @@index([media_id], name: "idx_shout_media_media")
  @@map("shout_media")
}

model CommentMedia {
  comment_id String
  media_id   String
  position   Int

  comment Comment @relation(fields: [comment_id], references: [id], onDelete: Cascade)
  media   Media   @relation(fields: [media_id], references: [id])

  @@id([comment_id, position])
  @@unique([comment_id, media_id])
  @@index([comment_id], name: "idx_comment_media_comment")
  @@index([media_id], name: "idx_comment_media_media")
  @@map("comment_media")
}
```

Corresponding back-relations are added to `Shout`, `Comment` and `Media`.

### Field notes

| Field | Notes |
|---|---|
| `position` | 0-based, dense (no gaps), ascending. Position 0 is the preview item. |
| `@@id([parent_id, position])` | Composite PK makes "two items at the same position" structurally impossible. |
| `@@unique([parent_id, media_id])` | Prevents the same media appearing twice in one gallery. Deliberate: duplicates in a gallery are always a client bug. |
| `onDelete: Cascade` | Applies only to *hard* deletes. User content is soft-deleted (Principle III), so this never fires for normal deletion — it exists so test teardown and genuine admin purges do not strand rows. |

## Invariants

These are the correctness contract for this feature. Each has a named owner in
code and a test.

- **I1 — Preview mirror**: for any shout/comment with a gallery,
  `parent.media_id` MUST equal the `media_id` of its `position = 0` row.
  *Owner*: `api/src/helpers/gallery.js` — the only module permitted to write
  either side. *Test*: assert after every create path in
  `shouts.test.js` / `comments.test.js`.
- **I2 — Dense ordering**: positions of a gallery MUST be exactly `0..n-1`.
  *Owner*: `gallery.js` writes the full set in one transaction; it never patches
  a single row.
- **I3 — Size bound**: `1 ≤ n ≤ 5`. Enforced by Zod before any write (FR-002).
- **I4 — Type bound**: gallery items MUST be `media_type = "image"` (which
  includes GIFs, stored as images with `animated` meta). `youtube` and `video`
  MUST NOT appear in a gallery (FR-027, FR-028).
- **I5 — Exclusivity**: a shout/comment MUST NOT have both a gallery of n > 1 and
  a `youtube` media. Structurally guaranteed by I1 + I4: a YouTube `media_id`
  cannot be the position-0 item of an image gallery.
- **I6 — Soft-delete inheritance**: gallery rows carry no independent deletion
  state; visibility is entirely governed by the parent's `is_deleted`.

## Migration

Single migration `add_media_galleries`, in two parts.

**Part 1 — create tables** (standard Prisma DDL from the models above).

**Part 2 — backfill**: every existing shout/comment holding a `media_id` that
points at an **image** gains a position-0 row.

```sql
INSERT INTO shout_media (shout_id, media_id, position)
SELECT s.id, s.media_id, 0
FROM shouts s
JOIN media m ON m.id = s.media_id
WHERE s.media_id IS NOT NULL AND m.media_type = 'image';

INSERT INTO comment_media (comment_id, media_id, position)
SELECT c.id, c.media_id, 0
FROM comments c
JOIN media m ON m.id = c.media_id
WHERE c.media_id IS NOT NULL AND m.media_type = 'image';
```

**Why images only**: YouTube and video attachments are not gallery-eligible (I4).
Backfilling them would create rows that violate the type bound and would make
`ShoutMedia` a misleading "all attachments" table rather than a gallery table.

**Reversibility**: dropping both tables restores the prior state exactly, since
`media_id` is never modified by this migration. This is a deliberate property —
Stage 1 is rollback-safe at the database level.

**Backfill is not strictly required for reads** (a 1-item gallery emits no
`gallery` field either way, per D4) but it is required so that the downgrade
job's join-table orphan check (D7) sees pre-existing media, and so the table is a
complete picture rather than "galleries created after this date".

## Derived read shapes

### Gallery of a single shout

```text
shout.media          → preview item (existing `media` relation, unchanged)
shout.shoutMedia[]   → ordered items, position ASC, each with its Media
```

### Feed page (batched — see research D5)

```text
1. Load page of shouts (existing query, unchanged, includes `media`)
2. SELECT * FROM shout_media WHERE shout_id IN (<page ids>) ORDER BY position
   (with media included)
3. Group by shout_id in memory → attach as `gallery` when length > 1
```

Cost: exactly one additional query per feed page, independent of page size.

## Entity relationships

```text
User ──< Media
Media ──< ShoutMedia >── Shout   (ordered, ≤5 per Shout)
Media ──< CommentMedia >── Comment
Shout.media_id  ─→ Media   (preview mirror of ShoutMedia position 0)
Comment.media_id ─→ Media  (preview mirror of CommentMedia position 0)
```

## State transitions

A gallery has no lifecycle of its own — it is written once, at parent creation,
and is immutable thereafter (FR-029). There is no edit pathway, so there are no
transitions to model. Pending (unpublished) selections live only in client state
and never reach these tables.
