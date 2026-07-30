# Phase 0 Research: Multi-Media Gallery Attachments

**Feature**: 006-multi-media-gallery | **Date**: 2026-07-25

All Technical Context unknowns are resolved; no NEEDS CLARIFICATION markers
remain. Findings below are grounded in the current codebase rather than general
best practice, since every decision here is constrained by existing structures.

## Codebase findings that constrain the design

These were established by reading the code, and each one materially changed a
decision:

1. **`Media` is already a standalone, reusable table.** `media` has back-relations
   `shouts Shout[]` and `comments Comment[]`, so one media row can already be
   referenced by many shouts. Galleries therefore do not require any change to
   how media itself is stored — only to how membership and ordering are recorded.
2. **YouTube is a `Media` row**, not a separate column: `media_type: "youtube"`
   with `media_url` = video id (`shouts.js:220-228`). This is why gallery/YouTube
   exclusivity (FR-027) is nearly free — both compete for the same `media_id`.
3. **`visibility_tag` stripping keys off `finalMediaId`** (`shouts.js:249`). Because
   `media_id` is retained as the position-0 mirror, spoiler/NSFW behavior
   (FR-030) needs no change at all.
4. **A capable `Lightbox` already exists** (`web/components/Lightbox.tsx`, 363 lines)
   with drag-to-dismiss, pinch/wheel/double-tap zoom, EXIF orientation transforms
   and scroll locking. Stage 2 extends it; building a second viewer would fork
   this behavior.
5. **The original-downgrade job resolves orphans via `media_id`**
   (`workers/src/jobs/original-downgrade.ts`, the `liveShout`/`liveComment`
   lookups). Gallery items beyond position 0 would be invisible to it.
6. **`uploadLimiter` is 100 uploads / 10 min / user** (`api/src/app.js:99`),
   keyed per user with IP fallback.
7. **Media is validated per-file by multer + sharp** in `upload.js`, with limits
   in `helpers/media.js`. Nothing there is inherently single-file.

## Decisions

### D1. Gallery membership: join tables, with `media_id` retained as a position-0 mirror

**Decision**: Add `shout_media` and `comment_media` join tables holding
`(parent_id, media_id, position)` for **all** items including position 0. Retain
`Shout.media_id` / `Comment.media_id` as a mirror of the position-0 item, written
only by a new `helpers/gallery.js`.

**Rationale**: Every current read path means "the media of this shout" and
resolves it through `media_id`. Keeping that column meaningful — as the preview
item — means `enrichFeed`, search, quote resolution, the admin panel and the
downgrade job keep working with zero changes. Stage 1 then touches only the write
path and one DTO field. That is what makes a genuinely small first deployment
possible, which is the entire point of the staged rollout.

**Alternatives considered**:
- *Join table as sole source of truth, drop `media_id`.* Cleanest data model, and
  the right long-term end state. Rejected for Stage 1 because it forces
  simultaneous changes to every read site — the big-bang change the staging is
  designed to avoid. Recommended as follow-up debt once Stage 3 is stable.
- *Join table holds only items 1..N ("additional items"), `media_id` holds item 0.*
  Eliminates redundancy entirely with no invariant to maintain. Rejected because
  a gallery would then be assembled from two different sources, making ordering,
  indexing and tests awkward for a saving that a single-writer helper already
  provides.
- *`media.shout_id` FK (media points at its parent).* Rejected outright: it would
  break media reuse, which the schema already supports and which feature 005
  explicitly depends on (re-selecting an already-uploaded GIF).
- *JSON array column of media ids on `Shout`.* Rejected: no referential
  integrity, no efficient join, and it violates the spirit of Principle IV.

**Risk and containment**: The mirror is duplicated state and can drift. Contained
by making `helpers/gallery.js` the only code permitted to write either side, and
by an integration test asserting `media_id === position-0 media` after every
create path.

### D2. Multi-upload: reuse the per-file endpoint, orchestrate client-side

