# Quickstart: Validate Per-User Media Posting Restriction

## Prerequisites

- Local dev environment running: `cd web && npm run dev` (API on :3000, Vite on :5173) — see root `CLAUDE.md` Quick Start.
- Admin panel access at `/admin` (see `docs/api.md` Admin Panel section for local credentials setup).
- Two logged-in browser sessions: User A (the account whose media permission will be toggled) and an Administrator on `/admin`.

## Scenario 1 — Admin revokes and restores media permission (User Story 1 / FR-001–FR-004, SC-001)

1. In `/admin`, open User A's record in the `Пользователи` (Users) resource.
2. Uncheck `is_media_allowed` and save.
3. **Expected**: The change is saved immediately; reopening User A's record shows `is_media_allowed` unchecked (`false`).
4. Without User A logging out or refreshing their session, have User A attempt to post a shout with an attached image (Scenario 2 below) — it should already be blocked, proving the change took effect without any session reset.
5. In `/admin`, check `is_media_allowed` back on and save.
6. **Expected**: User A can immediately attach media again on their next attempt (no logout/login needed).
7. Register a brand-new user account.
8. **Expected** (FR-002): The new user's `is_media_allowed` is checked (`true`) by default in `/admin`.

## Scenario 2 — Restricted user blocked from uploading physically-stored media to a shout/comment (User Story 2 / FR-005–FR-008, FR-012, SC-002)

With User A's `is_media_allowed` set to `false` (from Scenario 1):

1. As User A, attempt to create a shout with an uploaded image.
2. **Expected**: The request is rejected (403, `"Вам запрещено прикреплять медиафайлы"`); no shout is created, no media file is stored.
3. As User A, attempt to create a comment with an uploaded video.
4. **Expected**: Same rejection behavior as step 2.
5. As User A, open the GIF picker's "Мои GIF" tab and attempt to upload a *new* personal GIF.
6. **Expected**: The upload button is disabled/rejected — same rejection as steps 2/4.
7. As User A, select a GIF from that same "Мои GIF" library that was uploaded *before* the restriction was applied.
8. **Expected** (refined 2026-07-23): The selection succeeds and the GIF attaches normally — reusing an already-existing personal GIF is not a new upload, so it's unaffected by the restriction, same as Giphy search-and-attach.
9. As User A, post a shout or comment containing only text (no media).
10. **Expected** (FR-010): Succeeds normally, unaffected by the restriction.

## Scenario 3 — Restricted user's Giphy-search GIFs, YouTube attachments, and links are all unaffected (User Story 2 Scenarios 4-5, FR-009, SC-003)

With User A's `is_media_allowed` still `false`:

1. As User A, open the GIF picker's main/search tab, search Giphy, and select a result to attach to a new shout.
2. **Expected**: The GIF attaches and posts successfully — Giphy search-and-attach stores no file on our server, so it is never gated by this restriction.
3. As User A, post a shout with an explicit YouTube attachment (or by pasting a YouTube link, which auto-detects).
4. **Expected**: The YouTube video attaches and posts successfully — YouTube is never gated by this restriction, regardless of whether it was typed as an explicit attach or a plain pasted link.
5. As User A, post a shout containing a link that would normally generate a rich preview (e.g. a Tenor or Imgur link, pasted as plain text without going through the composer's dedicated attach flow).
6. **Expected**: The post saves successfully and the link resolves into a preview exactly as it would for an unrestricted user — link-preview resolution was removed from this feature's scope entirely (see spec Clarifications, Session 2026-07-23) and does not depend on `is_media_allowed` at all.

## Scenario 4 — Existing attached media is untouched by a new restriction (Edge Cases, FR-014, SC-005)

1. As User A (while `is_media_allowed = true`), post one shout with an uploaded image.
2. In `/admin`, set User A's `is_media_allowed` to `false`.
3. Reload the feed as any viewer.
4. **Expected**: The shout with the *uploaded image* still displays it exactly as before — attached media is a separate mechanism (FR-014) and is never hidden by a later restriction. (There is no longer a link-preview counterpart to this scenario — see Scenario 3 above; previews are unaffected by the flag in the first place, so there's nothing for a later restriction to retroactively hide.)

## Scenario 5 — Restriction independent of ban state (Edge Case, FR-015)

1. In `/admin`, ban User A (`is_banned` checked) while leaving `is_media_allowed = true`.
2. **Expected**: User A cannot post/comment at all (existing ban behavior) — this is unrelated to the media restriction and should not be confused with it.
3. Unban User A, then set `is_media_allowed = false` (leaving `is_banned` unchecked).
4. **Expected**: User A can post text-only content normally but is blocked from attaching media (Scenario 2) — confirming the two flags are independent and can be set in any combination.
