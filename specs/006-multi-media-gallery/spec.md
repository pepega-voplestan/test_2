# Feature Specification: Multi-Media Gallery Attachments

**Feature Branch**: `006-multi-media-gallery`

**Created**: 2026-07-25

**Last Amended**: 2026-07-31

**Status**: Draft

**Input**: User description: "Multi-media gallery attachments for shouts and comments: extend the current single-media-per-post/comment limit (a non-negotiable being deliberately superseded by this feature) to allow attaching up to 5 media items to a single shout or comment, images and GIFs freely mixed within the same gallery. Video is explicitly out of scope and keeps today's existing single-attachment path, untouched by this feature. Adding a 2nd file automatically converts the attachment into a gallery — there is no separate 'create gallery' action, it's an implicit resolve. Multi-upload works both via multi-select on the existing upload button and via multi-file drag-and-drop. In the feed/comment view, only the first item is shown as the preview, cropped/laid out to that first item's aspect ratio (Instagram-style uniform crop for any additional items in the same preview), with a Discord-style UI element indicating additional attached items exist — not an inline strip of all items. Clicking opens a fullscreen viewer with left/right navigation arrows fixed to the screen edges regardless of viewport size, letting the user cycle through the whole gallery; navigation loops (swiping past the last item wraps to the first, and vice versa). Applies identically to shouts and comments. Once a shout/comment is posted, its gallery contents are permanently fixed — there is no edit-time pathway to add, remove, or reorder attached media after publishing, consistent with the existing text-only edit behavior. Must reuse the exact same upload validation, size limits, rate limiting, and the existing per-user is_media_allowed restriction as today's single-media path, including the existing 24-hour post-upload compression job — all generalized from 1 item to N. Deliver as one feature branch/spec, but in 3 sequential stages, each deployed to production for real user testing before the next starts: Stage 1: basic multi-image upload (images only, no GIFs), append-only while composing — no reordering or removing individual items before submit (clearing/restarting the whole selection is the only way to change it); inline preview per the layout above; no fullscreen swipe yet. Stage 2: fullscreen swipeable/looping viewer to cycle through an attached gallery; composing is still append-only as in Stage 1. Stage 3: polish pass, enable GIFs in galleries (mixed image+GIF), and add the ability to reorder and remove individual items while composing, before submitting."

## Clarifications

### Session 2026-07-25

- Q: When a single multi-select or drag-and-drop action contains more files than the remaining capacity (e.g. 8 files against a 5-item limit), does the system attach what fits or reject the action? → A: Reject the entire action — nothing is attached, the existing pending selection is left untouched, and the limit is explained in Russian. Rationale: capacity is knowable from the file count *before* any upload begins, so there is no partial work to preserve, and this avoids needing a deterministic "first five" rule for drag-and-drop, where operating-system file ordering is not reliably predictable.
- Q: If one file within a batch fails (unsupported type, oversized, or a transient storage error), what happens to the rest of the batch? → A: Keep the successfully processed items attached and report which items failed and why. Rationale: unlike the over-limit case, failures here surface mid-flight after real work has been done on the other items; discarding good uploads because of one bad file is needless loss. This is deliberately the opposite resolution from the over-limit question above, and the two are not in conflict — the distinction is whether the problem is detectable up front (over-limit: yes, reject wholesale) or only during processing (partial failure: no, preserve what succeeded). *(Narrowed 2026-07-30 — see Session 2026-07-30: this now applies only to client-side pre-validation failures, since uploads no longer happen mid-selection. See FR-034, FR-041.)*
- Q: During Stages 1 and 2 — each of which runs in production for a period before mixed image+GIF galleries ship in Stage 3 — what happens when a user with images already attached opens the GIF picker? → A: Strict mutual exclusivity from the first image: the GIF picker is unavailable whenever **one or more** images are attached, and image attachment is unavailable whenever a GIF is attached. This is deliberately stricter than today's behavior, which permits a GIF to replace a single attached image; that replace pathway is withdrawn for the duration of Stages 1–2 and the gate is lifted entirely in Stage 3 when FR-026 takes effect. *(Superseded 2026-07-31 — see Session 2026-07-31: FR-026 is reversed permanently, so this gate never lifts. See FR-035.)*

### Session 2026-07-26 — Stage 1 preview redesign (post-deployment feedback)

Raised by the user after exercising the deployed Stage 1 build. **These decisions supersede the single-first-item preview agreed on 2026-07-25.**

The defect: FR-012 showed only the first item inline and the fullscreen viewer was deferred to Stage 2, so for the entire Stage 1 production period items 2..N were **unviewable by anyone**. Authors could publish them; no reader could open them. This was a flaw in the staging split, not in the implementation of it.

