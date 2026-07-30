# Feature Specification: Multi-Media Gallery Attachments

**Feature Branch**: `006-multi-media-gallery`

**Created**: 2026-07-25

**Last Amended**: 2026-07-30

**Status**: Draft

**Input**: User description: "Multi-media gallery attachments for shouts and comments: extend the current single-media-per-post/comment limit (a non-negotiable being deliberately superseded by this feature) to allow attaching up to 5 media items to a single shout or comment, images and GIFs freely mixed within the same gallery. Video is explicitly out of scope and keeps today's existing single-attachment path, untouched by this feature. Adding a 2nd file automatically converts the attachment into a gallery — there is no separate 'create gallery' action, it's an implicit resolve. Multi-upload works both via multi-select on the existing upload button and via multi-file drag-and-drop. In the feed/comment view, only the first item is shown as the preview, cropped/laid out to that first item's aspect ratio (Instagram-style uniform crop for any additional items in the same preview), with a Discord-style UI element indicating additional attached items exist — not an inline strip of all items. Clicking opens a fullscreen viewer with left/right navigation arrows fixed to the screen edges regardless of viewport size, letting the user cycle through the whole gallery; navigation loops (swiping past the last item wraps to the first, and vice versa). Applies identically to shouts and comments. Once a shout/comment is posted, its gallery contents are permanently fixed — there is no edit-time pathway to add, remove, or reorder attached media after publishing, consistent with the existing text-only edit behavior. Must reuse the exact same upload validation, size limits, rate limiting, and the existing per-user is_media_allowed restriction as today's single-media path, including the existing 24-hour post-upload compression job — all generalized from 1 item to N. Deliver as one feature branch/spec, but in 3 sequential stages, each deployed to production for real user testing before the next starts: Stage 1: basic multi-image upload (images only, no GIFs), append-only while composing — no reordering or removing individual items before submit (clearing/restarting the whole selection is the only way to change it); inline preview per the layout above; no fullscreen swipe yet. Stage 2: fullscreen swipeable/looping viewer to cycle through an attached gallery; composing is still append-only as in Stage 1. Stage 3: polish pass, enable GIFs in galleries (mixed image+GIF), and add the ability to reorder and remove individual items while composing, before submitting."

## Clarifications

### Session 2026-07-25

- Q: When a single multi-select or drag-and-drop action contains more files than the remaining capacity (e.g. 8 files against a 5-item limit), does the system attach what fits or reject the action? → A: Reject the entire action — nothing is attached, the existing pending selection is left untouched, and the limit is explained in Russian. Rationale: capacity is knowable from the file count *before* any upload begins, so there is no partial work to preserve, and this avoids needing a deterministic "first five" rule for drag-and-drop, where operating-system file ordering is not reliably predictable.
- Q: If one file within a batch fails (unsupported type, oversized, or a transient storage error), what happens to the rest of the batch? → A: Keep the successfully processed items attached and report which items failed and why. Rationale: unlike the over-limit case, failures here surface mid-flight after real work has been done on the other items; discarding good uploads because of one bad file is needless loss. This is deliberately the opposite resolution from the over-limit question above, and the two are not in conflict — the distinction is whether the problem is detectable up front (over-limit: yes, reject wholesale) or only during processing (partial failure: no, preserve what succeeded). *(Narrowed 2026-07-30 — see Session 2026-07-30: this now applies only to client-side pre-validation failures, since uploads no longer happen mid-selection. See FR-034, FR-041.)*
- Q: During Stages 1 and 2 — each of which runs in production for a period before mixed image+GIF galleries ship in Stage 3 — what happens when a user with images already attached opens the GIF picker? → A: Strict mutual exclusivity from the first image: the GIF picker is unavailable whenever **one or more** images are attached, and image attachment is unavailable whenever a GIF is attached. This is deliberately stricter than today's behavior, which permits a GIF to replace a single attached image; that replace pathway is withdrawn for the duration of Stages 1–2 and the gate is lifted entirely in Stage 3 when FR-026 takes effect.

### Session 2026-07-26 — Stage 1 preview redesign (post-deployment feedback)

Raised by the user after exercising the deployed Stage 1 build. **These decisions supersede the single-first-item preview agreed on 2026-07-25.**

The defect: FR-012 showed only the first item inline and the fullscreen viewer was deferred to Stage 2, so for the entire Stage 1 production period items 2..N were **unviewable by anyone**. Authors could publish them; no reader could open them. This was a flaw in the staging split, not in the implementation of it.

