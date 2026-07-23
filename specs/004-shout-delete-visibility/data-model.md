# Phase 1 Data Model: Hide Uncommented Shouts on Delete

No schema changes. This feature is a behavior/query change over the existing `shouts` and `comments` tables (see `api/prisma/schema.prisma:38-62` and `:126-147`). Documented here are the entities and derived state relevant to this feature's logic, not new persisted fields.

## Entities

### Shout (existing, no schema change)

| Field | Type | Relevance to this feature |
|---|---|---|
| `is_deleted` | `Int` (0/1) | Unchanged meaning — soft-delete marker (constitution III). This feature does not add a new value; a shout is either not deleted (`0`) or soft-deleted (`1`). What changes is whether a soft-deleted row is *exposed* by read queries. |
| `is_pinned` | `Int` (0/1) | If a pinned, zero-comment shout is deleted, it is removed like any other zero-comment shout (spec Edge Cases) — the pinned slot is simply left empty; no new field or auto-repin logic is introduced. |
| `comments` (relation) | `Comment[]` | The count of comments with `is_deleted: 0` on this relation is evaluated twice, independently: once at deletion time (decides which SSE event is broadcast — FR-001–FR-005), and again on every subsequent feed read (decides whether the row is excluded — FR-006). The two evaluations are not linked by any stored flag; see the Design Note in research.md Decision 4 for why a live re-evaluation was chosen over persisting the delete-time decision. |

### Comment (existing, no schema change)

| Field | Type | Relevance to this feature |
|---|---|---|
| `shout_id` | `String` | Used to count comments per shout. |
| `is_deleted` | `Int` (0/1) | Only comments with `is_deleted: 0` count toward the "zero comments" check — soft-deleted comments don't count, consistent with how comment counts are derived elsewhere (`enrichFeed`'s `commentsByShout` grouping already only fetches `is_deleted: 0` comments). |

## Derived State: Shout Visibility Outcome

Not a stored field. Two separate, independent evaluations of the same underlying data, at two different times:

| Comment count **at deletion** (`is_deleted: 0` only) | `is_deleted` set to | Broadcast event (one-shot, decided once) |
|---|---|---|
| 0 | 1 | `remove_shout` (new) |
| ≥ 1 | 1 | `delete_shout` (existing, unchanged) |

| Comment count **at each subsequent read** (`is_deleted: 0` only, re-evaluated live) | Feed / detail query behavior at that read |
|---|---|
| 0 | Excluded from `GET /shouts` and `GET /shouts/:id` |
| ≥ 1 | Included, rendered as the existing deleted-placeholder (`mapShout`'s `isDeleted` branch in `api/src/helpers/feed.js:148-182`) |

Because the second table is re-evaluated on every read rather than derived from the first table's one-time result, a shout's comment count can change between deletion and a later read (comments added or removed independently), which can move it between rows of the second table — accepted, self-healing behavior (see spec.md FR-006 and Edge Cases).

## State Transition

```
Shout (is_deleted=0, comments=N)
        │
        │  DELETE /shouts/:id (author-only)
        ▼
  count comments where is_deleted=0, within same transaction as the update
        │
        ├── N == 0 ──► is_deleted=1  ──► broadcast "remove_shout" ──► hidden everywhere, live
        │
        └── N >= 1 ──► is_deleted=1  ──► broadcast "delete_shout" ──► placeholder everywhere, live (unchanged)
```

No entity gains new states beyond this: a shout was already either `not deleted` or `deleted`; this feature only changes what "deleted" looks like downstream, branching on comment count both at the transition (for the broadcast) and again on each later read (for feed visibility) — the two are independent, live evaluations, not one decision propagated forward.
