# Feature Specification: Per-User Media Posting Restriction

**Feature Branch**: `005-media-posting-restriction`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "New user-level media_allowed 1/0 flag manageable via admin panel to block posting of any media (images, video, GIFs, gif picker) for a user; embeds must not resolve, remain as plain links"

## Clarifications

### Session 2026-07-18

- Q: What are the concrete on/off semantics of the media permission flag? → A: A simple boolean toggle — allowed by default; only an explicit administrator action (or an equivalent direct data change) sets it to disallowed, which is what enables the block. No intermediate/partial states.
- Q: Should whether a post/comment's link resolves into a preview be frozen at the moment the content was created, or always reflect the author's current permission state? → A: Always reflect the author's current state, re-evaluated every time the content is viewed — a single permission flag drives both new-attachment blocking and embed resolution; no separate per-content flag or snapshot is needed. This means restoring a restricted author's permission makes their older content's links start resolving again, and restricting a previously-unrestricted author's permission stops their older content's links from resolving — unlike already-attached media (images/video/GIFs), which is a distinct mechanism (real stored files) and is never retroactively affected either way. **Superseded by the 2026-07-23 revision below — link-preview embeds are no longer gated at all.**

### Session 2026-07-23 — Scope revision

- Q: Should the restriction continue to cover link-preview embeds (imgur/twitter/coub/tenor/giphy/steam) and YouTube attachment? → A: No. Per explicit user direction, the restriction is narrowed to cover **only** media physically stored on our server — direct image/video upload and personal GIF upload. YouTube (explicit attach or auto-detected from content), Giphy search-and-attach (a reference to Giphy's CDN, not a local file), and all link-preview embeds are permanently unaffected by this flag, for every user, in both directions. The live-embed-suppression mechanism from the 2026-07-18 session (a per-view DTO read of the author's flag) is removed rather than kept dormant.
- Q: Within the GIF picker, does the restriction apply uniformly to both "pick from Giphy search" and "upload/reuse your own GIF"? → A: No — they're treated differently now that the rule is storage-based. Picking a GIF from Giphy search (`POST /gifs/reference`) never stores a file on our server, so it is unaffected, same as any other Giphy link. **Superseded by the same-day refinement below regarding "reuse".**
- Q: Should re-selecting an *already-uploaded* personal GIF from the "Мои GIF" library be blocked the same way as uploading a brand-new one? → A: No — per explicit user direction, only the act of *creating* new physically-stored media is restricted. Re-selecting a GIF that was already uploaded (at any point in the past, including before the restriction was applied) is allowed for a restricted user, exactly like Giphy search-and-attach, YouTube, and any other reuse of an existing `mediaId`. This applies uniformly to any pre-existing `mediaId`, not just GIFs — there is simply no other UI pathway today that lets a user reuse old physically-stored media besides the "Мои GIF" library, so in practice this only visibly changes GIF-picker behavior.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrator revokes a user's media privileges (Priority: P1)

An administrator handling abuse (e.g. a user repeatedly posting inappropriate images or GIFs) needs to stop that specific user from attaching any media to their posts or comments, without banning or otherwise restricting their ability to post text.

**Why this priority**: This is the entire point of the feature — without the admin control, there is no way to apply or lift the restriction. It is the minimum slice that delivers value.

**Independent Test**: In the admin panel, open a user record, switch their media permission off, save, and confirm the flag is persisted and visible on that user's record.

**Acceptance Scenarios**:

1. **Given** an administrator is viewing a user record in the admin panel, **When** they turn the media permission off and save, **Then** the user's record reflects the restriction immediately.
2. **Given** a user's media permission was previously turned off, **When** an administrator turns it back on and saves, **Then** the restriction is lifted immediately and the user's record reflects the change.
3. **Given** no administrator has changed the setting, **When** a new user registers, **Then** that user's media permission defaults to allowed.

---

### User Story 2 - Restricted user attempts to post physically-stored media (Priority: P1)

A user whose media permission has been revoked tries to upload a *new* image, video, or personal GIF to a new post or comment. The system must prevent that new upload from being stored, regardless of which client or entry point is used. Attaching a YouTube video, picking a GIF from Giphy's search results, posting a link that would normally generate a rich preview, or reusing/re-selecting media that was already uploaded (including a previously-uploaded personal GIF from the "Мои GIF" library) are **not** covered by this restriction — see the 2026-07-23 Clarifications above.

**Why this priority**: This is the core enforcement behavior. Without server-side enforcement, the admin flag from User Story 1 is purely cosmetic and can be bypassed.

