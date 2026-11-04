# Data Model: Live Comments Feed Sidebar

**Feature**: `012-comments-feed` | **Date**: 2026-11-04

No new database tables or API entities. Client-only shapes derived from existing `Comment` / `Shout` DTOs.

## CommentFeedItem

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (uuid) | Comment id |
| `shoutId` | string (uuid) | Parent shout |
| `userId` | string | Author id (for ignore checks) |
| `name` | string | Author display name |
| `content` | string | Raw markup (`||spoilers||`, `@[name:id]`) |
| `timestamp` | string (ISO) | Sort key (newest first) |
| `hasMedia` | boolean | Comment has `media` and/or non-empty `gallery` |
| `shoutPreview` | string | One-line quote text (may be empty for media-only) |
| `shoutHasMedia` | boolean | Parent shout has attachment(s) |

**Invariants**

- Buffer holds at most 50 items, sorted newest-first (`timestamp` desc, then `id` desc).
- Soft-deleted comments never enter via hydrate (`is_deleted=0` server-side); removal from buffer only on `delete_comment` SSE (or hard filter N/A).
- `hasMedia` / `shoutHasMedia` never imply a media URL is still on disk — UI uses label only.

## ShoutMeta (client cache)

| Field | Type | Notes |
|-------|------|-------|
| `text` | string | Sanitized preview (no lone «…» / «[медиа]» stubs) |
| `hasMedia` | boolean | From shout `media` / `gallery` |

Keyed by `shoutId`. Updated from hydrate, `new_shout`, `edit_shout`, and optional DOM-independent text already present on DTOs. No per-row network fetch.

## Session UI state (in-memory)

| Field | Type | Notes |
|-------|------|-------|
| `panelOpen` | boolean | Default false |
| `unseenWhileClosed` | number | Cleared when panel opens |
| `stickToTop` | boolean | Autoscroll newest while true |
| `revealedIgnoredIds` | Set\<commentId\> | Soft-hide reveals for current session |

## Relationships

```text
Shout (API) 1──* Comment (API)
                │
                ▼
         CommentFeedItem (derived)
                │
                └── uses ShoutMeta(shoutId) for quote strip
```