- Q: How should the Stage 1 inline grid lay out 2–5 images? → A: An adaptive grid in the Twitter/Facebook idiom, where the arrangement varies by item count within one fixed-height container: 2 = two equal halves side by side; 3 = one full-height tile left plus two stacked right; 4 = a 2×2; 5 = two tiles on the top row and three on the bottom. Rejected: uniform equal tiles (leaves a visible gap at 5), hero-plus-thumbnail-strip (consumes more feed height and preserves the very "one item is the real preview" framing being removed here), and a horizontally scrollable row (its gesture conflicts with vertical feed scrolling on mobile). *(Superseded 2026-07-31 — see Session 2026-07-31: the adaptive grid is retired entirely in favor of a single-item carousel. See FR-012.)*
- Q: How tall should the grid be in shouts versus comments? → A: The grid honours the **same per-context maximum heights that single images already use** — 300px in shouts, 200px in comments — so galleries occupy no more feed space than existing single-image posts and comments stay visually secondary to their parent shout. This is FR-015 applied per context; hardcoding one height for both is exactly what produced the misplaced-badge/oversized-preview defect in the deployed build. Rejected: a single shared height (either crowds threads or cramps the feed) and granting galleries extra height over single images (galleries would visibly outweigh ordinary posts). *(The per-context max-height numbers carry forward unchanged into the 2026-07-31 carousel frame — see FR-015.)*
- Q: What shape should the grid container be, and how do tiles fill their cells? → A: The container takes the **first item's aspect ratio**, clamped to a sane range (approximately 1:2 to 2:1) so a single extreme portrait or panorama cannot dominate the feed; each tile crops to fill its cell. This carries the previously agreed Instagram-style "crop to the first photo's format" intent into the grid rather than discarding it. Rejected: a fixed container ratio regardless of content (predictable but drops that intent and heavily crops portrait sets) and letterboxing every tile whole (nothing hidden, but mixed orientations produce visible empty bands). *(Superseded 2026-07-31 — see Session 2026-07-31: the frame is now a FIXED 1:1 square regardless of content, with letterboxing — the exact alternative rejected here, now adopted deliberately for consistency with the composer's pending-preview tiles. See FR-014.)*
- Q: Does the "+N" badge survive the grid redesign? → A: No — it is **removed entirely** and FR-013 is deleted rather than rewritten. The cap is five items and the adaptive grid renders all five, so no overflow remains to indicate; keeping the badge would mean maintaining an affordance that can never fire. This also retires (rather than fixes) the badge-misplacement defect observed in the deployed Stage 1 build, where the badge anchored to the `<img>` element box instead of the visible image and used the shout height limit inside comments. Rejected: a small total-count pill (redundant when every tile is visible) and Facebook-style capping at four tiles with "+1" on the last (hides an image behind an extra click for no benefit at this cap).
- Q: In Stage 1, what happens when a reader clicks a grid tile? → A: The **existing single-image viewer** opens on exactly that item, unchanged — full size, with the zoom, pan, drag-to-dismiss and EXIF-orientation handling it already provides. There is deliberately no cycling between items in Stage 1: to view a different image the reader dismisses and clicks its tile. This makes every attached image fully viewable without building any new viewer, so Stage 1 stays small and Stage 2's job becomes precisely "add looping navigation to a viewer that is already open on the right item". Rejected: pulling Stage 2's swipeable viewer forward (would leave Stage 2 nearly empty and inflate Stage 1 beyond "basic multi-image upload"), a non-clickable grid (tiles are cropped, so parts of every image would stay permanently unseen — it would not solve the reported problem), and an arrows-but-no-swipe half-step (splits the viewer work across two stages and means editing the same component twice). *(Superseded 2026-07-31 — Stage 2 is dropped; looping now lives inline. See FR-036, FR-042–FR-044.)*

### Session 2026-07-25 — post-analysis corrections

Raised by `/speckit-analyze` against the completed plan and tasks, and resolved by the user.

- Q: FR-009 originally required that a restricted user's submission be rejected "including its text, with no partial save". But media is uploaded *before* the shout is created, so in practice every upload simply fails and the user remains able to publish text — the submission is never "rejected" as a unit. Which behavior is correct? → A: The architectural behavior is correct and FR-009's wording was wrong. FR-009 is reworded to describe upload-time rejection: no new media can ever be attached by a restricted user, and text-only publishing stays available. This matches how single-media already behaves today, so no new enforcement logic is introduced. The stricter reading would have required a create-route rule with no real enforcement value, since a client could simply omit any signal that an upload had failed. *(Superseded 2026-07-30 — see Session 2026-07-30: upload no longer precedes creation, so this reasoning no longer holds. FR-009 is reworded again.)*
- Q: FR-014 mandated uniform cropping of "any other item rendered within that same preview area", but FR-012 renders only the first item inline, leaving that clause without a referent. → A: The clause is vestigial, from the earlier multi-tile preview design. FR-014 is trimmed to the aspect-ratio rule that actually applies. See FR-014. *(FR-014 is rewritten again 2026-07-31 — see below.)*
- Q: FR-013 says the indicator communicates "how many" without specifying whether the number is the total item count or the count of additional items. → A: It is the number of **additional** items — a 3-image gallery shows "+2". See FR-013.

### Session 2026-07-30 — Composer preview & upload-timing revision (post-Stage-1 production feedback)

Raised by the user after exercising the deployed Stage 1 build in production. Scope: the *composing* experience only (the pending-attachment preview shown before a shout/comment is submitted) and the timing of the upload itself. Nothing about published-gallery display (FR-012–FR-023) changes. Applies identically to the shout composer and the comment/reply composer (FR-031).

