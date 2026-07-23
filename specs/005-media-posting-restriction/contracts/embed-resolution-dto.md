# Contract: `isMediaAllowed` on the author sub-object of Shout/Comment read DTOs

**REMOVED (2026-07-23).** This contract described a mechanism that no longer exists. It is kept here, unedited below the line, as a historical record of the original (2026-07-18/19) design — see the revision note that follows for what changed and why.

## Revision note (2026-07-23)

Per explicit user direction, the media-posting restriction (`User.is_media_allowed`) was narrowed in scope to cover only media *physically stored on our server* (direct image/video upload, personal GIF upload/reuse). Link-preview embed resolution (imgur/twitter/coub/tenor/giphy/steam) — the entire subject of this contract — is no longer gated by the flag at all, for any user, in either direction. It behaves today exactly as it did before this feature ever existed.

Concretely, this meant:

- The `isMediaAllowed` field on the `user` sub-object of `Shout`/`Comment` DTOs was removed (`api/src/helpers/feed.js`, `api/src/routes/shouts.js`, `api/src/routes/comments.js`) — it had no other consumer once the embed-gating below was removed.
- `web/types.ts`'s `isMediaAllowed?: boolean` field was removed from the `User` type.
- Both `extractEmbeds()` call sites in `web/components/ShoutCard.tsx` (shout content, comment content) reverted to unconditional — embeds render regardless of the author's `is_media_allowed` state, same as any other user.
- `web/tests/unit/ShoutCard.test.tsx`, which existed solely to test the conditional-suppression behavior below, was deleted (its entire premise no longer applies).

See `data-model.md`'s "Scope of enforcement" section, `spec.md`'s Clarifications (Session 2026-07-23) and FR-009, and `plan.md`'s Summary revision note for the full picture. What *is* still gated is covered by `media-upload-and-gif.md` (uploads) and `shout-comment-creation.md` (the `mediaId`/`youtubeUrl` attach path).

---

## Original contract (2026-07-18/19, superseded above)

Extends the existing feed/read surface (`api/src/helpers/feed.js` `enrichFeed()`, consumed by `GET /shouts`, `GET /shouts/:id`, and the comment-listing routes) and the frontend rendering path (`web/components/ShoutCard.tsx`). No new endpoint, and — per the `/speckit-clarify` correction of 2026-07-18 — no new column on `Shout`/`Comment` either: this is a live read of the author's *current* `User.is_media_allowed`, exposed via the DTO's existing author sub-object.

### DTO change

The `user` sub-object already present on `Shout` and `Comment` responses (the same one that carries `isBanned` today, per `feed.js:136,169`) gains one new field, sourced directly from a live join against `User.is_media_allowed` — not from anything stored on the shout/comment row itself:

```json
{
  "id": "...",
  "content": "...",
  "user": {
    "id": "...",
    "username": "...",
    "isBanned": false,
    "isMediaAllowed": true
  },
  "...": "..."
}
```

- `isMediaAllowed: false` when the author's `User.is_media_allowed` is currently `false`.
- `isMediaAllowed: true` otherwise (default).
- This value reflects the author's *current* state at the moment the content is served, not any state captured when the content was created — it can differ between two reads of the same shout/comment if the author's permission changed in between (spec User Story 3, Scenarios 3-4; intentional).

### Frontend contract (`web/components/ShoutCard.tsx`)

Both existing `extractEmbeds()` call sites become conditional on the relevant author's live flag:

```ts
const embeds = shout.user.isMediaAllowed === false ? [] : extractEmbeds(shout.content);
```

(and identically for the comment content call site, using the comment author's `user.isMediaAllowed`). When `isMediaAllowed` is `false`, the raw content text — including any URLs — still renders normally as plain text/links; only the regex-driven rich-preview expansion (imgur/twitter/coub/tenor/giphy/steam) is skipped.

### Non-goals

- No change to `Media`-backed attachments (images, YouTube) — those are governed entirely by whether a `Media` row exists (`media_id` present or not), which is already covered by the creation-time gate in `shout-comment-creation.md` and is never affected by this live check (FR-014 — attached media is a separate, non-retroactive mechanism).
- No per-row storage, no migration on `Shout`/`Comment`, no write-path change at all for this behavior — it is purely a read-time join plus a client-side conditional.
- Explicitly retroactive by design: this is the one place in the feature where a later admin change *does* change how already-existing content renders. This is a deliberate simplification (single source of truth, no snapshot to keep in sync) accepted in place of the non-retroactivity guarantee an earlier design considered — see `research.md` §5.