**Decision**: No new upload endpoint. The client calls the existing
`POST /upload/media` once per selected file and collects the returned ids, then
submits the shout/comment with `mediaIds: [...]`.

**Rationale**: This is the decision that makes FR-034 nearly free — "keep the
successes, report each failure individually" is the *natural* outcome of N
independent requests, whereas a batch endpoint would have to invent partial-
success semantics and a per-item error envelope. It also leaves `upload.js`'s
sharp/variant/EXIF pipeline completely untouched, so per-item validation, size
limits and the original-quality window are inherited exactly (FR-007, FR-010) with
no code duplication.

**Alternatives considered**:
- *`POST /upload/media/batch` using multer `.array("files", 5)`.* Rejected:
  duplicates the entire processing pipeline, needs bespoke partial-failure
  reporting, and multer's `LIMIT_FILE_SIZE` aborts the whole request — which would
  force all-or-nothing semantics, contradicting the user's FR-034 decision.
- *Upload on submit rather than on selection.* Rejected: no preview before
  posting, and a slow multi-file upload would block the submit action.

**Consequence on rate limiting**: a 5-image shout consumes 5 of the 100 uploads /
10 min budget, i.e. ~20 full galleries per window. Judged acceptable; no change
to `uploadLimiter`. Flagged for monitoring after Stage 1.

### D3. Over-limit (FR-033) enforced at selection time, before any upload

**Decision**: The client counts files at selection/drop and rejects the entire
action before uploading anything if it would exceed 5. The server independently
rejects `mediaIds.length > 5` via Zod (FR-002).

**Rationale**: Because uploads precede shout creation (D2), a server-only check
would happen *after* files were already stored — turning a rejected action into
orphaned files. Checking the count client-side first is what makes "reject the
whole action, attach nothing" actually mean nothing was stored. The server check
remains the authoritative backstop for non-browser clients.

### D4. DTO: additive `gallery` field, `media` keeps its current meaning

**Decision**: Feed/comment payloads keep `media` (= the position-0 item,
unchanged shape) and gain an optional `gallery: MediaDTO[]`, present only when
the gallery has 2+ items.

**Rationale**: Purely additive, so any client that does not know about galleries
renders today's behavior against today's field. It also satisfies FR-016/FR-032
by construction — a 1-item gallery emits no `gallery` field and is therefore
byte-identical to pre-feature content.

**Alternatives considered**: replacing `media` with `gallery: []` always.
Rejected — it changes an existing contract for every consumer, breaks
FR-032's "no migration-driven change", and would require a coordinated
client/server deploy, which staged rollout cannot guarantee.

### D5. Feed loading: one batched query per page, never N+1

**Decision**: `enrichFeed()` collects the page's shout/comment ids and issues a
single `findMany` against the join table with `where: { shout_id: { in: ids } }`,
including the related media, then groups in memory by parent id.

**Rationale**: `enrichFeed` already batches its other lookups this way. A
per-shout gallery query would add up to 20 queries per feed page.

### D6. Stage 2 gestures: arrows are the contract, swipe is conditional

**Decision**: Edge-anchored arrow controls are always rendered (FR-018) and are
the guaranteed navigation baseline. Horizontal swipe is enabled **only while
`zoomLevel === 1`**; keyboard Left/Right also navigate.

**Rationale**: The existing Lightbox already binds horizontal pointer movement to
panning **when zoomed** (`onPointerMove`, `panX`). Unconditionally claiming
horizontal drag for navigation would break panning on zoomed images — a
regression in existing behavior. Gating swipe on zoom level keeps both gestures
and is why the spec's FR-018 wording ("controls present regardless of viewport")
is satisfied by arrows rather than by swipe.

### D7. Downgrade job orphan check extended to join tables

**Decision**: `runOriginalDowngrade`'s `liveShout`/`liveComment` lookups gain
join-table equivalents, so a media row referenced only as a non-preview gallery
item is not treated as orphaned.

