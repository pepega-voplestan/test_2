# Feature Specification: Emoji & GIF Picker

**Feature Branch**: `002-emoji-gif-picker`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "I'd like to have a feature that allows us to expand the Emoji picker functionality. Instead of just emojis, it could have an additional tab in the same window with GIF picker. This GIF picker could be similar to Discord in UI and functionality, getting data from some 3rd party like Giphy. Additionally, users should be able to make the gifs as favorites for quick access. And, they should be able to upload their own GIFs to store them for a quick access later. Of course, for their own uploaded gifs, size limitations are 1:1 same as for shouts. Don't forget about iOS limitations and cross device experience"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search and Insert a GIF (Priority: P1)

A logged-in user is composing a shout or comment. They open the emoji picker and switch to the GIF tab. They type a search term (e.g., "смех"), see a grid of animated GIF results from Giphy, tap or click one, and it is inserted as the media attachment for their post. If a media attachment was already selected, the GIF replaces it. The picker closes after insertion.

**Why this priority**: Core value proposition — without GIF search and insert, the entire feature has no utility.

**Independent Test**: Can be fully tested by opening the composer, navigating to the GIF tab, searching, selecting a result, and verifying the GIF appears as the attached media.

**Acceptance Scenarios**:

1. **Given** a user has the composer open with no media attached, **When** they open the emoji picker → GIF tab, type a search term, and click a result, **Then** the GIF is set as the post's media attachment and the picker closes.
2. **Given** a user already has an image attached to their shout, **When** they select a GIF from the GIF tab, **Then** the GIF replaces the existing image attachment (single-media rule enforced).
3. **Given** no search term is entered, **When** the GIF tab is opened, **Then** trending or featured GIFs are shown by default so the user can browse without typing.
4. **Given** Giphy is unreachable, **When** the GIF tab is opened, **Then** a user-friendly error message in Russian is displayed and the emoji tab remains fully functional.

---

### User Story 2 - Browse GIFs by Category / Trending (Priority: P2)

A user opens the GIF tab without a search intent and browses trending or category-organized GIFs (e.g., "Реакции", "Смешное", "Спорт"). They find something they like by scrolling and tap to insert it.

**Why this priority**: Discovery without search is a major usage pattern (mirrors Discord behavior); it reduces friction for casual GIF use.

**Independent Test**: Open the GIF tab with an empty search field and verify a curated set of GIFs is displayed in a scrollable grid, organized into recognizable categories.

**Acceptance Scenarios**:

1. **Given** the GIF tab is opened with no search input, **When** the default view loads, **Then** a set of trending GIFs is shown, scrollable, with visible category headings in Russian.
2. **Given** the user is browsing a category, **When** they tap a GIF, **Then** it is inserted as the post's media attachment.

---

### User Story 3 - Save and Access GIF Favorites (Priority: P3)

While browsing or searching GIFs, a logged-in user sees a GIF they want to reuse. They tap a bookmark/heart icon on the GIF to save it to their favorites. A "Избранное" (Favorites) section appears at the top of the GIF picker, providing instant access to all saved GIFs. They can remove a GIF from favorites at any time.

**Why this priority**: Repeat use of favorite GIFs is a high-frequency behavior for power users and strongly mirrors Discord UX expectations.

**Independent Test**: Favorite a GIF from search results, close and reopen the picker, verify the GIF appears under Favorites; then un-favorite it and verify it is removed.

**Acceptance Scenarios**:

1. **Given** a user finds a GIF in search or browse results, **When** they tap the favorite icon, **Then** the icon updates immediately (optimistic) and the GIF appears in the Favorites section on next view.
2. **Given** a user taps favorite and the server request fails, **When** the error is returned, **Then** the favorite icon reverts to its prior state without a page reload.
3. **Given** a user opens the Favorites section, **When** they tap the unfavorite icon on a saved GIF, **Then** it is removed from the list immediately (optimistic) with rollback on failure.
4. **Given** the Favorites section is empty, **When** it is opened, **Then** a prompt in Russian explains how to add favorites.

---

### User Story 4 - Upload and Reuse Personal GIFs (Priority: P4)

