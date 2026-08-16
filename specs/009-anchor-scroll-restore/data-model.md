# Phase 1 Data Model: Anchor-Based Feed Scroll Restoration

No database schema changes. This feature is entirely client-side; the only
"data model" is the shape of the `sessionStorage` entry that replaces the
shipped feature's `SavedFeedState`, plus how it relates to the existing
`Shout` entity it references by ID (unchanged, read-only from this feature's
perspective).

## `SavedFeedAnchor` (sessionStorage, key: `feedScrollState` — key unchanged, shape changed)

Replaces the shipped `SavedFeedState` (`{ scrollY, count, activeTab,
popularSort }`). Written on feed unmount, read once (and always cleared,
regardless of outcome) on feed mount.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'anchor'` (literal) | Discriminator distinguishing this shape from the old `SavedFeedState` shape, which has no `kind` field. Any parsed value without `kind === 'anchor'` MUST be treated as "nothing to restore" (see research.md). |
| `shoutId` | `string` | ID of the shout that was at/nearest the top of the viewport when the reader left. Not guaranteed to still exist or still be reachable on restore (deleted, or beyond the search limit) — restore logic MUST handle absence via the defined fallback, not assume presence. |
| `offsetFromTop` | `number` | Pixels between the anchor shout's top edge and the viewport's top edge at save time. `<= 0` in the normal case (the anchor is whichever shout the reader has scrolled at or past — see research.md); `> 0` only in the edge case where the reader hasn't scrolled past the first rendered shout yet. Used to reproduce "how far into it they'd scrolled," not just "this shout is visible somewhere." |
| `approxItemsAbove` | `number` | How many shouts were loaded above the anchor in the feed's own list at save time (`shouts.findIndex(...)` against React state, not a DOM measurement — unaffected by the DOM-clamping timing issue `offsetFromTop`/`liveAnchorRef` guard against). Used **only** to size the initial estimated placeholder/scroll position shown before any data has loaded on the next visit (see research.md) — never used to gate or validate the search-and-stop restore loop, which locates the anchor purely by ID (FR-004: accuracy must not depend on item counts matching). A materially wrong estimate here only means a larger correction jump once the real anchor renders, never a wrong final position. |
| `activeTab` | `'new' \| 'popular'` | Unchanged from the shipped shape — which feed tab was active. |
| `popularSort` | `'likes' \| 'comments'` | Unchanged from the shipped shape — only meaningful when `activeTab === 'popular'`, same as today. |

**Invariants**:
- Single-use: cleared on read (mount), regardless of whether restoration
  succeeds, fails, or falls back — never left around for a later, unrelated
  visit to accidentally consume.
- Written unconditionally on every feed unmount (matches shipped behavior —
  not specific to navigating via "Назад"), so restoration works the same
  regardless of how the reader left the feed or returns to it.
- No `count` field (present in the old shape) — restoration accuracy no
  longer depends on a loaded-item count; presence of `shoutId` in loaded
  results is the only success condition (FR-004).

## `Shout` (existing entity — referenced, not modified)

This feature only reads a shout's `id` (to search for) and its rendered
position (to measure). No new fields, no schema change, no new query shape
beyond what the existing `/api/v1/shouts` list endpoint already returns when
paginating (cursor- or offset-based, per tab — see research.md). A shout that
has been soft-deleted (`is_deleted=1`) is already excluded from feed list
results by existing backend behavior; from this feature's perspective that is
indistinguishable from "not found within the search limit" and is handled by
the same fallback path (FR-006) — no new soft-delete-aware logic needed.

## State transition (client-side, per feed mount/unmount cycle)

```text
[feed mounted, reader scrolls] 
        │
        ▼ (unmount, e.g. navigating into a shout)
[determine topmost visible shout via shoutRefs] ──▶ [write SavedFeedAnchor to sessionStorage]
        │
        ▼ (feed remounts, e.g. "Назад")
[read + clear sessionStorage entry synchronously, on first render]
        │
        ├─ no entry / wrong shape ──▶ [normal fresh load — unchanged]
        │
        └─ valid SavedFeedAnchor
                │
                ▼
        [reserve estimated placeholder height; scrollTo(0, estimate) before first paint]
                │
                ▼
        [page (fetchShouts) until shoutId found, or search-limit reached]
                │
                ├─ found ──▶ [reveal content; measure real anchor position; correction scrollTo]
                │
                └─ not found (deleted / limit reached) ──▶ [reveal content at top — same as a fresh load]
```
