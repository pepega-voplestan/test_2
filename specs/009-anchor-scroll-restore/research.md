# Phase 0 Research: Anchor-Based Feed Scroll Restoration

No `NEEDS CLARIFICATION` markers remain in the Technical Context (this is a
frontend-only change to an existing, well-understood stack — nothing about
language/framework/testing tooling needed investigation). The two open design
questions from the original request were already resolved in spec.md's
Clarifications section during specification, not deferred here. What follows
is the "how" for each resolved decision, plus the specifics of the existing
code this feature must build on rather than reinvent.

## Locating "which shout is at the top" (save side)

**Correction**: an earlier draft of this section proposed a one-shot
`getBoundingClientRect()` query at unmount time. That repeats, for
per-shout position, the *exact* bug class this session already spent
significant effort finding and fixing for `window.scrollY`: by the time a
`useEffect` cleanup runs on unmount, React has already removed this
component's DOM from the document (the "mutation" phase happens before the
later "passive effects" phase), so measuring any element's position at that
point reads back a detached/zeroed rect, not where it actually was. The fix
must follow the same shape as `liveScrollYRef` — continuous live tracking
into a ref while mounted, read (not recomputed) at unmount — not repeat the
mistake `liveScrollYRef` itself was created to fix.

**Decision**: Reuse the existing `shoutRefs: Map<string, HTMLDivElement>`
(already maintained in `ShoutFeed.tsx` for the accordion open/close
scroll-anchor feature — see `handleThreadToggle`/`scrollAnchorRef`). Add a
`liveAnchorRef` alongside the existing `liveScrollYRef`, recomputed on the
same `scroll` listener (throttled via `requestAnimationFrame` — coalescing
rapid scroll events into at most one recomputation per frame, since this one
iterates the rendered-cards map and calls `getBoundingClientRect()` per
entry, unlike `liveScrollYRef`'s O(1) `window.scrollY` read): the anchor is
the LAST rendered shout (top-to-bottom document order) whose top edge is at
or above the viewport's top edge (`rect.top <= 0`) — i.e. the shout currently
being read, which may already be scrolled partway past its own top. Store
`{ shoutId, offsetFromTop: rect.top }`, which is consequently `<= 0` in the
normal case. If the reader hasn't scrolled past even the first rendered
shout yet (feed near the very top), no shout satisfies `rect.top <= 0` — fall
back to the first rendered shout instead, whose `offsetFromTop` will then be
`>= 0`. (Corrected from an earlier draft of this section, which described
picking whichever shout's top edge is closest to *and at-or-below* the
viewport top — that rule can only ever produce a non-negative offset and
cannot represent "already scrolled partway into this shout," contradicting
data-model.md's field description. This section and data-model.md's
`offsetFromTop` description are now the same rule.)

**Rationale**: `shoutRefs` already exists and stays in sync with rendered
cards; no new bookkeeping structure, only a new live-tracked derived value
alongside the one that already exists for the same reason.

**Alternatives considered**: A one-shot query at unmount — rejected, see
Correction above; this was the actual mistake being corrected, not a
legitimate simpler alternative. An `IntersectionObserver` per card instead of
rAF-throttled `getBoundingClientRect()` scanning — viable, and possibly
cheaper at scale (no per-scroll-frame iteration over every rendered card),
but adds an observer-lifecycle-per-card to manage against the existing
`shoutRefs` map's imperative add/remove callbacks; left as an optimization to
consider during implementation if the rAF-scan approach shows measurable
jank on long feeds, not a blocking decision for this plan.

## Locating the anchor shout again (restore side)

**Decision**: Per spec.md Clarifications — keep the existing paging
mechanism (`fetchShouts(true)` then repeated `fetchShouts(false)`, same as
today's shipped pixel-based restore), but change the loop's stop condition
from "loaded >= saved.count" to "the anchor shout's ID is present in the
accumulated `shouts` list," bounded by a search limit. No new backend
endpoint or query capability is added.

**Search limit default**: 8 pages (`PAGE_SIZE = 25` × 8 = 200 items). This is
a tuning value, not a product decision (per spec.md Assumptions) — chosen as
comfortably beyond a typical single infinite-scroll reading session while
still bounding worst-case load to a fixed, small number of requests.
Expressed as a named constant so it's trivially adjustable without touching
the loop logic.

**Why this holds for both tabs**:
- "new" tab: cursor-based on `created_at` of the last loaded shout (see
  existing comment in `ShoutFeed.tsx`: *"Cursor-based pagination for 'new'
  tab (created_at of last loaded shout)"*). New shouts prepended above the
  cursor boundary do not shift or duplicate results for pages requested after
  that boundary — this is precisely why cursor pagination was chosen for the
  live tab, and it's what makes "keep paging past where the reader already
  was" reliable even with concurrent inserts.
- "popular" tab: offset-based, and already documented as *"stable: no live
  mutations"* — sort order doesn't change during a session, so paging is
  even simpler here; drift was already near-impossible on this tab, and this
  feature makes the guarantee uniform across both tabs rather than
  "accidentally fine on one, buggy on the other."

**Give-up fallback (FR-006, SC-004)**: land at the top of the freshest
content — i.e., treat it identically to a reader arriving at the feed for the
first time. No secondary fallback to the old pixel-offset behavior: the prior
mechanism is fully replaced, not kept alive as a backup path (see spec.md
Assumptions — avoids maintaining two restoration mechanisms for a rare edge
case).

## Positioning before the exact height is knowable

**Decision (corrected)**: An earlier draft of this section based the initial
estimate on "the index of the anchor among items loaded so far" — but the
immediate `useLayoutEffect` scroll runs synchronously on the very first
render, before any `fetchShouts` call has even started, let alone resolved;
at that instant zero items are loaded, so "loaded so far" is always zero and
the formula silently collapsed to just `viewport height`, discarding however
deep the reader had actually scrolled. That's exactly the flash/jump this
whole feature exists to avoid (data-model.md's `approxItemsAbove` field
exists specifically to fix this — it's read from the `SavedFeedAnchor` data
itself, available synchronously, not derived from anything that has to load
first).

Keep the existing placeholder-reservation + immediate `useLayoutEffect`
scroll approach from the shipped pixel-based feature, but the height reserved
is now an **estimate** computed entirely from the saved data:
`restoreState.approxItemsAbove × averageCardHeight + viewport height`, using
a fixed constant for `averageCardHeight` (a rough single-line-text-post
height; exact value is an implementation tuning constant, not a spec-level
decision). Once the anchor shout's real DOM node is confirmed rendered (via
the same `shoutRefs` map), measure its actual `getBoundingClientRect()` and
issue a correction `scrollTo` — reusing the existing
`scrollWhenTallEnough`-style rAF-polling pattern already proven in the
shipped feature for "wait until the DOM is actually tall enough."

This estimate is a UX nicety only — it seeds where the placeholder/first
paint lands, nothing more. It plays no part in *finding* the anchor (that's
the ID-based search-and-stop loop, unaffected) or in the *correctness* of the
final position (always the anchor's real measured position). If content
shifted enough that the estimate is now well off, the only consequence is a
larger correction jump, not a wrong landing spot — so this does not
reintroduce the count-dependency FR-004 rules out for restoration accuracy.

**Rationale**: Keeps the "never show a blank/default-positioned feed" property
(FR-007) the shipped feature already guarantees, at the cost of a bounded
correction jump only in the (common) case where the estimate and reality
differ — which is materially better than either (a) always showing a
default/top position while loading (a regression from the shipped behavior)
or (b) blocking the first paint on the anchor's exact position (defeats the
whole "instant" mechanism this session already built).

**Alternatives considered**: Delaying reveal until the anchor's exact
position is known (rejected in spec.md Clarifications — reintroduces a
blank-feed wait, which is a worse regression than a small correction jump).

## Discarding stale (old-shape) saved state

**Decision**: The saved-state shape gains an explicit discriminator (e.g. a
`kind: 'anchor'` field) distinguishing it from the old
`{ scrollY, count, activeTab, popularSort }` shape. On read, if the parsed
object doesn't have the expected shape/discriminator, treat it exactly like
"nothing to restore" (same code path as no entry at all) — no migration, no
special-case error handling.

**Rationale**: `sessionStorage` entries are single-tab, short-lived, and
already treated as disposable/single-use by the shipped mechanism (cleared
on every read regardless of outcome). A version tag is the simplest possible
way to make old and new shapes mutually unrecognizable without a crash;
writing a migration for a value that's about to be overwritten on the very
next feed visit anyway would be pure waste.

## Pinned-shout interaction

**Observation, not a new decision**: `fetchShouts`'s reset path already
special-cases the pinned shout (clearing stale `pinnedCollapsed:*`
`localStorage` entries against the current pin). If the anchor shout IS the
pinned one, or pin status changes while the reader is away, no special
handling is needed beyond what already exists — the anchor is located by ID
in whatever the fresh paginated results are, and the pinned shout's special
prepend-only-on-first-page behavior is unrelated to (and unaffected by) this
feature, since it's identity-based, not position-based.

## Existing shipped mechanism this feature must not regress

Carried forward unchanged (see spec.md Background/Assumptions and
`web/components/ShoutFeed.tsx`, `web/App.tsx`, `web/hooks/useRoute.ts` as
shipped 2026-08-15, same session):

- `liveScrollYRef` — `window.scrollY` MUST NOT be read reactively at unmount
  time; browsers clamp it immediately once a DOM mutation shrinks scrollable
  content, before any `useEffect` cleanup runs. Continue tracking live via a
  `scroll` listener. (This still matters here even though the *saved value*
  changes shape — the timing bug it fixes is unrelated to pixel-vs-anchor.)
- `window.history.scrollRestoration = 'manual'`, set at module load in
  `useRoute.ts` — must stay, so native browser scroll restoration doesn't
  race the app's own positioning.
- `goBack()` / `navigateTo()`'s `{inApp:true}` history-state marker — unrelated
  to scroll mechanics directly, but is how "Назад" reaches the feed in the
  first place; no changes needed here.
- Reading pending-restore data **synchronously** via a `useState` lazy
  initializer (not a `useEffect`) — this is *the* reason the shipped feature
  achieves no-flash positioning; the same pattern must carry over for reading
  the new anchor-shaped data.
- `App.tsx`'s route-change effect skipping its `scrollTo(0,0)` reset when a
  restore is pending (checked via `sessionStorage.getItem` presence) — the
  check itself is shape-agnostic (just presence), so it needs no change.