- Q: How should the Stage 1 inline grid lay out 2–5 images? → A: An adaptive grid in the Twitter/Facebook idiom, where the arrangement varies by item count within one fixed-height container: 2 = two equal halves side by side; 3 = one full-height tile left plus two stacked right; 4 = a 2×2; 5 = two tiles on the top row and three on the bottom. Rejected: uniform equal tiles (leaves a visible gap at 5), hero-plus-thumbnail-strip (consumes more feed height and preserves the very "one item is the real preview" framing being removed here), and a horizontally scrollable row (its gesture conflicts with vertical feed scrolling on mobile).
- Q: How tall should the grid be in shouts versus comments? → A: The grid honours the **same per-context maximum heights that single images already use** — 300px in shouts, 200px in comments — so galleries occupy no more feed space than existing single-image posts and comments stay visually secondary to their parent shout. This is FR-015 applied per context; hardcoding one height for both is exactly what produced the misplaced-badge/oversized-preview defect in the deployed build. Rejected: a single shared height (either crowds threads or cramps the feed) and granting galleries extra height over single images (galleries would visibly outweigh ordinary posts).
- Q: What shape should the grid container be, and how do tiles fill their cells? → A: The container takes the **first item's aspect ratio**, clamped to a sane range (approximately 1:2 to 2:1) so a single extreme portrait or panorama cannot dominate the feed; each tile crops to fill its cell. This carries the previously agreed Instagram-style "crop to the first photo's format" intent into the grid rather than discarding it. Rejected: a fixed container ratio regardless of content (predictable but drops that intent and heavily crops portrait sets) and letterboxing every tile whole (nothing hidden, but mixed orientations produce visible empty bands).
- Q: Does the "+N" badge survive the grid redesign? → A: No — it is **removed entirely** and FR-013 is deleted rather than rewritten. The cap is five items and the adaptive grid renders all five, so no overflow remains to indicate; keeping the badge would mean maintaining an affordance that can never fire. This also retires (rather than fixes) the badge-misplacement defect observed in the deployed Stage 1 build, where the badge anchored to the `<img>` element box instead of the visible image and used the shout height limit inside comments. Rejected: a small total-count pill (redundant when every tile is visible) and Facebook-style capping at four tiles with "+1" on the last (hides an image behind an extra click for no benefit at this cap).
- Q: In Stage 1, what happens when a reader clicks a grid tile? → A: The **existing single-image viewer** opens on exactly that item, unchanged — full size, with the zoom, pan, drag-to-dismiss and EXIF-orientation handling it already provides. There is deliberately no cycling between items in Stage 1: to view a different image the reader dismisses and clicks its tile. This makes every attached image fully viewable without building any new viewer, so Stage 1 stays small and Stage 2's job becomes precisely "add looping navigation to a viewer that is already open on the right item". Rejected: pulling Stage 2's swipeable viewer forward (would leave Stage 2 nearly empty and inflate Stage 1 beyond "basic multi-image upload"), a non-clickable grid (tiles are cropped, so parts of every image would stay permanently unseen — it would not solve the reported problem), and an arrows-but-no-swipe half-step (splits the viewer work across two stages and means editing the same component twice).

### Session 2026-07-25 — post-analysis corrections

Raised by `/speckit-analyze` against the completed plan and tasks, and resolved by the user.

- Q: FR-009 originally required that a restricted user's submission be rejected "including its text, with no partial save". But media is uploaded *before* the shout is created, so in practice every upload simply fails and the user remains able to publish text — the submission is never "rejected" as a unit. Which behavior is correct? → A: The architectural behavior is correct and FR-009's wording was wrong. FR-009 is reworded to describe upload-time rejection: no new media can ever be attached by a restricted user, and text-only publishing stays available. This matches how single-media already behaves today, so no new enforcement logic is introduced. The stricter reading would have required a create-route rule with no real enforcement value, since a client could simply omit any signal that an upload had failed. *(Superseded 2026-07-30 — see Session 2026-07-30: upload no longer precedes creation, so this reasoning no longer holds. FR-009 is reworded again.)*
- Q: FR-014 mandated uniform cropping of "any other item rendered within that same preview area", but FR-012 renders only the first item inline, leaving that clause without a referent. → A: The clause is vestigial, from the earlier multi-tile preview design. FR-014 is trimmed to the aspect-ratio rule that actually applies. See FR-014.
- Q: FR-013 says the indicator communicates "how many" without specifying whether the number is the total item count or the count of additional items. → A: It is the number of **additional** items — a 3-image gallery shows "+2". See FR-013.

### Session 2026-07-30 — Composer preview & upload-timing revision (post-Stage-1 production feedback)

Raised by the user after exercising the deployed Stage 1 build in production. Scope: the *composing* experience only (the pending-attachment preview shown before a shout/comment is submitted) and the timing of the upload itself. Nothing about published-gallery display (FR-012–FR-023) changes. Applies identically to the shout composer and the comment/reply composer (FR-031).