**Independent Test**: With a test user's media permission turned off, attempt to submit a post or comment with a *newly* uploaded image or video directly against the posting capability, and confirm the upload is rejected while the surrounding text content, YouTube attachment, Giphy-search GIF attachment, and reuse of any already-existing media are all unaffected.

**Acceptance Scenarios**:

1. **Given** a user's media permission is off, **When** that user attempts to submit a post with an uploaded image, **Then** the submission is rejected with a clear, localized explanation and no file is stored.
2. **Given** a user's media permission is off, **When** that user attempts to submit a comment with an uploaded video, **Then** the submission is rejected the same way as for posts.
3. **Given** a user's media permission is off, **When** that user opens the GIF picker and attempts to upload a *new* personal GIF, **Then** the upload is rejected the same way. **When** that user instead selects a GIF from their existing "Мои GIF" (My GIFs) library — one uploaded at any point in the past — **Then** the selection succeeds; reusing already-stored media is never restricted.
4. **Given** a user's media permission is off, **When** that user opens the GIF picker and searches Giphy's library, selecting a result to attach, **Then** the GIF is attached successfully — searching/attaching a Giphy result is unaffected, since nothing is stored on our server.
5. **Given** a user's media permission is off, **When** that user attaches a YouTube video (explicitly, or by pasting a YouTube link that gets auto-detected), **Then** the attachment succeeds — YouTube is unaffected regardless of the flag.
6. **Given** a user's media permission is off, **When** that user submits a post or comment containing only text (no media), **Then** the submission succeeds normally.
7. **Given** a user's media permission is off, **When** that user attempts to upload a *new* image, video, or personal GIF through any client entry point (not only the primary composer), **Then** the attempt is rejected the same way, since enforcement does not depend on which interface initiated the request.

---

### Edge Cases

- What happens if an administrator revokes media permission for a user who already has physically-stored media attached to existing posts/comments? Existing media remains untouched and continues to display; the restriction only prevents new physically-stored media from being uploaded going forward.
- What happens if a restricted user attempts to edit an existing post/comment that already has physically-stored media attached? Not applicable in practice — there is no edit-time media-attachment pathway at all (edit is text-only), so this restriction has nothing to enforce there regardless of the user's permission.
- What happens if a restricted user tries to set a media-only action, such as uploading a new avatar or profile media? Avatar/profile media is a distinct capability from post/comment media; this restriction applies specifically to physically-stored shout and comment media and does not extend to profile-level media unless explicitly stated by the administrator elsewhere.
- What happens when a restricted user's post/comment attempt includes a `spoiler`/`nsfw` visibility tag together with a YouTube attachment, a Giphy-search GIF, or a reused already-existing `mediaId`? All three are unaffected by the restriction, so the submission proceeds exactly as it would for an unrestricted user — the tag is preserved because `media_id` ends up non-null, per the pre-existing rule (tag is stripped/ignored only when no media is present) that applies identically to every user regardless of this flag.
- What happens when a restricted user's post/comment attempt includes a *new* image/video upload or a *new* personal GIF upload? The entire submission is rejected (per FR-011's error), including any accompanying text and visibility tag — no partial save occurs. This does not apply to reusing/re-selecting media that already exists (e.g. picking a previously-uploaded GIF from "Мои GIF") — see Clarifications, Session 2026-07-23 (refinement).
- What happens if the restriction is toggled off and back on again rapidly? Each toggle takes effect immediately for subsequent requests; no request queuing or delayed effect is expected.
- What happens to link previews (imgur/twitter/coub/tenor/giphy/steam) and YouTube embeds authored by a restricted user? Nothing — they are never gated by this flag, at any point, in either direction. This is a deliberate scope narrowing from an earlier design; see Clarifications, Session 2026-07-23.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store a per-user media permission flag with two states: allowed and restricted.
- **FR-002**: System MUST default every new user's media permission to allowed.
- **FR-003**: Administrators MUST be able to view and change any user's media permission from the admin panel.
- **FR-004**: A change to a user's media permission MUST take effect immediately for that user's subsequent actions, without requiring the user to log out, log back in, or otherwise reset their session.
- **FR-005**: System MUST reject, at the server, any attempt by a restricted user to upload a *new* image or video to a new post.
- **FR-006**: System MUST reject, at the server, any attempt by a restricted user to upload a *new* image or video to a new comment.
- **FR-007**: System MUST prevent a restricted user from uploading a *new* personal GIF for attachment to a post or comment. System MUST NOT prevent a restricted user from selecting a GIF from their existing personal-GIF library ("Мои GIF"), nor from searching Giphy's library and attaching a search result — neither path creates a new file on our server, so neither is restricted (see FR-009). *(Refined 2026-07-23, same day as the FR-009 narrowing: the original wording of this requirement also blocked reusing an already-uploaded personal GIF; per explicit user direction, only creating a new upload is restricted.)*
- **FR-008**: Not applicable — there is no route that lets a user attach or replace media on an existing post/comment via edit (edit is text-only), so this restriction has no edit-time behavior to specify.
- **FR-009**: System MUST NOT restrict, in any way, a restricted user's ability to attach a YouTube video (explicitly, or via auto-detection of a YouTube link in plain content), attach a Giphy-search result, reuse/re-select any already-existing `mediaId` (including a previously-uploaded personal GIF), or have any link (YouTube, imgur, twitter, coub, tenor, giphy, steam, or otherwise) resolve into a rich preview. None of these create a new file physically stored on our server, and this flag governs only the creation of new physically-stored media — it never gates any of the above, for any user, in either direction. *(This requirement replaces an earlier design, superseded 2026-07-23, that suppressed link-preview embeds live per the author's current permission, and a same-day narrower revision that also gated reuse of already-existing physically-stored media — see Clarifications.)*
- **FR-010**: System MUST continue to allow restricted users to post and comment with text-only content, including any links, YouTube attachments, Giphy-search GIFs, and reuse of any already-existing media.
- **FR-011**: System MUST present a clear, localized (Russian-language) explanation to a restricted user when a *new* physically-stored-media upload attempt is rejected.
- **FR-012**: Enforcement of the media restriction MUST NOT depend solely on client-side UI gating — the server MUST independently enforce the restriction regardless of which client or entry point is used.
- **FR-013**: When a restricted user's submission includes an upload attempt for a *new* physically-stored file (a new image/video upload, or a new personal GIF upload), the system MUST reject the **entire** submission — including any accompanying text — with the FR-011 explanation; no partial save occurs, and none of that submission's text is persisted alongside the rejected media. This is distinct from FR-010: a submission whose media component is YouTube, a Giphy-search reference, a reused already-existing `mediaId`, or absent entirely is not affected by this rule at all and succeeds normally, subject only to the pre-existing requirement that a post/comment needs either text or media.
- **FR-014**: System MUST leave *already-attached* physically-stored media (images, video, personal GIFs) on existing posts/comments visible and functional after a user's permission is later changed in either direction (no retroactive removal).
- **FR-015**: The media permission restriction is independent of and does not replace existing account states (e.g. banned/soft-deleted); it MUST be settable on a user regardless of those other states.