**Rationale**: Today both the orphaned and non-orphaned branches finalize the
asset identically (mark converted, unlink original), so the *user-visible*
consequence of getting this wrong is currently nil — but the counters would
misreport, and any future divergence between the branches would silently break
gallery items. Correcting it now is cheap; discovering it later is not.

### D8. FR-035 GIF gate is client-side and time-boxed

**Decision**: During Stages 1–2, `ShoutInput` disables the GIF picker whenever
≥1 image is attached and blocks image attachment whenever a GIF is attached. No
server-side rule is added. The gate is deleted in Stage 3.

**Rationale**: See Complexity Tracking in `plan.md`. Mixed galleries are a
*supported* state in the data model from Stage 1 onward; the gate exists only to
keep interim UI states simple. A bypass produces valid data, not corrupt data, so
server enforcement would buy nothing and would have to be removed again.

### D9. Attachment logic is extracted into a shared hook, because there are two composers

**Decision**: Create `web/hooks/useMediaAttachments.ts` holding pending-list
state, the capacity gate and per-file upload orchestration. Both
`ShoutInput.tsx` (shouts) and the reply composer inside `ShoutCard.tsx`
(comments) consume it.

**Rationale**: This was **missed in the first draft** of the plan and caught by
`/speckit-analyze`. The comment composer is not a reuse of `ShoutInput` — it is a
separate implementation inside `ShoutCard.tsx` with its own `replyMediaId`,
`uploadReplyFile` and `handleReplyFileSelect`, and it has **no drag-and-drop
handler at all** (verified: zero `onDrop` occurrences in `ShoutCard.tsx` versus
one in `ShoutInput.tsx`). FR-031 requires shouts and comments to behave
identically, so without extraction the entire attachment flow would have to be
written twice and kept in sync through three stages — including Stage 3's
reorder/remove.

**Alternatives considered**:
- *Mirror the tasks against `ShoutCard.tsx`.* Rejected: duplicates the flow in
  two files, doubles Stage 3's work, and invites drift between the two composers
  precisely where the spec demands parity.
- *Narrow Stage 1 to shouts only, defer comments.* Rejected: contradicts FR-031
  as written and would push a visible inconsistency into production for the
  duration of two stages.

**Consequence**: Stage 1 carries more upfront refactoring than originally
scoped, but Stages 2 and 3 get comment parity essentially for free.

### D10. Create-response and SSE DTOs must be updated alongside `enrichFeed()`

**Decision**: Emit `gallery` from the inline DTO construction in
`api/src/routes/shouts.js` and `api/src/routes/comments.js`, in addition to
`enrichFeed()`.

**Rationale**: Also caught by `/speckit-analyze`. Both create routes build their
response DTO inline with `buildMedia()` and then `broadcast()` it over SSE —
they do not pass through `enrichFeed()`. Updating only the feed helper would mean
a shout appearing live in another user's feed shows no gallery indicator until a
refresh, and would break contract guarantee G1 for SSE payloads.

## Revision 2026-07-26 — Stage 1 grid redesign

Added after Stage 1 was deployed and tested. D1–D10 above are unaffected: the
schema, upload orchestration, DTO shape and shared hook all stand. These three
decisions cover only the inline rendering and the stage boundary.

### D11. Adaptive grid via CSS Grid template areas, not a layout library

**Decision**: Implement the four arrangements (2 / 3 / 4 / 5 items) as static CSS
Grid definitions selected by item count, inside a container whose aspect ratio is
set from the first item. Tiles use `object-cover`.

**Rationale**: The item count is bounded at five, so there are exactly four
layouts — a closed set that can be expressed declaratively with no measurement,
no ResizeObserver and no runtime layout maths. `aspect-ratio` plus
`object-cover` gives the container-shaped, tiles-cropped behaviour that FR-014
requires directly in CSS, so nothing depends on images having loaded. That last
property matters for SC-010: a layout that computed itself from natural image
dimensions would reflow as images arrive, which is exactly the feed shift the
success criterion forbids.

