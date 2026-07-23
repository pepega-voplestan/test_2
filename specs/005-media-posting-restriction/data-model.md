# Phase 1 Data Model: Per-User Media Posting Restriction

## Schema changes (`api/prisma/schema.prisma`)

### `User` (existing model, new field — the only schema change this feature needs)

| Field | Type | Default | Notes |
|---|---|---|---|
| `is_media_allowed` | `Boolean` | `true` | `false` = restricted (server rejects new media attachments and link-preview embeds authored by this user stop resolving); `true` = allowed (default for all existing and new users). Deliberately a native Prisma `Boolean`, not the `Int` 0/1 convention used by `is_banned`/`is_deleted` elsewhere on `User` — see `research.md` §1 for the explicit (user-directed) reasoning. |

```prisma
model User {
  ...
  is_banned         Int     @default(0)
  is_media_allowed  Boolean @default(true)
  ...
}
```

No backfill migration logic is needed beyond the column default — every existing row implicitly becomes `is_media_allowed = true` (unrestricted), matching current behavior for all users (spec FR-002).

**No other schema changes.** There is exactly one new column for this entire feature.

## Scope of enforcement: creating new physically-stored media only (revised 2026-07-23, refined same day)

**Revision note**: the original design (implemented 2026-07-19) gated every `mediaId`/`youtubeUrl` attach attempt uniformly, and additionally suppressed link-preview embeds (imgur/twitter/coub/tenor/giphy/steam) via a live DTO read. Per explicit user direction, that scope was narrowed twice, same day:

1. First narrowing: the restriction applies only to media physically stored on our server (`MEDIA_PATH`) — direct image/video upload and personal GIF upload. YouTube attachment (explicit or auto-detected), Giphy search-and-attach (a reference to Giphy's CDN, not a local file), and all link-preview embeds are **unaffected regardless of the flag**. The `isMediaAllowed` live-DTO mechanism and its `ShoutCard.tsx` embed-suppression consumer were removed entirely rather than left dormant.
2. Second (finer) narrowing: even for physically-stored media, the restriction only blocks *creating a new file* (`POST /upload/media`, `POST /gifs/upload`). Attaching an *already-existing* `mediaId` — most notably reselecting a GIF from the "Мои GIF" personal library, but this applies uniformly to any pre-existing `mediaId` — is never gated. There is no server-side way to distinguish "an old upload" from "a brand-new one" once a `Media` row exists, so this is enforced simply by never gating the `mediaId` attach path at all in `shouts.js`/`comments.js` — only the two routes that actually write a new file are gated.

`Media.media_type` distinguishes physically-stored (`image`, `video`) from reference-only (`youtube`, `giphy`) content, but as of the second narrowing this distinction no longer matters for gating purposes — see the table below.

| Action | Gated by `is_media_allowed`? |
|---|---|
| `POST /upload/media` — new image/video upload | Yes |
| `POST /gifs/upload` — new personal GIF upload | Yes |
| `POST /gifs/reference` — Giphy search-and-attach (creates a reference-only `Media` row) | No |
| Attaching an existing `mediaId` to a new shout/comment (any `media_type`, including a previously-uploaded `image`/`video`) | No |
| `youtubeUrl` on shout/comment creation, or YouTube auto-detection from plain `content` | No |
| Link-preview embed resolution (imgur/twitter/coub/tenor/giphy/steam) | No |

## Validation rules

- `is_media_allowed` is a server-only field: no client request body ever sets it directly. It is settable only via the AdminJS `User` resource edit action (or an equivalent direct data change).
- A restricted user (`is_media_allowed = false`) hitting `POST /upload/media` or `POST /gifs/upload` (personal GIF upload) MUST be rejected with `403` before any file is written or `Media` row created. This is the **only** enforcement point in the entire feature.
- Attaching an existing `mediaId` on shout/comment creation is **never** gated, regardless of `media_type` or `is_media_allowed` — a restricted user may reuse any already-existing `Media` row (their own prior upload, a Giphy reference, a YouTube row, etc.) exactly as an unrestricted user could.
- `youtubeUrl` on shout/comment creation, and auto-detection of a YouTube URL from plain `content`, are **never** gated by `is_media_allowed`.
- `POST /gifs/reference` (Giphy search-and-attach) is **never** gated by `is_media_allowed`.
- `visibility_tag` (`spoiler`/`nsfw`) on shout creation continues to require `media_id` to be present (existing rule, `shouts.js:244`); unaffected by this revision — a restricted user can obtain a non-null `finalMediaId` via YouTube, a Giphy reference, or a reused existing upload, so this strip logic now genuinely can interact with a restricted user's post (unlike the original design, where it never could).

## State transitions

```
User.is_media_allowed:  true (default) <---> false
                          ^ admin-only transition, either direction

Effect on NEW physically-stored media (upload.js, gifs.js personal-upload
route only):
  Evaluated at write time only — a later flag change never retroactively
  affects real Media rows already on disk (FR-014).

Effect on reusing any existing mediaId, YouTube, Giphy references, and
link-preview embeds:
  None. None of these are ever evaluated against is_media_allowed, in
  either direction, at write time or read time.
```

- Toggling `User.is_media_allowed` never mutates any existing `Shout`/`Comment` row or any existing `Media` row — attached media always stays exactly as it was (spec FR-014).
- There is no "edit-time" transition to model for media attachment: today's codebase has no route that lets a user attach or change media on an existing shout/comment (`editContentSchema`/`editCommentSchema` are `content`-only — confirmed during research), so this restriction adds no new edit-time state machine.

## Derived/DTO surface

None. The `isMediaAllowed` author-DTO field (`feed.js` `enrichFeed()`, `shouts.js`, `comments.js`) and its `web/types.ts` type were removed along with the embed-suppression logic that was its only consumer.

- `api/src/routes/auth.js` — `req.session.user` retains its `mediaAllowed` field (mirroring `showNsfw`/`showPolitics`), read by the frontend purely to gate the *current* user's own composer/personal-GIF-upload UI. This is a UI convenience copy only; it is never read by any server-side enforcement check, which always re-queries Prisma fresh (see `research.md` §2). Unlike the removed DTO field, this one concerns only the logged-in user's own session, not other authors' content.

## Key Entities (recap from spec, now with concrete storage)

- **User media permission** → `User.is_media_allowed` (`Boolean`, default `true`) — governs only whether the user may create new physically-stored `Media` rows (`image`/`video`). Never affects YouTube, Giphy references, or link-preview embeds, and never revisits existing rows.
