# Contract: Comment Feed Client Behavior

**Feature**: `012-comments-feed` | **Date**: 2026-11-04

No new HTTP routes. This contract documents client rules against existing APIs and SSE.

## Hydrate

```
GET /api/v1/shouts?limit=40&sortBy=new
Credentials: include
```

**Response usage**

1. For each shout: remember `ShoutMeta` from `content` (via `previewText`) + attachment flags from `media`/`gallery`.
2. Flatten `shout.comments[]` into `CommentFeedItem`s.
3. Take newest 40 of that page as seed candidates.
4. **Upsert-only merge** into current buffer:
   - Existing buffer ids keep rows that are missing from the response (SSE may have added them during fetch).
   - Matching ids update content/meta fields preferring non-empty shout preview / attachment flags.
5. Re-sort newest-first; slice to 40.
6. **Do not** remove buffer rows solely because they are absent from this page.
7. Throttle: skip if last successful hydrate was &lt; 60s ago unless `force: true` (cold start / resume).

## SSE handlers

| Event | Action |
|-------|--------|
| `new_comment` | If id not in buffer, prepend `CommentFeedItem` from `data.comment`; bump unseen if panel closed; cap 40 |
| `edit_comment` | If id in buffer, replace `content` |
| `delete_comment` | Remove id from buffer |
| `new_shout` | Update `ShoutMeta` from `data.shout`; refresh quote strips |
| `edit_shout` | Update `ShoutMeta.text` from `data.content` when present |

## UI strings (Russian)

| Key | Text |
|-----|------|
| Toggle show | Показать ленту комментов |
| Toggle hide | Скрыть ленту комментов |
| Panel aria | Лента комментов |
| Empty | Пока нет комментов — ждём обновления… |
| Jump | К новым ↑ |
| Soft-hide | Контент от этого пользователя скрыт |
| Media label | [медиа] |
| Shout quote hover | Перейти к воплю |
| Comment body hover | Перейти к комментарию |
| Spoiler titles | Нажмите, чтобы раскрыть спойлер / Нажмите, чтобы скрыть |

## Navigation

- Shout quote → `/shout/:shoutId`
- Comment body / comment media label → `/shout/:shoutId?comment=:commentId`
- Author name → `/profile/:userId`
- Mentions → `/profile/:userId` from token id

## Layout tokens

- Desktop width: `340px`
- Mobile breakpoint: `max-width: 767px` → full-width overlay
- Panel top offset: sticky header `52px`
- Panel z-index below Lightbox (`z-50`), above ordinary content (~`z-40`)