- Q: Stage 1 shipped composing as strictly append-only, with per-item removal explicitly deferred to Stage 3 (FR-024). Given production feedback that this is a real papercut, should per-item removal be pulled forward ahead of Stage 3? → A: Yes, per-item removal takes effect now. FR-024 is relocated out of the Stage 3 grouping into immediate effect. Reordering (FR-025) is explicitly **not** pulled forward and remains Stage 3 scope — this is a narrower pull-forward than "all of Stage 3's composing work," specifically because removal alone was the reported pain point and reordering has no equivalent complaint on record.
- Q: Should a pending (not-yet-uploaded) preview tile be clickable? → A: Yes — clicking a pending tile opens the same fullscreen viewer already used for published items (Lightbox), pointed at that item's local, not-yet-uploaded preview instead of a server-hosted URL. No inter-item cycling is required here (that remains Stage 2 scope for *published* galleries) — each pending tile opens independently on itself only. *(Stage 2 is dropped 2026-07-31 — this remains accurate for pending items regardless: no inter-item cycling in the pending-preview click, full stop.)*
- Q: How should the pending-preview area be sized and laid out? → A: One unified size for both composers — 80px max-height (half of the previously shipped 160px for shouts and 96px for comments) — inside its own container: a bordered box with a thin divider in the Discord idiom, arranged as a single horizontal row that scrolls horizontally rather than wrapping when more items are attached than fit in the visible width. The per-item remove (X) button keeps its existing visual size rather than shrinking with the smaller tiles, so it stays clearly tappable. *(Refined further same-day and again 2026-07-31 — see the 80×80 fixed-square/letterbox revision to FR-040, and its extension to published galleries via FR-014.)*
- Q: Should file upload continue to happen immediately on selection/drop (today's behavior), or move to submit-time? → A: Move to submit-time. A selected/dropped file is held client-side as a preview only; the network upload does not happen until the user submits the shout/comment. Rationale: this was reported as a real problem in two ways — perceived slowness/uncertainty during composing, and (per `plan.md`'s tech-debt note) every abandoned composer today orphans a `Media` row and a stored file, since upload-on-select uploads regardless of whether the user ever publishes. Deferring upload to submit-time eliminates that orphaning entirely, since no upload network call happens unless the user actually commits to submitting.
- Q: With upload and creation now happening together at submit-time, what happens if one file in the batch fails to upload? → A: The submission is atomic — if any file fails (a bad file that slipped past client-side pre-validation, a transient storage error, or the user's per-user media-posting permission having been revoked in the interim), nothing is posted: no shout, no comment, no partially-attached gallery. The user sees a clear, specific explanation of which file(s) failed and why; their composed text and every other pending item remain exactly as arranged in the composer; and a "Try again" action resubmits the same batch without requiring the user to re-attach anything. This is a deliberate return to a stricter atomicity than the pre-2026-07-30 architecture accepted, and it directly supersedes the 2026-07-25 post-analysis resolution of FR-009, which had reasoned that upload-before-creation made a true "reject as a unit" impossible. That reasoning no longer applies because upload no longer precedes creation as two independent steps — see FR-009 and FR-041.
- Q: Client-side pre-validation (file type, size) still happens instantly at selection, same as today. Does the partial-batch-success behavior from the 2026-07-25 Clarifications (FR-034) still apply? → A: Only to that pre-validation layer. A batch of dropped files can still yield some immediately-rejected files (wrong type, too large) alongside others that pass validation and become pending, exactly as today. What changes is what happens *after* that: since no network upload occurs until submit, there is no longer a "some uploaded, some didn't" mid-flight state to preserve — once files are pending, a submit-time failure is all-or-nothing (see above). FR-034 is narrowed accordingly.
- Q: If a submit fails and the user hits "Try again," does the retry re-attempt the whole batch or only the file(s) that failed? → A: The whole batch. Every pending file, including the ones that succeeded on the failed attempt, is still held client-side untouched, so retrying the complete batch costs nothing extra and keeps the atomicity model simple — there is no partially-uploaded state to reconcile against.

### Session 2026-07-31 — Published-gallery display & permanent GIF exclusion (post-Stage-1 production feedback)

Raised by the user after exercising the deployed Stage 1 build in production. Scope: how a *published* gallery is displayed (replacing FR-012's adaptive grid) and what media types a gallery may ever contain (reversing FR-026). Composing mechanics from the 2026-07-30 revision — per-item removal, deferred/atomic upload — are unaffected.

- Q: Should the published-gallery display stay an adaptive grid showing every item at once, or become a single-item-at-a-time carousel? → A: A Reddit-style inline carousel — one image at a time, shown directly in the shout/comment body (not fullscreen), with left/right arrow buttons on the frame's own edges and a small position indicator at the bottom of the frame. The grid (FR-012) is retired entirely. The carousel always opens on the first uploaded item; there is no persisted "last viewed" position across renders.
- Q: Should navigation loop, and if so, where does that capability live given Stage 2 was originally the "looping viewer" stage? → A: Navigation loops in both directions inline, immediately — advancing past the last item wraps to the first, and back from the first wraps to the last. This is the same looping principle Stage 2 was going to add to a separate fullscreen viewer, now delivered directly in the inline carousel instead.
- Q: Stage 2 was planned as a separate fullscreen looping viewer (arrows, wrap-around, position indicator) — nearly the same capability the inline carousel now provides. What should happen to that plan? → A: Stage 2 is dropped entirely. The inline carousel already delivers the core browsing value, so building a second looping viewer for fullscreen would be redundant. Activating the carousel's currently-displayed item still opens the existing single-image fullscreen viewer (Lightbox) on that item, exactly as before — it simply gains no new inter-item navigation. FR-017–FR-023 (the fullscreen-viewer requirements written for Stage 2) are retired; their still-relevant substance (looping, edge-anchored controls, a position indicator) is carried by the new inline requirements instead (FR-042–FR-044).
- Q: When paging through images of different aspect ratios, how should the carousel frame behave? → A: A fixed 1:1 square frame, sized to the same per-context max height the grid used (300px shouts / 200px comments) — NOT derived from any particular image's own ratio. Every image is displayed whole (letterboxed, never cropped or stretched) inside that fixed square, with leftover space (left/right for a narrow image, top/bottom for a short one) filled by `th-page`, the same darkest-background token used for the composer's pending-preview tiles (FR-040). The frame's size and shape stay constant as the reader pages through different images — no layout shift (SC-010). This deliberately mirrors the composer's pending-preview convention for consistency between what an author sees while composing and what a reader sees once published, and is explicitly modeled on how Reddit's own inline gallery view behaves.
- Q: Should GIFs remain allowed in galleries (per FR-026, planned for Stage 3), or be excluded? → A: Permanently excluded. FR-026 is reversed in full — this is not a temporary, time-boxed restriction like FR-035 originally was; there is no future stage in this spec where GIFs become includable in a multi-item gallery. A lone GIF attachment (a single item, not part of a multi-item gallery) is entirely unaffected and continues to work exactly as it does today. FR-035's mutual-exclusivity gate becomes permanent rather than expiring, and is additionally strengthened to close a latent gap: today's gate only blocks *mixing* types, not multiple GIFs stacking into an all-GIF gallery (nothing prevents repeatedly picking from "Мои GIF" once one GIF is already attached, since only `hasImages`/`hasVideo` gated the GIF picker, not `hasGif` itself). The permanent rule caps GIF attachment at exactly one item total, so an all-GIF multi-item gallery becomes impossible too, not just a mixed one.
- Q: Does excluding GIFs require a schema or data migration? → A: No. This is new validation logic only — a client-side gate plus a server create-route rule, the same shape as the existing R1–R6 rules in the write contract. No existing content needs fixing, cleanup, or backfill: the rule only gates new creation going forward, exactly like the existing immutability guarantee (FR-029) already means published content is never revisited. A pre-existing multi-item gallery that happens to already contain a GIF or multiple GIFs (none were found on the current dev database at the time of this decision, though production was not checked) is grandfathered — it continues to render normally through the new carousel and remains immutable, exactly like any other published gallery; the new rule only prevents creating another one like it.
- Q: Does this reopen the constitution amendment from Stage 1? → A: Yes, a follow-up correction is needed. The amended constitution (v2.0.0) and `CLAUDE.md`'s non-negotiables both currently read "an ordered gallery of up to 5 images/GIFs" — since this revision permanently excludes GIFs from galleries, that wording is now inaccurate and MUST be corrected (via the `/docs` skill, per the constitution's own Documentation Discipline rule) to describe an images-only gallery. See the Governance Note.

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

**Follow-up correction required (2026-07-31).** The already-landed constitution
amendment (v2.0.0) and `CLAUDE.md` both currently describe the gallery as "up to
5 images/GIFs." Since this revision permanently excludes GIFs from multi-item
galleries (see FR-035, and the reversal of FR-026), that wording is now
inaccurate and MUST be corrected — again via the `/docs` skill only, never
edited directly — to describe an images-only gallery of up to 5 items. This is a
narrowing correction to already-amended wording, not a new redefinition of a
constraint from scratch, but it still needs to land before or alongside this
revision reaching production, so the constitution and the shipped behavior do
not silently disagree with each other.

## Staged Delivery

This is a single feature specification delivered in sequential stages. Each
stage is independently deployable and MUST reach production for real-user testing
before the next stage begins.

| Stage | User Story | Scope summary |
|-------|------------|---------------|
| 1 | US1 (P1) | Multi-image attach (images only), inline **carousel** showing one item at a time with looping navigation and a position indicator, always opening on the first item. *(Revised 2026-07-30)* Composing is no longer append-only: individual pending items can be removed and clicked open in a fullscreen preview; upload is deferred to submit-time and submission is atomic. *(Revised 2026-07-31)* The adaptive grid (FR-012) is retired in favor of the carousel; GIFs are permanently excluded from multi-item galleries. Reordering is still not available. |
| ~~2~~ | ~~US2 (P2)~~ | *Retired 2026-07-31.* Previously: looping navigation inside a separate fullscreen viewer. Dropped — the inline carousel added to Stage 1 already delivers this value; building a second looping viewer for fullscreen would be redundant. See User Story 2 below and FR-017–FR-023. |
| 3 | US3 (P3) | Reorder while composing. *(Narrowed 2026-07-30)* Per-item removal moved to Stage 1. *(Narrowed again 2026-07-31)* GIF-mixing work is removed entirely — GIFs are now permanently excluded from galleries (see Session 2026-07-31) — so this stage covers only reordering. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach several images to one shout or comment (Priority: P1)

A user composing a shout or a comment wants to share more than one image at once —
for example several screenshots of the same event — instead of being forced to
pick a single image or split the thought across multiple posts. They add multiple
images in one go (by selecting several files at once from the upload button, or by
dragging a group of files onto the composer), see that all of them are attached,
can remove any one of them individually or preview any one of them full size before
deciding to publish, and publish. Readers of the resulting shout or comment see the
first attached image in an inline carousel, and can page through the rest with
arrow controls that loop from the last item back to the first, or open any
currently-displayed item full size.

**Why this priority**: This is the core value of the feature and the minimum
viable slice — the ability to attach, publish, and browse more than one image.
Without it, nothing else in this feature has anything to operate on. *(Revised
2026-07-31)* Inline looping browse is now part of this core slice rather than a
later stage, since the inline carousel delivers it directly — see the retired
User Story 2 below.

**Independent Test**: Compose a shout with three images attached in a single
multi-select action, publish it, and confirm from another account that the shout
shows the first image in a carousel, that arrow controls page through the other
two (looping from the third back to the first), and that clicking the
currently-shown image opens it full size.

**Acceptance Scenarios**:

1. **Given** a user is composing a shout, **When** they select three images at once via the upload button, **Then** all three are attached to the pending shout and the composer reflects that three items are attached.
2. **Given** a user is composing a comment, **When** they drag four image files onto the composer at once, **Then** all four are attached, identically to the multi-select path.
3. **Given** a user has one image attached, **When** they add a second image, **Then** the attachment becomes a gallery automatically, with no separate "create gallery" action required of the user.
4. **Given** a user has two images attached, **When** they attempt to add four more in one action (total six, exceeding the maximum of five), **Then** none of the four are attached, the two already-pending images remain attached and unchanged, and the limit is explained in Russian.
5. **Given** a published shout has a gallery of three images, **When** any reader views it in the feed, **Then** the first image is shown in an inline carousel, with arrow controls and a position indicator present. *(Revised 2026-07-31 — supersedes the adaptive-grid scenario.)*
6. **Given** a published shout has a gallery, **When** any reader views it, **Then** the carousel frame is a fixed 1:1 square bounded by the same maximum height as a single-image preview, and never causes the surrounding feed layout to shift or scroll horizontally regardless of which image is currently shown. *(Revised 2026-07-31 — the frame no longer derives its shape from any item's own ratio.)*
12. **Given** a published gallery of four images, **When** a reader activates the currently-displayed image, **Then** the existing single-image viewer opens on that image at full size. *(Revised 2026-07-31 — "activates the currently-displayed image" replaces "clicks the third tile," since there is no longer a grid of simultaneously-visible tiles.)*
7. **Given** a user whose media-posting permission is revoked (feature 005), **When** they attempt to publish a shout or comment with newly uploaded images, **Then** the entire submission is rejected exactly as it is today for a single image, with the same Russian-language explanation and no partial save.
8. **Given** an existing shout or comment that was published with a single image before this feature, **When** any reader views it, **Then** it renders exactly as it did before, with no carousel controls.
9. **Given** a user has attached one or more images, **When** they publish, **Then** each attached image is subject to the same file-type, file-size, and rate-limit rules that apply to a single-image attachment today.
10. **Given** a user drags a batch of four files in which one fails client-side pre-validation (wrong type or too large), **When** the batch is processed, **Then** the three valid images become pending and the invalid one is reported individually with the reason it failed.
11. **Given** a user has at least one image attached, **When** they look for the GIF picker, **Then** it is unavailable; and conversely, **Given** a GIF is attached, **When** they look to add an image, **Then** image attachment is unavailable. *(Revised 2026-07-31 — this is now permanent, not scoped to "Stage 1 or Stage 2.")*
13. **Given** a user is composing with four pending items, **When** they activate the remove control on the second one, **Then** only that item is removed and the other three remain attached in their existing relative order — without affecting or re-uploading anything, since nothing has been uploaded yet.
14. **Given** a user is composing with pending items attached, **When** they click one of the pending preview tiles, **Then** the existing fullscreen viewer opens on that item's local preview, with the same zoom/pan/dismiss behavior as a published item.
15. **Given** a user has several items pending and clicks submit, **When** every file uploads successfully, **Then** the shout or comment is created carrying all of them, in their existing order.
16. **Given** a user has several items pending and clicks submit, **When** one file fails to upload (bad file, transient error, or a permission revoked in that instant), **Then** nothing is posted, the user sees a clear explanation naming the failing file(s) and why, every pending item and all composed text remain exactly as they were, and a "Try again" action resubmits the whole batch without requiring re-attachment.
17. **Given** a reader is viewing a published gallery's carousel on the last item, **When** they navigate forward, **Then** the carousel wraps to the first item; and **Given** they are on the first item, **When** they navigate backward, **Then** it wraps to the last. *(Added 2026-07-31 — absorbed from the retired User Story 2.)*
18. **Given** a reader is viewing a published gallery's carousel, **When** they look at the frame, **Then** a position indicator (e.g. "2 / 5") is visible at the bottom of the frame, and arrow controls are present on the frame's left and right edges; **Given** the gallery has exactly one item, **When** the reader views it, **Then** no arrows or indicator are shown. *(Added 2026-07-31.)*
19. **Given** a user attempts to attach a second GIF while one GIF is already attached, **When** they open the GIF picker, **Then** it is unavailable — a gallery MUST NOT ever contain more than one GIF, which in practice means never more than zero, since a single GIF is not a gallery and a second one is always blocked. *(Added 2026-07-31 — closes the same-type stacking gap.)*

---

### User Story 2 - Browse an attached gallery in fullscreen (Priority: P2) — RETIRED 2026-07-31

*This user story, and the separate "Stage 2" it defined, are retired in full.*
Its rationale ("a reader wants to move through the whole set without dismissing
the viewer and returning to the feed between images") is now satisfied directly
by User Story 1's inline carousel — see acceptance scenarios 17–18 there. Its
requirements (FR-017–FR-023) are tombstoned in the Requirements section below
rather than deleted, so existing references in `plan.md`/`tasks.md` retain a
stable target. No separate fullscreen looping viewer is planned; activating a
carousel's currently-displayed item still opens today's existing single-image
fullscreen viewer, unchanged (FR-036), with no inter-item navigation added to it.

---

### User Story 3 - Reorder a pending gallery (Priority: P3)

*(Retitled 2026-07-30 — previously "Curate the gallery before posting, and mix
in GIFs"; per-item removal moved to User Story 1. Retitled again 2026-07-31 —
"and mix in GIFs" is dropped entirely, since GIFs are now permanently excluded
from galleries; this story covers only reordering.)*

A user assembling a gallery realizes the images are in the wrong order, and wants
to fix that without discarding everything and starting over.

**Why this priority**: This is refinement of an already-working flow. A
mis-ordered selection is recoverable by clearing and re-adding, which is clumsy
but not blocking, and (since 2026-07-30) individual removal is already available
from Stage 1 — only reordering remains a rough edge.

**Independent Test**: While composing, attach four images, move the last one to
the front, publish, and confirm the published gallery's carousel opens with that
item first.

**Acceptance Scenarios**:

1. **Given** a user is composing with several items attached, **When** they reorder the items, **Then** the new order is reflected in the composer and is the order readers will see after publishing.
2. **Given** a user has reordered a pending gallery, **When** they publish, **Then** the first item in their chosen order becomes the carousel's opening image.

---

### Edge Cases

- **A user selects more files than the limit allows in one action.** The entire action is rejected — nothing from it is attached and any previously pending selection is left untouched — with a Russian explanation of the limit (FR-033).
- **Some files in a batch fail client-side pre-validation** (unsupported type or too large). The successfully-validated items become pending; the failed ones are reported individually with the reason for each (FR-034).
- **A submit's upload of one or more pending files fails** (a file that slipped past client validation, a transient storage error, or a permission revoked in that instant). Nothing is posted — no shout, no comment, no partial gallery. All pending items and composed text remain intact, the specific failure is explained clearly, and a "Try again" action resubmits the entire batch.
- **A user removes a pending item while composing.** Only that item is removed; since nothing has been uploaded yet at that point, no server-side deletion is needed — it simply stops being part of the client-held pending set.
- **A user attaches images and then a GIF.** The GIF picker is unavailable while any image is attached, and image attachment is unavailable while a GIF is attached (FR-035). *(Revised 2026-07-31 — this is now permanent; there is no stage in which it lifts.)*
- **A user attaches one GIF, then tries to attach a second.** Blocked — a gallery may never contain more than one GIF, and since a single GIF is a normal single-item attachment rather than a gallery, this means a GIF-containing gallery can never exist at all. *(Added 2026-07-31.)*
- **A gallery's images have inconsistent aspect ratios.** The carousel frame is a fixed 1:1 square regardless of any image's own ratio; each image is letterboxed to fit whole, with `th-page` filling any leftover space, and the frame's size never changes as the reader pages through. *(Revised 2026-07-31 — supersedes the earlier "clamped to the first item's ratio" behavior.)*
- **A user attempts to attach a video to a gallery.** Video is out of scope; it remains on today's single-attachment path and cannot be combined with a gallery.
- **A user attempts to combine a gallery with a YouTube embed.** Not permitted — the existing mutual exclusivity between an image attachment and a YouTube embed is preserved for galleries (FR-027).
- **A shout or comment carries a spoiler/NSFW visibility tag with a gallery attached.** The tag applies to the gallery as a whole, not to individual items — every item is concealed until the reader reveals it, and revealing applies to the whole gallery.
- **The 24-hour post-upload compression runs on a gallery.** Every item in the gallery is compressed on the same schedule and terms as a single attachment, independently of the others, starting from its (submit-time) upload.
- **A user publishes with zero attached items.** Unchanged from today — a shout or comment still requires either text or media.
- **A reader on a narrow mobile viewport views a gallery's carousel.** Arrow controls and the position indicator remain within the fixed-square frame and reachable; they are never pushed off-screen or overlapped in a way that hides them.
- **An author is soft-deleted or banned after publishing a gallery.** Unchanged from today — existing soft-delete behavior governs visibility of the whole shout or comment, including its gallery.
- **A pre-existing gallery already contains a GIF or multiple GIFs**, formed before this revision's permanent exclusion took effect. *(Added 2026-07-31.)* It is grandfathered: it continues to render normally through the new carousel and remains immutable per FR-029, exactly like any other published gallery. No migration, backfill, or cleanup is performed — the new rule only prevents creating another one like it.

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

- **FR-012**: System MUST display a gallery inline as a single-item-at-a-time carousel, always opening on the first uploaded item. *(Revised 2026-07-31 — supersedes the 2026-07-26 adaptive grid, which is retired entirely. A gallery is no longer shown as a multi-tile grid of every item at once.)*
- **FR-013**: *Removed 2026-07-26.* Previously required a "+N" indicator for additional items. Moot both under the retired grid and under the carousel, since the carousel shows exactly one item at a time with its own position indicator (FR-044) rather than an overflow count.
- **FR-014**: System MUST render the carousel frame as a fixed 1:1 square, independent of any item's own aspect ratio, and MUST display each item whole inside it — letterboxed, never cropped or stretched — filling any leftover space with the page's own darkest background token (`th-page`). *(Revised 2026-07-31 — supersedes the "shaped by the first item's clamped aspect ratio, crop each tile to fill its cell" behavior. This mirrors the composer's pending-preview convention, FR-040, for consistency between compose-time and read-time display.)*
- **FR-015**: System MUST bound the carousel frame by the same maximum display height that constrains a single-item preview in the same context — 300px in shouts, 200px in comments — so that no gallery causes horizontal scrolling or layout shift in the feed. *(Wording carried forward unchanged from the grid; the frame is now square, so this height also determines its width.)*
- **FR-036**: Users MUST be able to open the existing single-image fullscreen viewer, with its zoom, pan and dismiss behaviour, on whichever item the carousel currently displays, by activating it. *(Revised 2026-07-31 — supersedes "activating its tile" now that there is no grid of simultaneously-visible tiles, and removes the "see FR-017–FR-023, Stage 2" forward reference, since that stage is retired.)* No inter-item navigation is added to this fullscreen viewer — that value is delivered by the inline carousel itself (FR-042–FR-044).
- **FR-016**: System MUST render shouts and comments that carry exactly one attached item exactly as they render today, with no carousel controls.

#### Inline carousel navigation (published galleries)

*(Section retitled 2026-07-31 — was "Fullscreen viewing (published galleries)," now retired below. These are new requirements, not a renumbering of the retired ones, though they carry forward the same looping/edge-anchoring/position-indicator substance for the inline context instead of fullscreen.)*

- **FR-042**: System MUST provide forward and backward navigation arrow controls anchored to the left and right edges of the carousel frame, present and usable whenever a gallery contains two or more items, at every viewport size.
- **FR-043**: System MUST loop carousel navigation in both directions — advancing past the last item returns to the first, and going back from the first item returns to the last.
- **FR-044**: System MUST display a position indicator at the bottom of the carousel frame (e.g. "2 / 5") whenever a gallery contains two or more items, indicating which item is currently shown and how many the gallery contains.

#### Fullscreen viewing (published galleries) — RETIRED 2026-07-31

*Section retired.* These requirements described a separate fullscreen looping
viewer planned for Stage 2. Dropped in full: the inline carousel (FR-042–FR-044)
now delivers gallery browsing directly in the shout/comment body, making a
second, fullscreen-specific navigation layer redundant. Activating the
carousel's current item still opens the existing single-image fullscreen viewer
(FR-036), which gains no new inter-item navigation. Tombstoned rather than
deleted so existing references in `plan.md`/`tasks.md` retain a stable target.

- **FR-017**: *Retired 2026-07-31.* Previously: open a fullscreen viewer for a gallery by activating its inline preview. Superseded by FR-036 (opens on the carousel's current item) plus FR-042–FR-044 (the navigation itself, now inline).
- **FR-018**: *Retired 2026-07-31.* Previously: edge-anchored forward/backward controls in the fullscreen viewer. Superseded by FR-042 (now anchored to the carousel frame's edges, inline).
- **FR-019**: *Retired 2026-07-31.* Previously: loop navigation in the fullscreen viewer. Superseded by FR-043 (now inline).
- **FR-020**: *Retired 2026-07-31.* Previously: display each item whole, uncropped, in the fullscreen viewer. This was never gallery-specific — it describes the existing single-image Lightbox's baseline behavior, unaffected by any of this feature's stages.
- **FR-021**: *Retired 2026-07-31.* Previously: a position indicator in the fullscreen viewer. Superseded by FR-044 (now inline).
- **FR-022**: *Retired 2026-07-31.* Previously: no inter-item navigation when a gallery has only one item. Superseded by FR-016 (a 1-item post renders with no carousel controls at all).
- **FR-023**: *Retired 2026-07-31.* Previously: preserve scroll position when the fullscreen viewer is dismissed. This was never gallery-specific either — it describes the existing single-image Lightbox's baseline dismiss behavior, unaffected by any of this feature's stages.

#### Composing (pending preview) — effective immediately

*(Section retitled and regrouped 2026-07-30. FR-024 is relocated here from the former "Composing (Stage 3)" grouping, taking effect now rather than in Stage 3. FR-037–FR-041 are new.)*

- **FR-024**: Users MUST be able to remove an individual pending item while composing, without affecting the other pending items. *(No longer Stage 3-gated as of 2026-07-30 — see Clarifications.)*
- **FR-037**: Users MUST be able to activate any individual pending item to open it in the existing fullscreen viewer, showing that item's local preview, with the same zoom/pan/dismiss behavior available for published items. Inter-item navigation is not required here.
- **FR-038**: System MUST present pending items in their own bounded container, visually distinct from the composer's text input, styled with a thin divider, laid out as a single horizontal row.
- **FR-039**: When pending items exceed the width available to display them, the pending-item container MUST scroll horizontally rather than wrapping to additional rows.
- **FR-040**: System MUST render every pending item preview inside a uniform 80×80 square box, identical in size and ratio for every item and across both the shout and comment/reply composers, regardless of any individual item's own aspect ratio. An item thinner or shorter than the box MUST be letterboxed — shown whole, uncropped and unstretched — with the surrounding gap filled by the page's own darkest background token (`th-page`), not cropped to fill the box. The per-item remove control's own size MUST NOT be reduced to match.
- **FR-041**: System MUST defer the upload of any newly selected file until the user submits the shout or comment — a file that has only been selected or dropped MUST NOT be transmitted to the server until submission is initiated. At submission, System MUST upload every pending new file and create the shout/comment as a single atomic outcome: if every upload succeeds, the shout/comment is created carrying all of them; if any upload fails for any reason, none of the batch is attached and no shout/comment is created. On failure, System MUST report which file(s) failed and why, MUST preserve all composed text and every pending item unchanged for the user, and MUST offer a retry action that resubmits the complete pending batch without requiring re-attachment.

#### Composing (Stage 3 — reordering)

*(Narrowed 2026-07-30 — this grouping previously also covered per-item removal, now in effect immediately; see FR-024 above. Narrowed again 2026-07-31 — GIF-mixing is removed from this grouping entirely, since FR-026 is reversed; see Scope boundaries below.)*

- **FR-025**: Users MUST be able to reorder pending items while composing, and the resulting order MUST be the order readers see, with the first item becoming the carousel's opening image.

#### Scope boundaries and immutability

- **FR-026**: *Retired 2026-07-31.* Previously planned to allow static images and GIFs to be combined freely within one gallery in Stage 3. Reversed permanently — see FR-035 and Session 2026-07-31.
- **FR-035**: System MUST permanently enforce mutual exclusivity between images and GIFs within a gallery: the GIF picker MUST be unavailable whenever one or more images are attached, or whenever a GIF is already attached; and image attachment MUST be unavailable whenever a GIF is attached. *(Revised 2026-07-31 — supersedes the "temporary, Stages 1-2 only, lifted in Stage 3" framing; this no longer expires, since FR-026 is reversed rather than merely deferred. Also closes a gap in the original wording: capping the GIF picker at "already have one GIF attached," not just "have an image attached," is what prevents an all-GIF multi-item gallery — the earlier wording only blocked cross-type mixing.)*
- **FR-027**: System MUST NOT allow a gallery to be combined with a YouTube embed — the existing mutual exclusivity between an image attachment and a YouTube embed is preserved.
- **FR-028**: System MUST exclude video from galleries; video remains on the existing single-attachment path, unchanged by this feature.
- **FR-029**: System MUST treat a published gallery as immutable — there MUST be no pathway to add, remove, or reorder a gallery's items after publishing, consistent with today's text-only edit behavior. *(Unaffected by the 2026-07-30 revision: FR-024's pulled-forward removal applies only to pending, unpublished items — never to a published gallery.)*
- **FR-030**: System MUST apply a spoiler/NSFW visibility tag to a gallery as a whole rather than to individual items, and MUST preserve the existing rule that such a tag is only meaningful when media is attached.
- **FR-031**: System MUST behave identically for shouts and comments across every requirement in this specification.
- **FR-032**: System MUST continue to render all pre-existing single-media content correctly, with no migration-driven change to how it appears.

### Key Entities

- **Gallery**: An ordered collection of one to five media items attached to a single shout or comment. Has a defined first item, which opens the inline carousel. Immutable once published. A gallery of exactly one item is indistinguishable, to a reader, from today's single attachment. *(Revised 2026-07-31: displayed as a single-item-at-a-time carousel rather than a grid.)*
- **Media item**: An individual **image** within a gallery, carrying its own type, dimensions, and stored file. *(Revised 2026-07-31: GIFs are permanently excluded from multi-item galleries — see FR-035 — so a gallery's items are images only; a lone GIF remains a single, non-gallery attachment, unaffected.)* Subject individually to the same validation, size limits, and 24-hour compression as a single attachment today. Its position within its gallery is meaningful and stable.
- **Attachment order**: The stable sequence of items within a gallery, established at compose time, determining both which item opens the carousel first and the order of carousel navigation. *(Revised 2026-07-31: "order of fullscreen navigation" is replaced with "order of carousel navigation," since fullscreen no longer has inter-item navigation.)*
- **Pending item**: A file selected or dropped into the composer but not yet uploaded — exists only client-side, as a locally-held preview, until a successful submit persists it as a Media item. Individually removable and individually viewable in a fullscreen preview before it is ever uploaded. Has no server-side existence and therefore nothing to clean up if the user abandons composing without submitting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can attach five images to a shout in a single action and publish it, without performing any gallery-creation step beyond selecting the files.
- **SC-002**: 100% of attempts to attach more than five items to one shout or comment are prevented, including attempts made outside the standard composer interface.
- **SC-003**: Readers viewing a gallery in the feed can reach every attached item using only the inline carousel's arrow controls, from any starting item, in both directions, and can open the currently-displayed item full size in one click. *(Revised 2026-07-31 — supersedes "see every attached item without opening anything," which described the retired grid.)*
- **SC-004**: A reader can reach every item of a five-item gallery using only the inline carousel's navigation controls, from any starting item, in both directions. *(Revised 2026-07-31 — "inline carousel's" replaces "fullscreen," since Stage 2 is retired.)*
- **SC-005**: Inline carousel navigation controls are reachable and usable across the full range of supported viewport sizes, including the narrowest supported mobile width. *(Revised 2026-07-31 — "inline carousel" replaces "fullscreen.")*
- **SC-006**: 100% of pre-existing single-media shouts and comments render identically before and after each stage's deployment, with zero reported regressions.
- **SC-007**: Restricted users (per feature 005) are blocked from uploading new gallery items in 100% of attempts, with zero false-positive blocks on re-used already-stored media.
- **SC-008**: Every item in a published gallery is compressed within the same 24-hour window that applies to single attachments today, with no item skipped.
- **SC-009**: Each stage reaches production and is exercised by real users before the following stage's implementation begins. *(Revised 2026-07-31 — "each of the three stages" is corrected to "each stage," since Stage 2 is retired and only two stages remain.)*
- **SC-010**: Introducing galleries causes no horizontal scrolling or layout shift in the feed at any supported viewport size, regardless of which carousel item is currently displayed. *(Revised 2026-07-31 — the fixed 1:1 square frame makes this guarantee stronger than under the old first-item-derived container, since the frame no longer varies by content at all.)*
- **SC-011**: 100% of submits with at least one failing upload result in no shout/comment being created, with the user's composed text and every pending item left intact and a retry available — zero partial-gallery posts are ever created.
- **SC-012**: 100% of abandoned composer sessions (user never submits) result in zero server-side uploaded files or Media rows, since no upload occurs until submission is initiated.
- **SC-013**: *(Added 2026-07-31.)* 100% of attempts to attach a GIF to a gallery that already contains an image, or to attach an image to a gallery that already contains a GIF, or to attach a second GIF, are prevented — zero galleries are ever created containing a GIF, whether alone with other GIFs or mixed with images.

## Assumptions

- **Existing content is a one-item gallery.** Pre-existing single-media shouts and comments are treated as galleries of one, so no separate legacy display path is needed and no user-visible change occurs for them.
- **The five-item limit is uniform.** It applies identically to shouts and comments, and counts all gallery items together.
- **Size limits are per item.** Each attached item is validated against the same per-file size limit that applies to a single attachment today; this specification does not introduce an additional aggregate cap across a gallery.
- **Composing gained per-item removal ahead of Stage 3 (2026-07-30).** Reordering remains the only composing action still deferred to Stage 3.
- **Uploads are deferred to submit-time and a submit is atomic (2026-07-30).** No file is transmitted to the server until the user submits; a submit either uploads and attaches every pending file and creates the shout/comment, or none of it happens and the user can retry. See FR-041.
- **A retry resubmits the whole pending batch, not just previously-failed files (2026-07-30).** Since every pending file is still held client-side regardless of a failed submit's outcome, there is no cheaper partial-retry to offer, and re-sending everything keeps the atomicity model simple.
- **GIF exclusion from galleries is permanent, not a phased regression (revised 2026-07-31).** The prior assumption ("Stages 1–2 are a temporary regression for GIF users... ends when Stage 3 ships") no longer holds — FR-026 is reversed outright, not deferred. A lone GIF attachment is unaffected; only multi-item galleries can never include one.
- **Carousel items are letterboxed, never cropped (revised 2026-07-31).** The prior assumption drew a line between "cropped grid tiles" and "uncropped fullscreen items." That line is gone along with the grid: the inline carousel itself now letterboxes every item into its fixed square frame, matching what the fullscreen viewer already did for a single image.
- **Carousel navigation controls are input-agnostic (revised 2026-07-31).** The specification requires frame-anchored forward/backward arrow controls as the guaranteed baseline; supporting additional input methods (keyboard, touch swipe) is a natural extension and is expected, but the edge controls are the guaranteed baseline on every device. *(Rewords the prior "fullscreen edge-anchored" framing to "carousel frame-anchored," since Stage 2 is retired.)*
- **No change to notification, feed-ranking, or search behavior.** Galleries do not alter how shouts and comments are notified, ordered, or searched.
- **Avatar and profile media are out of scope**, consistent with feature 005's boundary.
- **Deployment cadence is a hard sequencing constraint**, not a preference: Stage N+1's implementation does not begin until Stage N is live in production and has been exercised by real users.

## Dependencies

- **Feature 005 (per-user media posting restriction)** — its permission check must be generalized from a single upload to N uploads per submission without changing its semantics, and (as of 2026-07-30) must be checkable at atomic submit-time rather than at independent upload-time.
- **The existing 24-hour post-upload compression job** — must operate per item across a gallery, timed from each item's (now submit-time) upload.
- **The constitution amendment described in the Governance Note above** — must land before or alongside Stage 1's production deployment; its 2026-07-31 follow-up correction (removing "GIFs" from the amended wording) must land before or alongside this revision's production deployment.