A logged-in user wants to use a GIF not available on Giphy. They tap an upload button in the GIF picker, choose a GIF file from their device (or camera roll on mobile), and it is uploaded to their personal library. The GIF immediately appears under a "Мои GIF" (My GIFs) section and can be inserted into posts from that session onward. They can also delete uploaded GIFs from their library.

**Why this priority**: Custom uploads distinguish the feature from a plain Giphy integration and address the use case of reaction GIFs that aren't on public providers.

**Independent Test**: Upload a valid GIF file, verify it appears in "My GIFs," insert it into a post, then delete it and verify it no longer appears.

**Acceptance Scenarios**:

1. **Given** a user taps upload and selects a valid GIF file within the size limit, **When** upload completes, **Then** the GIF appears in "Мои GIF" and is immediately selectable.
2. **Given** a user attempts to upload a file that exceeds the allowed size, **When** the file is chosen, **Then** a Russian-language error message explains the size limit and the upload is rejected without sending the file.
3. **Given** a user selects a non-GIF file (e.g., PNG, MP4), **When** the file is chosen, **Then** a Russian-language error message indicates only GIF files are accepted.
4. **Given** a user taps delete on a personal GIF in "Мои GIF," **Then** it is removed from their library and no longer appears in the picker.
5. **Given** the user is on iOS, **When** they tap upload, **Then** the native iOS file/photo picker opens and allows selecting an animated GIF from their Photos library or Files app.

---

### Edge Cases

- What happens when the GIF tab is opened on a very slow connection and results are loading? A skeleton/loading state must be shown so the picker does not appear broken.
- What if a user's Favorites list exceeds a very large number (e.g., hundreds)? The list must remain scrollable and performant; a reasonable per-user cap may be applied.
- What if the same GIF is favorited twice (race condition or double-tap)? The system must be idempotent — duplicate favorites are not created.
- What happens on iOS when the emoji picker is open and the user switches to the GIF tab and taps the search field? The soft keyboard must not obscure the search results; the picker adjusts scroll position.
- What if an uploaded GIF is corrupt or unreadable? The upload must be rejected with a clear Russian-language message.
- On devices with "Reduce Motion" enabled (iOS Accessibility, Android), GIFs in the picker grid display as static first-frame thumbnails rather than animating continuously.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The emoji picker panel MUST include a GIF tab alongside the existing emoji content, accessible via a tab control at the top of the picker window.
- **FR-002**: The GIF tab MUST display a search field; submitting a search query retrieves matching GIFs from the Giphy API.
- **FR-003**: When no search is active, the GIF tab MUST display trending GIFs organized into category sections with Russian-language headings so users can browse without typing.
- **FR-004**: Users MUST be able to select any displayed GIF to insert it as the media attachment for the current post or comment.
- **FR-005**: Selecting a GIF MUST enforce the single-media-per-post/comment constraint — it replaces any previously selected image; selecting a GIF while a YouTube embed is set is not permitted.
- **FR-006**: Authenticated users MUST be able to mark any Giphy GIF as a favorite using a visible control on the GIF thumbnail.
- **FR-007**: The GIF picker MUST display a "Избранное" section that lists all GIFs the user has favorited, available without a search query.
- **FR-008**: Users MUST be able to remove a GIF from favorites; the removal MUST take effect immediately with rollback on server error (optimistic UI).
- **FR-009**: Favoriting a GIF MUST be idempotent — attempting to favorite an already-favorited GIF MUST NOT create a duplicate entry.
- **FR-010**: Authenticated users MUST be able to upload their own GIF files via an upload control within the GIF picker.
- **FR-011**: Uploaded GIFs MUST be rejected if they exceed the file size limit that applies to shout media attachments (see FR-015).
- **FR-012**: Only GIF-format files MUST be accepted for upload; other formats MUST be rejected (see FR-015).
- **FR-013**: Successfully uploaded GIFs MUST appear in a "Мои GIF" section within the GIF picker for reuse in future posts.
- **FR-014**: Users MUST be able to delete uploaded GIFs from their personal library; deleted entries MUST be soft-deleted and no longer appear in the picker.
- **FR-015**: All user-visible text in the GIF picker (labels, tabs, empty states, error messages, section headings) MUST be written in Russian with correct grammatical forms.
- **FR-016**: If the Giphy API is unavailable, the GIF tab MUST display a Russian-language error message; it MUST NOT crash the emoji picker or the composer.
- **FR-017**: The GIF picker MUST function correctly on iOS Safari (and as a PWA), including file upload via the native iOS photo/file picker.
- **FR-018**: On devices with system-level reduced-motion settings enabled, GIF thumbnails in the picker grid MUST be displayed as static images rather than auto-animating.
- **FR-019**: Touch targets for all interactive elements (GIF thumbnails, tab buttons, favorite icons, upload button) MUST provide a minimum 44 × 44 px tap area on mobile (per Apple HIG / WCAG 2.5.5).
- **FR-020**: The GIF picker layout MUST be responsive and usable across desktop, tablet, and mobile screen sizes without horizontal overflow or broken layouts.
- **FR-021**: The search field and GIF grid MUST remain accessible when the soft keyboard is visible on mobile (the picker must not be fully obscured by the keyboard).
- **FR-022**: Unauthenticated users MAY browse trending GIFs and search via the GIF tab; the Favorites and My GIFs sections MUST display a Russian-language prompt to log in rather than functional controls.
- **FR-023**: The GIF tab MUST display Giphy attribution branding ("Powered by GIPHY") as required by the Giphy API Terms of Service; this branding must be visible whenever GIF content is shown.
- **FR-024**: The personal GIF upload endpoint MUST apply the same rate-limiting behaviour as the existing media upload endpoint, falling back to IP-based limiting for unauthenticated requests.

