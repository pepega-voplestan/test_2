# Research: Reclaim Unused Media Storage

**Feature**: 008-reclaim-unused-media | **Date**: 2026-08-12

Design decisions taken before implementation, with rejected alternatives.

---

## D1: Reclaim state lives in `media_meta`, not new columns

**Decision**: Record what has been reclaimed inside the existing `media.media_meta`
JSON blob, as a `reclaimed` object: `{ reclaimed: { variants: ["320"], files: true, at: "<ISO>" } }`.

**Rationale**: Direct prior art — feature 003 stores `orig` / `converted` /
`uploaded_at` in the same blob, and `original-downgrade.ts` drives its entire
state machine from it. No migration, no schema churn, and the on-disk
`meta.json` mirror already exists as a best-effort backup. The jobs do a coarse
SQL prefilter (`media_type`, `created_at`) and then filter precisely in JS,
so the awkwardness of querying inside JSON never arises.

**Alternatives rejected**:
- *New `reclaimed_at` / `reclaimed_variants` columns*: cleaner to query, but
  requires a migration for state that only two background jobs read, and splits
  media lifecycle state across two mechanisms.
- *Separate `media_reclaim` table*: full audit trail, but a join on every
  `buildMedia` call for data that is needed only by a once-per-item transition.

---

## D2: The `reclaimed` marker is the single mechanism behind four requirements

**Decision**: One marker satisfies idempotency (FR-018), the DTO honesty rule
(FR-005), restore-after-reclaim behaviour (FR-014), and the publish guard
(FR-013).

**Rationale**: This was the most valuable realisation in planning. All four
requirements are the same question asked from different angles — "are this
item's files still on disk?" — so they must not get four independent answers
that can disagree.

- `buildMedia` reads it and omits the media (or the specific variant) from the
  payload → a restored post renders media-free rather than broken (FR-014), and
  no address is advertised for a missing file (FR-005).
- `attachments.js` reads it and rejects the attachment at publish time (FR-013).
- The jobs read it and skip already-processed items (FR-018).

**Alternatives rejected**: filesystem `existsSync` checks at request time —
correct but puts a stat syscall on every feed render, and the feed is the
hottest path in the product.

---

## D3: Two independent capabilities, not one

**Decision**: Ship the unreachable-variant reclaim as a one-shot operator script
and the association reclaim as a recurring BullMQ job. They share helpers but
have separate entry points and separate `media_meta` markers.

**Rationale**: Their lifecycles genuinely differ. Once FR-001/FR-002 stop
generating unreachable variants, no new ones exist — a permanent schedule would
walk the whole volume hourly to find nothing. The association reclaim, by
contrast, has a continuous source (people abandon composers and delete posts
every day). Fusing them would force the safe, high-value P1 work to wait on the
constitutionally-sensitive P3 work.

**Alternatives rejected**: one unified `media-reclaim` job with mode flags —
fewer files, but couples independently-shippable work and makes the P1 reclaim
undeployable until the P3 policy questions are settled.

---

## D4: `full` and `thumb` become optional in the media DTO

**Decision**: `buildMedia` omits `thumb` for non-animated images and omits
`full` for animated images. `types.ts` changes both to optional.

**Rationale**: Verified by audit that neither field has a reader on the affected
path. `thumb` is read only at `GifPicker.tsx:274` and `useGifPicker.ts:213`,
both fed by `gifs.js` (which builds its own `320.webp` address at `gifs.js:220`,
not via `buildMedia`). `full` is read at `Lightbox.tsx:70` and
`ShoutCard.tsx:921,1422`, all of which already prefer `.gif` when
`animated` is true — so for animated media the `full` branch is dead today.

**Risk accepted**: making a required field optional is a breaking type change.
It is safe here precisely because the readers do not exist, but the TypeScript
change must land in the same commit as the API change or the frontend build
will pass while the contract has already shifted.

**Alternatives rejected**: keep emitting the fields pointing at deleted files
(fails FR-005 and produces broken images); repoint `thumb` at `960.webp`
(dishonest — the field name promises a thumbnail).

---

## D5: nginx falls back to `960.webp`, which is never reclaimed

**Decision**: Change `media-nginx.conf` from `try_files $uri =404` to a
regex-captured fallback:

```nginx
location ~* ^/(?<mid>[^/]+)/(320|960|1600)\.webp$ {
    try_files $uri /$mid/960.webp =404;
}
```

**Rationale**: FR-020 requires that already-delivered pages not break. The
`Cache-Control: immutable, max-age=31536000` header at `media-nginx.conf:18`
means a client can hold an address for a year. `960.webp` is the correct
fallback target because this feature never reclaims it for any media kind —
it is the inline-render variant for static images and the blur-placeholder
variant for animated ones.

**Constraint this creates**: any future feature that reclaims `960.webp` (the
deferred quality-downgrade idea does exactly that) must revisit this rule
first, or the fallback silently becomes a 404 again.

**Alternatives rejected**: serving a generic placeholder image (hides real
breakage during rollout); leaving `=404` (violates FR-020).

---

## D6: Batched, bounded queries

**Decision**: Both capabilities page through candidates with `take`/`cursor`
rather than `findMany()` into memory.

**Rationale**: `original-downgrade.ts:65` currently does an unbounded
`findMany` over all image media older than the window. That is survivable
because its candidate set self-empties (each item is marked `converted`), but
the association reclaim's candidate set includes every never-published and
deleted-content item, which does not shrink until processed. On a large volume
an unbounded load is an OOM risk in the worker container.

**Alternatives rejected**: raw SQL cursor (Principle IV restricts raw SQL);
`LIMIT` without a cursor (skips rows as earlier ones are marked).

---

## D7: Grace periods are environment-configured

**Decision**: `MEDIA_UNPUBLISHED_GRACE_DAYS` (default 7) and
`MEDIA_DELETED_GRACE_DAYS` (default 7), following the
`ORIGINAL_QUALITY_WINDOW_HOURS` precedent in `media.js:35`.

**Rationale**: The constitution deliberately declines to fix a number, and the
Development Workflow section requires operationally-sensitive constants to come
from the environment. Two separate variables because the risks differ — an
abandoned composer is a client-side timing question, a deleted post is a
moderation-reversal question — even though both default to 7.

---

## D8: `workers/` test tooling must be repaired first

**Decision**: Add `vitest` as a devDependency and a `"test": "vitest run"`
script to `workers/package.json` before writing any new job.

**Rationale**: `workers/tests/original-downgrade.test.ts` imports from
`vitest`, but `workers/package.json` declares no `vitest` dependency, has no
`test` script, and no vitest binary is installed. The existing suite cannot
run. `docs/infra.md:74` claims it runs via `npm test` in `workers/`, which is
inaccurate. Since this feature adds a second job with materially higher
blast radius — it deletes files irreversibly — landing it on a test harness
that does not execute would be indefensible.

**Note**: this also means the existing `original-downgrade` suite's true
pass/fail state is currently unknown and must be established as a baseline.

---

## D9: Reference-checking is one predicate, used everywhere

**Decision**: A single `hasLiveReference(mediaId)` predicate checks all three
tables — `shout_media` → live shout, `comment_media` → live comment,
`user_gifs` → active library entry.

**Rationale**: `user_gifs` (`schema.prisma:134`) references media deliberately
attached to no post. Any check that consults only the two join tables classifies
every user's saved GIF library as orphaned and deletes it. This is the single
most destructive mistake available in this feature, so the check exists once,
is named for what it guarantees, and is unit-tested against the library case
directly.

**Confirmed**: `attachments.js` documents that the legacy `Shout.media_id` /
`Comment.media_id` mirror columns were removed, so the two join tables really
are the only post-attachment record. No fourth table to consult.

**Note on `user_gifs.is_deleted`**: the table carries its own soft-delete flag.
A library entry with `is_deleted=1` is treated as not-a-live-reference, so such
media becomes eligible under the normal deleted-content grace period.

---

## D10: Ban-removed content is excluded by the predicate, not by a later filter

**Decision**: `is_deleted=2` content counts as a *protecting* reference for
reclaim purposes, alongside live content.

**Rationale**: Expressing the exemption as "banned content protects its media"
rather than "filter out banned items afterwards" makes the safe outcome the
structural default. A missed filter deletes data; a missed protection just
retains it. Given the constitution makes this exemption mandatory and unban
restores wholesale (`admin.js:182-191`), the failure mode must be
fail-safe.