**Alternatives considered**:
- *A masonry/justified-layout library (flexbox-based or e.g. justified-layout).*
  Rejected: pulls a dependency and solves the general N-image problem we do not
  have; also produces variable container heights, reintroducing layout shift.
- *Computing tile sizes in JS from natural dimensions.* Rejected: requires images
  to load before layout settles, guaranteeing a visible reflow, and needs a
  resize observer for responsive behaviour.
- *A single flex row with `flex-grow` per image.* Rejected: cannot express the
  3-item (one tall + two stacked) or 5-item (2 over 3) arrangements.

### D12. Aspect ratio clamped at the container, computed from the DTO

**Decision**: Derive the container's `aspect-ratio` from `gallery[0].width` /
`gallery[0].height`, clamped to the range 0.5–2.0. Fall back to 1.0 when either
dimension is missing or zero.

**Rationale**: `buildMedia()` already emits `width`/`height` per item, so the
ratio is known server-side at render time — no image needs to load first. The
clamp is what prevents a single 1:5 panorama or portrait from producing a feed
block that dwarfs surrounding posts, which was the stated risk when this option
was chosen over a fixed ratio. The fallback matters because older `media_meta`
rows can carry `w: 0, h: 0` (see `buildMedia`, which already defaults these to
0), and dividing by zero would yield an invalid `aspect-ratio` value.

### D13. Stage 1 opens the existing Lightbox unchanged; Stage 2 extends it

**Decision**: In Stage 1 a tile calls the existing `Lightbox` with a single
`src`, exactly as single images do today. `Lightbox.tsx` is **not modified** in
Stage 1. Stage 2 adds the optional `items`/`startIndex` props.

**Rationale**: This is what closes the viewability hole at near-zero cost — the
component already handles zoom, pan, drag-dismiss, EXIF orientation and scroll
locking, all of which readers get immediately. It also keeps the two stages
genuinely independent: Stage 1 touches only the new grid component and its two
call sites, so a Stage 2 regression cannot be caused by Stage 1 work in the same
file. The cost is that a Stage 1 reader must dismiss and click another tile to
see the next image; that was accepted explicitly as the Stage 1/Stage 2 division.

## Revision 2026-07-30 — Composer pending-preview & upload-timing

Added after further production feedback on the deployed Stage 1 build. D1,
D3–D13 are unaffected. D2 is **superseded** by D14 below.

### D14. Upload moves from selection-time to submit-time — supersedes D2's rejection of this alternative

**Decision**: A selected/dropped file is held client-side (`{ file, objectUrl }`)
and is never sent to `POST /upload/media` until the user submits the shout or
comment. At submit, every pending file is uploaded and, only if all succeed, the
create route is called with the resulting `mediaIds` (FR-041). This is the exact
alternative D2 rejected — worth stating plainly, since a plan should not silently
reverse itself.

**Why D2's original rejection no longer applies**: D2 gave two reasons to upload
on selection instead: (1) "no preview before posting" — no longer true, since the
pending preview now renders directly from each file's local `objectUrl`, never
from a server response; there was never a hard requirement that the preview be
server-hosted, only that one exist. (2) "a slow multi-file upload would block the
submit action" — still true, but no longer treated as disqualifying: the user
explicitly weighed this tradeoff and accepted it, on the condition that failure
is communicated clearly and a retry is one click (FR-041). The perceived-slowness
complaint that originally motivated upload-on-select (files trickling in during
composing feels faster) was, in production, outweighed by the orphaned-upload
cost of that same design — seeing files upload immediately doesn't actually help
the user if they abandon the composer afterwards anyway.

**Rationale for keeping the existing two-call contract** (rather than inventing a
combined upload+create endpoint): `POST /upload/media`'s per-file pipeline
(multer, sharp variants, EXIF stripping, feature-005 permission check, rate
limiting) is unchanged and fully proven from Stage 1. A combined endpoint would
have to reimplement multipart handling *and* JSON body validation in the same
request, duplicate the permission/rate-limit checks in a new code path, and give
up the clean req/response shape both existing contracts already document
([shout-comment-create.md](./contracts/shout-comment-create.md),
[upload-orchestration.md](./contracts/upload-orchestration.md)). Retiming *when*
the client calls two already-correct endpoints is a strictly smaller change than
building a third.