### Key Entities

- **GifFavorite**: Represents a user's saved reference to an external GIF. Associates a user with a Giphy GIF identifier, its animated CDN URL, and a static still URL (used when reduced-motion mode is active), along with a creation timestamp. A user may not have duplicate favorites for the same GIF ID.
- **UserGif**: Represents a user-uploaded GIF stored in the application's media storage. Tracks the owner, file metadata (size, original filename), upload timestamp, and soft-delete state. Subject to the same storage and access patterns as shout media attachments.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open the GIF tab, search for a term, and insert a GIF into a post in under 15 seconds under normal network conditions.
- **SC-002**: GIF search results appear within 2 seconds of submitting a search query on a standard mobile connection. This target is contingent on Giphy API response times; a short-lived server-side cache for repeat search queries (same term, same pagination) is assumed as part of the implementation.
- **SC-003**: The Favorites and My GIFs sections load within 1 second of the picker being opened, regardless of the number of saved entries (up to a reasonable cap).
- **SC-004**: GIF upload completes within the same time envelope as an equivalent-size image upload via the existing shout media upload flow.
- **SC-005**: The GIF picker renders correctly and is fully operable on iOS 16+ Safari without layout breakage or non-functional controls.
- **SC-006**: Favoriting and un-favoriting actions feel instant — UI feedback is visible within 100 ms of user action, with server-side confirmation happening asynchronously.
- **SC-007**: Zero horizontal overflow or layout breakage occurs across viewport widths from 320 px (smallest supported mobile) to 1920 px (desktop).

## Assumptions

- Giphy is the designated GIF provider; API key configuration is an operational concern outside the scope of this specification. The system degrades gracefully to an error state if the provider is unavailable.
- The GIF picker is available wherever the existing emoji picker appears — both the shout composer and the comment composer.
- A GIF inserted into a post is treated as that post's media attachment and subject to the same single-media-per-post/comment rule as images. Inserting a GIF replaces a selected image; it cannot coexist with a YouTube embed.
- Unauthenticated (anonymous) users can browse and search GIFs but cannot save favorites or upload custom GIFs; these sections are either hidden or show a prompt to log in.
- Uploaded GIFs are stored using the same media infrastructure and subject to the same file-size cap (matching the shout media attachment limit) and access controls as existing shout media. No separate storage quota is introduced.
- Per-user cap is 500 GIF favorites and 100 uploaded personal GIFs. The 5× difference reflects that favorites are zero-storage references (hosted on Giphy's CDN) while uploads consume on-disk storage; the upload cap aligns with the existing single-media-per-post model where volume is bounded naturally.
- The "Reduce Motion" behavior applies to auto-animation in the picker grid only; once a GIF is inserted into a post and rendered in the feed, feed-level animation behavior follows the existing shout media rendering rules.
- Attribution requirements for Giphy (e.g., Giphy logo/branding in the picker) are assumed to be required per Giphy's API terms of service and must be included in the UI.