### Key Entities

- **User media permission**: An attribute of a user account representing whether that user is currently allowed to *create new* media physically stored on our server (images, video, personal GIFs) for posts and comments. Does not affect reuse of any already-existing media, YouTube attachment, Giphy-search GIF attachment, or link-preview resolution of any kind. Defaults to allowed; changed only by an administrator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can revoke or restore a specific user's media posting ability in under 30 seconds from the admin panel, with the change taking effect on that user's very next physically-stored-media upload attempt.
- **SC-002**: 100% of *new* physically-stored-media upload attempts (image, video, personal GIF upload) by a restricted user are blocked at the server, even if attempted through means other than the standard composer UI.
- **SC-003**: 100% of YouTube-attachment, Giphy-search-attachment, already-existing-media-reuse (including a previously-uploaded personal GIF), and link-preview-resolution attempts by a restricted user succeed exactly as they would for an unrestricted user — zero false-positive blocks on this scope-narrowed feature.
- **SC-004**: Restricted users retain full ability to post and comment with text-only content, with no measurable increase in failed text-only submissions after the restriction is applied.
- **SC-005**: Already-attached physically-stored media (images, video, personal GIFs) on existing posts/comments remains visible and functional regardless of any later change to the author's permission.

## Assumptions

- "Media" in scope for this restriction means only *newly creating* images, video, or personal GIFs physically stored on our server — it does not extend to user avatars or other profile-level media, and (per the 2026-07-23 revision, refined same day) does not extend to YouTube attachment, Giphy-search-and-attach, link-preview embeds of any kind, or reuse/re-selection of any already-existing media (including a previously-uploaded personal GIF from "Мои GIF"), since none of those create a new file on our server.
- The restriction is a binary on/off toggle per user (no partial restriction, e.g. "images but not personal GIFs"), defaulting to allowed until an administrator explicitly disables it.
- Only administrators (via the admin panel, or an equivalent direct data change) can change this flag; there is no self-service or automated mechanism for a user to have their own media permission changed as part of this feature.
- New-media-upload blocking (User Story 2) applies at the moment of content creation/edit and is not retroactive — content created before a restriction was applied keeps whatever physically-stored media it already has. There is no other mechanism in this feature that is retroactive in either direction — YouTube, Giphy references, and link previews are simply never gated at all, at any time.