- Q: Stage 1 shipped composing as strictly append-only, with per-item removal explicitly deferred to Stage 3 (FR-024). Given production feedback that this is a real papercut, should per-item removal be pulled forward ahead of Stage 3? → A: Yes, per-item removal takes effect now. FR-024 is relocated out of the Stage 3 grouping into immediate effect. Reordering (FR-025) is explicitly **not** pulled forward and remains Stage 3 scope — this is a narrower pull-forward than "all of Stage 3's composing work," specifically because removal alone was the reported pain point and reordering has no equivalent complaint on record.
- Q: Should a pending (not-yet-uploaded) preview tile be clickable? → A: Yes — clicking a pending tile opens the same fullscreen viewer already used for published items (Lightbox), pointed at that item's local, not-yet-uploaded preview instead of a server-hosted URL. No inter-item cycling is required here (that remains Stage 2 scope for *published* galleries) — each pending tile opens independently on itself only.
- Q: How should the pending-preview area be sized and laid out? → A: One unified size for both composers — 80px max-height (half of the previously shipped 160px for shouts and 96px for comments) — inside its own container: a bordered box with a thin divider in the Discord idiom, arranged as a single horizontal row that scrolls horizontally rather than wrapping when more items are attached than fit in the visible width. The per-item remove (X) button keeps its existing visual size rather than shrinking with the smaller tiles, so it stays clearly tappable.
- Q: Should file upload continue to happen immediately on selection/drop (today's behavior), or move to submit-time? → A: Move to submit-time. A selected/dropped file is held client-side as a preview only; the network upload does not happen until the user submits the shout/comment. Rationale: this was reported as a real problem in two ways — perceived slowness/uncertainty during composing, and (per `plan.md`'s tech-debt note) every abandoned composer today orphans a `Media` row and a stored file, since upload-on-select uploads regardless of whether the user ever publishes. Deferring upload to submit-time eliminates that orphaning entirely, since no upload network call happens unless the user actually commits to submitting.
- Q: With upload and creation now happening together at submit-time, what happens if one file in the batch fails to upload? → A: The submission is atomic — if any file fails (a bad file that slipped past client-side pre-validation, a transient storage error, or the user's per-user media-posting permission having been revoked in the interim), nothing is posted: no shout, no comment, no partially-attached gallery. The user sees a clear, specific explanation of which file(s) failed and why; their composed text and every other pending item remain exactly as arranged in the composer; and a "Try again" action resubmits the same batch without requiring the user to re-attach anything. This is a deliberate return to a stricter atomicity than the pre-2026-07-30 architecture accepted, and it directly supersedes the 2026-07-25 post-analysis resolution of FR-009, which had reasoned that upload-before-creation made a true "reject as a unit" impossible. That reasoning no longer applies because upload no longer precedes creation as two independent steps — see FR-009 and FR-041.
- Q: Client-side pre-validation (file type, size) still happens instantly at selection, same as today. Does the partial-batch-success behavior from the 2026-07-25 Clarifications (FR-034) still apply? → A: Only to that pre-validation layer. A batch of dropped files can still yield some immediately-rejected files (wrong type, too large) alongside others that pass validation and become pending, exactly as today. What changes is what happens *after* that: since no network upload occurs until submit, there is no longer a "some uploaded, some didn't" mid-flight state to preserve — once files are pending, a submit-time failure is all-or-nothing (see above). FR-034 is narrowed accordingly.
- Q: If a submit fails and the user hits "Try again," does the retry re-attempt the whole batch or only the file(s) that failed? → A: The whole batch. Every pending file, including the ones that succeeded on the failed attempt, is still held client-side untouched, so retrying the complete batch costs nothing extra and keeps the atomicity model simple — there is no partially-uploaded state to reconcile against.

## Governance Note — Constitution Amendment Required

This feature **intentionally supersedes** a binding constraint in
`.specify/memory/constitution.md` → *Domain & Content Constraints* → **"Single
media per post/comment"**, which currently states that a shout or comment
carries one image OR one YouTube embed and that the backend enforces this.

Per the constitution's Governance section, this is not a plan-level deviation to
be logged in Complexity Tracking — it is a redefinition of a binding constraint
and therefore REQUIRES an amendment to the constitution (with a Sync Impact
Report and propagation to `CLAUDE.md` and `docs/*`, via the `/docs` skill). The
amendment MUST land before or alongside Stage 1 reaching production.

The mutual exclusivity between a **gallery** and a **YouTube embed** is retained
(see FR-027); only the "one image maximum" half of the constraint is relaxed.

The 2026-07-30 revision (composer preview + upload-timing) does not touch this
constraint further: the five-item cap, the gallery/YouTube exclusivity, and
publish-time immutability (FR-029) are all unaffected — it only changes when the
upload happens and what's possible while composing, before anything is published.

## Staged Delivery

This is a single feature specification delivered in three sequential stages. Each
stage is independently deployable and MUST reach production for real-user testing
before the next stage begins. The stages map one-to-one onto the three user
stories below.

| Stage | User Story | Scope summary |
|-------|------------|---------------|
| 1 | US1 (P1) | Multi-image attach (images only), adaptive inline grid showing every item, each tile opening the existing single-image viewer, no inter-item navigation. *(Revised 2026-07-30)* Composing is no longer append-only: individual pending items can be removed and clicked open in a fullscreen preview; upload is deferred to submit-time and submission is atomic. Reordering is still not available. |
| 2 | US2 (P2) | Looping navigation between items inside the viewer opened in Stage 1, for *published* galleries. Composing unchanged from Stage 1's (revised) behavior. |
| 3 | US3 (P3) | Reorder while composing, GIFs mixable into galleries, polish. *(Narrowed 2026-07-30 — per-item removal moved to Stage 1; this stage now covers reordering and GIF mixing only.)* |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach several images to one shout or comment (Priority: P1)

A user composing a shout or a comment wants to share more than one image at once —
for example several screenshots of the same event — instead of being forced to
pick a single image or split the thought across multiple posts. They add multiple
images in one go (by selecting several files at once from the upload button, or by
dragging a group of files onto the composer), see that all of them are attached,
can remove any one of them individually or preview any one of them full size before
deciding to publish, and publish. Readers of the resulting shout or comment see every
attached image laid out as a grid, and can open any one of them full size.

**Why this priority**: This is the core value of the feature and the minimum
viable slice — the ability to attach and publish more than one image. Without it,
nothing else in this feature has anything to operate on. It is independently
useful even before any fullscreen browsing exists, because readers can already
tell that a multi-image gallery is present.

**Independent Test**: Compose a shout with three images attached in a single
multi-select action, publish it, and confirm from another account that the shout
displays all three as a grid in the correct order, and that clicking any tile
opens that image full size.

**Acceptance Scenarios**:

1. **Given** a user is composing a shout, **When** they select three images at once via the upload button, **Then** all three are attached to the pending shout and the composer reflects that three items are attached.
2. **Given** a user is composing a comment, **When** they drag four image files onto the composer at once, **Then** all four are attached, identically to the multi-select path.
3. **Given** a user has one image attached, **When** they add a second image, **Then** the attachment becomes a gallery automatically, with no separate "create gallery" action required of the user.
4. **Given** a user has two images attached, **When** they attempt to add four more in one action (total six, exceeding the maximum of five), **Then** none of the four are attached, the two already-pending images remain attached and unchanged, and the limit is explained in Russian.
5. **Given** a published shout has a gallery of three images, **When** any reader views it in the feed, **Then** all three are displayed as an adaptive grid in attachment order.
6. **Given** a published shout has a gallery, **When** any reader views it, **Then** the grid is shaped by the first item's aspect ratio (clamped), and never causes the surrounding feed layout to shift or scroll horizontally.
12. **Given** a published gallery of four images, **When** a reader clicks the third tile, **Then** the existing single-image viewer opens on that third image at full size.
7. **Given** a user whose media-posting permission is revoked (feature 005), **When** they attempt to publish a shout or comment with newly uploaded images, **Then** the entire submission is rejected exactly as it is today for a single image, with the same Russian-language explanation and no partial save.
8. **Given** an existing shout or comment that was published with a single image before this feature, **When** any reader views it, **Then** it renders exactly as it did before, with no grid.
9. **Given** a user has attached one or more images, **When** they publish, **Then** each attached image is subject to the same file-type, file-size, and rate-limit rules that apply to a single-image attachment today.
10. **Given** a user drags a batch of four files in which one fails client-side pre-validation (wrong type or too large), **When** the batch is processed, **Then** the three valid images become pending and the invalid one is reported individually with the reason it failed.
11. **Given** a user has at least one image attached during Stage 1 or Stage 2, **When** they look for the GIF picker, **Then** it is unavailable; and conversely, **Given** a GIF is attached, **When** they look to add an image, **Then** image attachment is unavailable.
13. **Given** a user is composing with four pending items, **When** they activate the remove control on the second one, **Then** only that item is removed and the other three remain attached in their existing relative order — without affecting or re-uploading anything, since nothing has been uploaded yet. *(Added 2026-07-30.)*
14. **Given** a user is composing with pending items attached, **When** they click one of the pending preview tiles, **Then** the existing fullscreen viewer opens on that item's local preview, with the same zoom/pan/dismiss behavior as a published item. *(Added 2026-07-30.)*
15. **Given** a user has several items pending and clicks submit, **When** every file uploads successfully, **Then** the shout or comment is created carrying all of them, in their existing order. *(Added 2026-07-30.)*
16. **Given** a user has several items pending and clicks submit, **When** one file fails to upload (bad file, transient error, or a permission revoked in that instant), **Then** nothing is posted, the user sees a clear explanation naming the failing file(s) and why, every pending item and all composed text remain exactly as they were, and a "Try again" action resubmits the whole batch without requiring re-attachment. *(Added 2026-07-30.)*

---

### User Story 2 - Browse an attached gallery in fullscreen (Priority: P2)

A reader viewing one image of a gallery full size (Stage 1 already opens it)
wants to move through the whole set without dismissing the viewer and returning
to the feed between images.

**Why this priority**: Stage 1 already makes every image viewable — the grid shows
them all and any tile opens full size — so this story is a fluency improvement
rather than a gap-filler. It removes the dismiss-and-reopen round trip when
browsing several images in sequence. Deliberately second because publishing and
basic viewing must be proven in production first.

**Independent Test**: Open a published shout containing a gallery of four images,
click the preview, and confirm the fullscreen viewer opens and that all four
images can be reached by repeated forward navigation, including wrapping from the
last back to the first.

**Acceptance Scenarios**:

1. **Given** a shout with a gallery of four images, **When** a reader clicks the third tile, **Then** the fullscreen viewer opens on the third item and inter-item navigation is available.
2. **Given** the fullscreen viewer is open, **When** the reader navigates forward, **Then** the next item in the gallery is displayed.
3. **Given** the fullscreen viewer is showing the last item, **When** the reader navigates forward, **Then** the viewer wraps around to the first item.
4. **Given** the fullscreen viewer is showing the first item, **When** the reader navigates backward, **Then** the viewer wraps around to the last item.
5. **Given** the fullscreen viewer is open on any screen size, **When** the reader looks for navigation controls, **Then** forward and backward controls are present and anchored to the left and right edges of the screen, regardless of viewport dimensions or the displayed item's aspect ratio.
6. **Given** the fullscreen viewer is open, **When** the reader views any item, **Then** the item is shown in its entirety without cropping, and the reader can tell which position in the gallery is currently displayed and how many items there are in total.
7. **Given** a comment with a gallery, **When** a reader opens its fullscreen viewer, **Then** the behavior is identical to a shout's gallery in every respect.
8. **Given** a shout or comment with exactly one attached image, **When** a reader opens it fullscreen, **Then** no navigation between items is offered, since there is nothing to navigate to.
9. **Given** the fullscreen viewer is open, **When** the reader dismisses it, **Then** they return to their previous position in the feed without losing scroll position.

---

### User Story 3 - Reorder a pending gallery and mix in GIFs (Priority: P3)

*(Retitled 2026-07-30 — previously "Curate the gallery before posting, and mix in GIFs"; per-item removal moved to User Story 1, so this story now covers only reordering and GIF mixing.)*

A user assembling a gallery realizes the images are in the wrong order, and wants
to fix that without discarding everything and starting over. Separately, they want
to combine GIFs and static images in a single gallery.

**Why this priority**: This is refinement of an already-working flow. A
mis-ordered selection is recoverable by clearing and re-adding, which is clumsy
but not blocking, and (since 2026-07-30) individual removal is already available
from Stage 1 — only reordering remains a rough edge. GIF support broadens the
feature but is not required to prove its core value.

**Independent Test**: While composing, attach four images, move the last one to
the front, add a GIF, publish, and confirm the published gallery contains exactly
the four intended items in the intended order.

**Acceptance Scenarios**:

1. **Given** a user is composing with several items attached, **When** they reorder the items, **Then** the new order is reflected in the composer and is the order readers will see after publishing.
2. **Given** a user is composing with images attached, **When** they add a GIF, **Then** the GIF is attached alongside the images in the same gallery.
3. **Given** a user is composing with a GIF attached, **When** they add a static image, **Then** both are attached in the same gallery — order of addition does not restrict which types may be combined.
4. **Given** a gallery mixing GIFs and static images is published, **When** a reader browses it fullscreen, **Then** each item plays or displays according to its own type, with navigation behaving identically regardless of the mix.
5. **Given** a user's media-posting permission is revoked, **When** they attempt to add a newly uploaded GIF to a gallery, **Then** it is rejected on the same terms as a newly uploaded image, while re-using an already-stored GIF remains permitted exactly as specified in feature 005.
6. **Given** a user has reordered a pending gallery, **When** they publish, **Then** the first item in their chosen order becomes the preview image shown in the feed.

---

### Edge Cases

- **A user selects more files than the limit allows in one action.** The entire action is rejected — nothing from it is attached and any previously pending selection is left untouched — with a Russian explanation of the limit (FR-033).
- **Some files in a batch fail client-side pre-validation** (unsupported type or too large). The successfully-validated items become pending; the failed ones are reported individually with the reason for each (FR-034). *(Revised 2026-07-30 — this now applies only to selection-time client validation; see next edge case for submit-time failures.)*
- **A submit's upload of one or more pending files fails** (a file that slipped past client validation, a transient storage error, or a permission revoked in that instant). Nothing is posted — no shout, no comment, no partial gallery. All pending items and composed text remain intact, the specific failure is explained clearly, and a "Try again" action resubmits the entire batch. *(Added 2026-07-30 — see FR-041.)*
- **A user removes a pending item while composing.** Only that item is removed; since nothing has been uploaded yet at that point, no server-side deletion is needed — it simply stops being part of the client-held pending set. *(Added 2026-07-30 — see FR-024.)*
- **A user attaches images and then a GIF during Stages 1–2**, before mixed galleries are enabled. The GIF picker is unavailable while any image is attached, and image attachment is unavailable while a GIF is attached (FR-035). This gate is removed in Stage 3.
- **A gallery's first item is extremely tall or extremely wide.** The preview area is shaped by the first item's aspect ratio, but must remain bounded by the same maximum preview dimensions that constrain a single-image preview today, so one unusual image cannot dominate the feed.
- **A user attempts to attach a video to a gallery.** Video is out of scope; it remains on today's single-attachment path and cannot be combined with a gallery.
- **A user attempts to combine a gallery with a YouTube embed.** Not permitted — the existing mutual exclusivity between an image attachment and a YouTube embed is preserved for galleries (FR-027).
- **A shout or comment carries a spoiler/NSFW visibility tag with a gallery attached.** The tag applies to the gallery as a whole, not to individual items — every item is concealed until the reader reveals it, and revealing applies to the whole gallery.
- **The 24-hour post-upload compression runs on a gallery.** Every item in the gallery is compressed on the same schedule and terms as a single attachment, independently of the others, starting from its (now submit-time) upload.
- **A user publishes with zero attached items.** Unchanged from today — a shout or comment still requires either text or media.
- **A reader on a narrow mobile viewport opens a gallery fullscreen.** Navigation controls remain anchored to the screen edges and reachable; they are never pushed off-screen or overlapped by the displayed item.
- **An author is soft-deleted or banned after publishing a gallery.** Unchanged from today — existing soft-delete behavior governs visibility of the whole shout or comment, including its gallery.

## Requirements *(mandatory)*

### Functional Requirements

#### Attaching and limits

- **FR-001**: System MUST allow up to five media items to be attached to a single shout or a single comment.
- **FR-002**: System MUST enforce the five-item maximum at the server, independently of any client-side gating, for both shouts and comments.
- **FR-003**: System MUST treat the addition of a second item as an implicit conversion to a gallery — users MUST NOT be required to invoke any separate "create gallery" action.
- **FR-004**: Users MUST be able to attach multiple items in a single action by selecting multiple files from the existing upload control.
- **FR-005**: Users MUST be able to attach multiple items in a single action by dragging a group of files onto the composer.
- **FR-006**: System MUST preserve a stable, explicit order for the items in a gallery, and MUST present that same order to every reader.
- **FR-007**: System MUST apply the same file-type and file-size validation rules to each item in a gallery that it applies to a single attached item today.
- **FR-008**: System MUST apply the existing upload rate limiting to gallery attachments, in both authenticated and unauthenticated states, on the same terms as today's single-item path.
- **FR-009**: System MUST apply the existing per-user media-posting permission (feature 005) to gallery attachments: a restricted user MUST be rejected with the existing Russian-language explanation, and no item may be attached as a result. *(Reworded 2026-07-30 — supersedes the 2026-07-25 wording.)* Because upload is now deferred to submit-time and submission is atomic (FR-041), this rejection is no longer scoped to "upload only" — a restricted user's **entire submission, including its text**, is rejected as a unit when it carries a newly uploaded item, exactly matching the atomicity described in FR-041. Their text-only publishing (with no new upload attempted) remains available and unaffected, exactly as it is today for single media.
- **FR-010**: System MUST apply the existing 24-hour post-upload compression to every item in a gallery, on the same schedule and terms as a single attachment.
- **FR-011**: System MUST present all limit, validation, and rejection messages in Russian, with correct declensions and pluralization for the item counts involved.
- **FR-033**: When a single attach action (multi-select or drag-and-drop) contains more files than the remaining capacity allows, System MUST reject that action in its entirety — attaching none of its files, leaving any existing pending selection unchanged — and MUST explain the limit in Russian.
- **FR-034**: When some files within an attach action fail client-side pre-validation (unsupported type or oversized) at selection/drop time, System MUST reject only the failing files individually — reporting the reason for each — while accepting the rest as pending. *(Narrowed 2026-07-30 — this no longer covers upload-transfer failures, since no upload transfer happens until submit; see FR-041 for submit-time failure handling, which is atomic rather than partial.)*

#### Display

- **FR-012**: System MUST display **every** item of a gallery inline, as an adaptive grid whose arrangement varies by item count: 2 = two equal halves side by side; 3 = one full-height tile left plus two stacked right; 4 = a 2×2; 5 = two tiles on the top row and three on the bottom. *(Revised 2026-07-26 — supersedes the earlier first-item-only preview, which left items 2..N unviewable for the whole of Stage 1.)*
- **FR-013**: *Removed 2026-07-26.* Previously required a "+N" indicator for additional items. The grid renders all items up to the five-item cap, so no overflow indicator can ever apply.
- **FR-014**: System MUST shape the grid container according to the first item's aspect ratio, clamped to approximately 1:2–2:1 so no single item can dominate the feed, and MUST crop each tile to fill its cell.
- **FR-015**: System MUST bound the grid by the same maximum display height that constrains a single-item preview in the same context — 300px in shouts, 200px in comments — so that no gallery causes horizontal scrolling or layout shift in the feed.
- **FR-036**: Users MUST be able to open any individual gallery item at full size by activating its tile, in Stage 1, using the existing single-image viewer with its zoom, pan and dismiss behaviour. Inter-item navigation from within that viewer is NOT required in Stage 1 (see FR-017–FR-023, Stage 2).
- **FR-016**: System MUST render shouts and comments that carry exactly one attached item exactly as they render today, with no gallery indicator.

#### Fullscreen viewing (published galleries)

- **FR-017**: Users MUST be able to open a fullscreen viewer for a gallery by activating its inline preview.
- **FR-018**: System MUST provide forward and backward navigation controls in the fullscreen viewer, anchored to the left and right edges of the screen, present and usable at every viewport size and for every displayed item's aspect ratio.
- **FR-019**: System MUST loop navigation in both directions — advancing past the last item returns to the first, and going back from the first item returns to the last.
- **FR-020**: System MUST display each item in the fullscreen viewer in its entirety, without cropping.
- **FR-021**: System MUST indicate, in the fullscreen viewer, which position in the gallery is currently shown and how many items the gallery contains.
- **FR-022**: System MUST NOT offer inter-item navigation when a gallery contains only one item.
- **FR-023**: System MUST return the reader to their prior scroll position when the fullscreen viewer is dismissed.

#### Composing (pending preview) — effective immediately

*(Section retitled and regrouped 2026-07-30. FR-024 is relocated here from the former "Composing (Stage 3)" grouping, taking effect now rather than in Stage 3. FR-037–FR-041 are new.)*

- **FR-024**: Users MUST be able to remove an individual pending item while composing, without affecting the other pending items. *(No longer Stage 3-gated as of 2026-07-30 — see Clarifications.)*
- **FR-037**: Users MUST be able to activate any individual pending item to open it in the existing fullscreen viewer, showing that item's local preview, with the same zoom/pan/dismiss behavior available for published items. Inter-item navigation is not required here.
- **FR-038**: System MUST present pending items in their own bounded container, visually distinct from the composer's text input, styled with a thin divider, laid out as a single horizontal row.
- **FR-039**: When pending items exceed the width available to display them, the pending-item container MUST scroll horizontally rather than wrapping to additional rows.
- **FR-040**: System MUST render every pending item preview inside a uniform 80×80 square box, identical in size and ratio for every item and across both the shout and comment/reply composers, regardless of any individual item's own aspect ratio. An item thinner or shorter than the box MUST be letterboxed — shown whole, uncropped and unstretched — with the surrounding gap filled by the page's own darkest background token (`th-page`), not cropped to fill the box. *(Revised 2026-07-30, same-day follow-up — supersedes the initial "80px max-height, natural width" rendering, which produced differently-sized boxes per item's own ratio.)* The per-item remove control's own size MUST NOT be reduced to match.
- **FR-041**: System MUST defer the upload of any newly selected file until the user submits the shout or comment — a file that has only been selected or dropped MUST NOT be transmitted to the server until submission is initiated. At submission, System MUST upload every pending new file and create the shout/comment as a single atomic outcome: if every upload succeeds, the shout/comment is created carrying all of them; if any upload fails for any reason, none of the batch is attached and no shout/comment is created. On failure, System MUST report which file(s) failed and why, MUST preserve all composed text and every pending item unchanged for the user, and MUST offer a retry action that resubmits the complete pending batch without requiring re-attachment.

#### Composing (Stage 3 — reordering and GIF mixing)

*(Narrowed 2026-07-30 — this grouping previously also covered per-item removal, now in effect immediately; see FR-024 above.)*

- **FR-025**: Users MUST be able to reorder pending items while composing, and the resulting order MUST be the order readers see, with the first item becoming the inline preview.

#### Scope boundaries and immutability

- **FR-026**: System MUST allow static images and GIFs to be combined freely within one gallery, in any order and any proportion, up to the five-item maximum. *(Takes effect in Stage 3; superseded during Stages 1–2 by FR-035.)*
- **FR-035**: During Stages 1 and 2 only, System MUST enforce strict mutual exclusivity between images and GIFs: the GIF picker MUST be unavailable whenever one or more images are attached, and image attachment MUST be unavailable whenever a GIF is attached. This withdraws today's ability to replace a single attached image with a GIF for the duration of those two stages. This requirement expires when FR-026 takes effect in Stage 3.
- **FR-027**: System MUST NOT allow a gallery to be combined with a YouTube embed — the existing mutual exclusivity between an image attachment and a YouTube embed is preserved.
- **FR-028**: System MUST exclude video from galleries; video remains on the existing single-attachment path, unchanged by this feature.
- **FR-029**: System MUST treat a published gallery as immutable — there MUST be no pathway to add, remove, or reorder a gallery's items after publishing, consistent with today's text-only edit behavior. *(Unaffected by the 2026-07-30 revision: FR-024's pulled-forward removal applies only to pending, unpublished items — never to a published gallery.)*
- **FR-030**: System MUST apply a spoiler/NSFW visibility tag to a gallery as a whole rather than to individual items, and MUST preserve the existing rule that such a tag is only meaningful when media is attached.
- **FR-031**: System MUST behave identically for shouts and comments across every requirement in this specification.
- **FR-032**: System MUST continue to render all pre-existing single-media content correctly, with no migration-driven change to how it appears.

### Key Entities

- **Gallery**: An ordered collection of one to five media items attached to a single shout or comment. Has a defined first item, which serves as the inline preview. Immutable once published. A gallery of exactly one item is indistinguishable, to a reader, from today's single attachment.
- **Media item**: An individual image or GIF within a gallery, carrying its own type, dimensions, and stored file. Subject individually to the same validation, size limits, and 24-hour compression as a single attachment today. Its position within its gallery is meaningful and stable.
- **Attachment order**: The stable sequence of items within a gallery, established at compose time, determining both which item is the preview and the order of fullscreen navigation.
- **Pending item**: *(Added 2026-07-30.)* A file selected or dropped into the composer but not yet uploaded — exists only client-side, as a locally-held preview, until a successful submit persists it as a Media item. Individually removable and individually viewable in a fullscreen preview before it is ever uploaded. Has no server-side existence and therefore nothing to clean up if the user abandons composing without submitting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can attach five images to a shout in a single action and publish it, without performing any gallery-creation step beyond selecting the files.
- **SC-002**: 100% of attempts to attach more than five items to one shout or comment are prevented, including attempts made outside the standard composer interface.
- **SC-003**: Readers viewing a gallery in the feed see every attached item without opening anything, in 100% of galleries, and can open any individual item full size in one click.
- **SC-004**: A reader can reach every item of a five-item gallery using only the fullscreen navigation controls, from any starting item, in both directions.
- **SC-005**: Fullscreen navigation controls are reachable and usable across the full range of supported viewport sizes, including the narrowest supported mobile width.
- **SC-006**: 100% of pre-existing single-media shouts and comments render identically before and after each stage's deployment, with zero reported regressions.
- **SC-007**: Restricted users (per feature 005) are blocked from uploading new gallery items in 100% of attempts, with zero false-positive blocks on re-used already-stored media.
- **SC-008**: Every item in a published gallery is compressed within the same 24-hour window that applies to single attachments today, with no item skipped.
- **SC-009**: Each of the three stages reaches production and is exercised by real users before the following stage's implementation begins.
- **SC-010**: Introducing galleries causes no horizontal scrolling or layout shift in the feed at any supported viewport size.
- **SC-011**: *(Added 2026-07-30.)* 100% of submits with at least one failing upload result in no shout/comment being created, with the user's composed text and every pending item left intact and a retry available — zero partial-gallery posts are ever created.
- **SC-012**: *(Added 2026-07-30.)* 100% of abandoned composer sessions (user never submits) result in zero server-side uploaded files or Media rows, since no upload occurs until submission is initiated.

## Assumptions

- **Existing content is a one-item gallery.** Pre-existing single-media shouts and comments are treated as galleries of one, so no separate legacy display path is needed and no user-visible change occurs for them.
- **The five-item limit is uniform.** It applies identically to shouts and comments, and counts all gallery item types together rather than allowing five of each type.
- **Size limits are per item.** Each attached item is validated against the same per-file size limit that applies to a single attachment today; this specification does not introduce an additional aggregate cap across a gallery.
- **Composing gained per-item removal ahead of Stage 3 (2026-07-30).** Reordering remains the only composing action still deferred to Stage 3. *(Revises the prior "append-only in Stages 1 and 2" assumption, which no longer holds for removal.)*
- **Uploads are deferred to submit-time and a submit is atomic (2026-07-30).** No file is transmitted to the server until the user submits; a submit either uploads and attaches every pending file and creates the shout/comment, or none of it happens and the user can retry. See FR-041.
- **A retry resubmits the whole pending batch, not just previously-failed files (2026-07-30).** Since every pending file is still held client-side regardless of a failed submit's outcome, there is no cheaper partial-retry to offer, and re-sending everything keeps the atomicity model simple.
- **Stages 1–2 are a temporary regression for GIF users.** FR-035 withdraws today's ability to swap a single attached image for a GIF. This is a deliberate, time-boxed cost accepted to keep the interim states simple, and it ends when Stage 3 ships.
- **Fullscreen items are shown uncropped.** Cropping applies only to inline grid tiles; the fullscreen viewer always shows each item complete, letterboxed as needed.
- **Reader-side navigation is input-agnostic.** The specification requires edge-anchored forward/backward controls; supporting additional input methods (keyboard, touch swipe) is a natural extension and is expected, but the edge controls are the guaranteed baseline on every device.
- **No change to notification, feed-ranking, or search behavior.** Galleries do not alter how shouts and comments are notified, ordered, or searched.
- **Avatar and profile media are out of scope**, consistent with feature 005's boundary.
- **Deployment cadence is a hard sequencing constraint**, not a preference: Stage N+1's implementation does not begin until Stage N is live in production and has been exercised by real users.

## Dependencies

- **Feature 005 (per-user media posting restriction)** — its permission check must be generalized from a single upload to N uploads per submission without changing its semantics, and (as of 2026-07-30) must be checkable at atomic submit-time rather than at independent upload-time.
- **The existing 24-hour post-upload compression job** — must operate per item across a gallery, timed from each item's (now submit-time) upload.
- **The constitution amendment described in the Governance Note above** — must land before or alongside Stage 1's production deployment.
