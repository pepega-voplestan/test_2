# Contract: Creating a shout or comment with a gallery

**Feature**: 006-multi-media-gallery | **Stage**: 1

Applies to `POST /api/v1/shouts` and `POST /api/v1/comments`.

## Request

The existing `mediaId` field is **retained and still valid** — it is equivalent to
a one-item gallery. A new optional `mediaIds` array is added.

```jsonc
{
  "content": "…",
  "mediaIds": ["uuid-1", "uuid-2", "uuid-3"],   // NEW, optional, ordered, max 5
  "mediaId": "uuid-1",                          // existing, optional, == mediaIds of length 1
  "youtubeUrl": "…",                            // existing, optional
  "visibilityTag": "spoiler",                   // existing
  "replyToId": "…"                              // comments only
}
```

**Array order is the gallery order.** `mediaIds[0]` becomes the preview item.

## Validation (`api/src/helpers/validation.js`)

```js
mediaIds: z.array(z.string().uuid()).min(1).max(5).optional()
```

Applied in addition to the existing `mediaId: z.string().uuid().optional()`.

## Server-side rules, in evaluation order

| # | Rule | Failure response |
|---|---|---|
| R1 | `mediaId` and `mediaIds` MUST NOT both be present | 400 — internal misuse; generic Russian error |
| R2 | `mediaIds.length <= 5` (FR-002, FR-033) | 400 `{ "error": "Можно прикрепить не более 5 файлов" }` |
| R3 | Gallery MUST NOT be combined with `youtubeUrl` (FR-027) | 400 `{ "error": "Можно прикрепить или изображение, или видео" }` — reuses the existing message |
| R4 | Every id in `mediaIds` MUST exist in `media` | 400 `{ "error": "Медиа не найдено. Загрузите файл заново" }` — reuses the existing message |
| R5 | Every referenced media MUST have `media_type = "image"` (I4) | 400, generic Russian error |
| R6 | `mediaIds` MUST contain no duplicates | 400, generic Russian error |
| R7 | Requires text or media, as today | 400 `{ "error": "Нужен текст или медиа" }` |

**Deliberately NOT enforced server-side**: the Stage 1–2 GIF/image exclusivity
(FR-035). It is a client-only, time-boxed UX gate — see `research.md` D8.

## Interaction with `is_media_allowed` (feature 005)

**Unchanged, and this is important.** Feature 005 gates the *creation* of new
stored media, which happens at `POST /upload/media` — not here. Referencing
already-uploaded ids is never gated, exactly as specified in 005's FR-009.

The practical consequence for a restricted user is that all N uploads fail at the
upload step, so the create request never happens. FR-009's "reject the entire
submission" is therefore satisfied upstream, with no new check in the create
routes. Existing 005 tests continue to cover this.

## Persistence

Handled exclusively by `api/src/helpers/gallery.js`, in one transaction:

1. Insert `mediaIds.length` rows into `shout_media` / `comment_media` at
   positions `0..n-1`.
2. Set the parent's `media_id = mediaIds[0]` (Invariant I1).
3. Apply the existing `visibility_tag` strip rule against the resulting
   `media_id` — unchanged logic (FR-030).

No other module may write `media_id` or the join tables.

## Response

Unchanged shape, plus the `gallery` field per
[gallery-dto.md](./gallery-dto.md) when 2+ items were attached.

## Backward compatibility

A client sending only `mediaId` behaves exactly as before and produces a
one-item gallery. This is what permits the API to ship before the composer within
Stage 1.
