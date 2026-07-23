# Contract: `POST /shouts` and `POST /shouts/:id/replies` — NOT gated (revised 2026-07-23, twice)

**Second revision note**: This route is no longer gated by `is_media_allowed` at all, in any branch. The first 2026-07-23 revision made the `mediaId` branch type-conditional (block only `image`/`video`); a same-day follow-up removed that gate entirely — reusing an *already-existing* `mediaId` is never restricted, since the flag governs only the creation of a new physically-stored file, and creation happens exclusively in `upload.js` / `gifs.js`'s personal-upload route (see `media-upload-and-gif.md`), never here. There is no way for this route to tell "a `mediaId` created five minutes ago" from "one created a year ago" — nor does it need to, since both are equally "not a new upload."

Existing endpoints (`api/src/routes/shouts.js:169+`, `api/src/routes/comments.js:15+`). Request shape and success response are unchanged and identical for every user regardless of `is_media_allowed` — the only reason these routes still look up the user's account state at all is the pre-existing, unrelated `is_banned` check.

## Request (unchanged shape)

```
POST /api/v1/shouts
POST /api/v1/shouts/:id/replies
Cookie: session (required — requireAuth)
Body: { content?, mediaId?, youtubeUrl?, visibilityTag?, ... } (per existing shoutSchema/commentSchema)
```

## Authorization check

Only the pre-existing ban check remains; `is_media_allowed` is no longer selected or read by this route at all:

```js
const authCheck = await prisma.user.findUnique({
  where: { id: userId },
  select: { is_banned: true },
});
if (authCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });
```

The `mediaId` / `youtubeUrl` / content-auto-detect branches all run exactly as they would for an unrestricted user — none of them read `is_media_allowed`:

```js
if (mediaId) {
  const mediaRow = await prisma.media.findUnique({ where: { id: mediaId }, select: { id: true /* + existing fields */ } });
  if (!mediaRow) return res.status(400).json({ error: "Медиа не найдено. Загрузите файл заново" });
  finalMediaId = mediaId;
} else if (youtubeUrl) {
  // unconditional
  ...
} else if (content) {
  // YouTube auto-detect — unconditional
  ...
}
```

- A restricted user may attach any pre-existing `mediaId` (their own prior upload, a Giphy reference, a YouTube row) — reuse is never gated.
- `youtubeUrl`, and content-based YouTube auto-detection, are unconditional — no `is_media_allowed` check, for any user.
- A text-only request from a restricted user is, and always was, unaffected.
- Applies identically to both shout creation and comment creation.

## Interaction with existing `visibility_tag` strip (shouts only)

Unchanged in behavior: `shouts.js`'s existing line — `((visibilityTag === "nsfw" || visibilityTag === "spoiler") && !finalMediaId) ? "" : visibilityTag` — strips the tag whenever `finalMediaId` is null. Since this route no longer rejects any restricted-user request on media grounds, a restricted user can obtain a non-null `finalMediaId` through any of the normal means (reused upload, YouTube, Giphy reference) and this strip logic behaves identically to an unrestricted user's request in every case.

## No write-time or request-time gate at all

Creating a shout/comment never checks `is_media_allowed`. The entire feature's enforcement surface is now exactly two routes: `POST /upload/media` and `POST /gifs/upload` (see `media-upload-and-gif.md`) — the only two places a new file is physically written to `MEDIA_PATH`.

## Response (always the existing success shape)

```
200/201 OK — existing shape, identical for restricted and unrestricted users.
```

No 403 is ever returned from this route on media grounds (a restricted user can still get the pre-existing `is_banned` 403, unrelated to this feature).

## Non-goals

- No change to who may create a shout/comment (any authenticated, non-banned user).
- No change to the "text or media required" rule (`"Нужен текст или медиа"`).
- No enforcement of any kind at this layer — see `media-upload-and-gif.md` for where enforcement actually lives.