**Alternatives considered**:
- *Combined `multipart` create endpoint accepting raw files and text together.*
  Rejected: see above — duplicates two already-working validation/permission/
  rate-limit paths for no behavioral gain, and is a much larger surface to test
  across both composers and both auth states.
- *Upload immediately but don't attach until submit (i.e., keep D2, add a
  separate "detach" step).* Rejected: this is what today's architecture already
  does and is exactly the source of the orphaned-upload complaint — uploading
  early buys nothing if the value the user wanted (a fast, working preview) is
  achievable client-side for free.

### D15. Submit-time uploads run in parallel, not sequentially

**Decision**: When submit fires, all pending files are uploaded concurrently
(`Promise.all`-style), not one after another.

**Rationale**: A gallery is capped at 5 items (FR-001), so the maximum burst is 5
concurrent requests — trivial against `uploadLimiter`'s 100/10 min budget (D2's
existing consequence analysis already covers this). Sequential uploads would
directly reintroduce the "submit feels slow" cost this revision is meant to
avoid, multiplied by up to 5 round trips instead of one; parallel upload keeps
submit latency close to that of the single slowest file rather than the sum of
all of them.

### D16. Retry reuses `mediaId`s already obtained in a failed attempt

**Decision**: If a submit fails after some files already uploaded successfully,
a subsequent "Try again" does **not** re-upload those already-succeeded files —
it reuses their previously-returned `mediaId`s and only (re)attempts the file(s)
that failed or were never attempted.

**Rationale**: The spec's user-facing guarantee is that retry "resubmits the
whole batch without requiring re-attachment" — which describes what the user
does (nothing), not what the network does. Re-uploading already-successful files
on every retry would silently multiply orphaned `Media` rows with each failed
attempt, compounding exactly the debt this revision otherwise reduces (see Known
debt, below). Tracking obtained ids per pending file is a few lines of state in
`useMediaAttachments.ts` and costs nothing at the API layer.

### D17. Pending-preview UI is a new shared component, not per-composer markup

**Decision**: `PendingMediaStrip.tsx` renders the bordered/divided
horizontal-scroll pending list (FR-038/FR-039), the unified 80px tiles
(FR-040), each tile's remove control (FR-024) and its click-to-`Lightbox`
behavior (FR-037). Both `ShoutInput.tsx` and the reply composer in
`ShoutCard.tsx` render it, driven by the same `useMediaAttachments.ts` state.

**Rationale**: Directly continues D9's lesson — the two composers are separate
implementations, and every attachment-UI change that isn't extracted into a
shared piece has to be built and kept in sync twice, which is exactly what
produced the FR-031 gap `/speckit-analyze` caught in Stage 1. Building this as
one new component now is cheaper than building it once, discovering the second
composer diverges, and reconciling them later.

## Known debt accepted (not introduced by this feature)

- **Orphaned uploads — narrowed by the 2026-07-30 revision.** Previously: files
  uploaded into a composer that is then abandoned are never reclaimed, at up to
  5× the pre-existing single-media rate, since every selected file uploaded
  immediately. As of D14, a composer abandoned **without ever submitting**
  uploads nothing at all, eliminating that case entirely. The residual case is
  narrower: a submit that fails after some files already uploaded, and is then
  abandoned without hitting retry, still orphans those files — but D16 ensures
  repeated retries never compound this, so the worst case is bounded to
  roughly the same order of magnitude as today's single-media orphan risk, not
  a multiple of it. A reaping job for unreferenced `Media` rows remains the
  correct long-term fix and stays out of scope here.
- **`media_id` denormalization.** See D1. Removable once Stage 3 is stable.
