# Feature Specification: Time-Limited Media Retention

**Feature Branch**: `011-media-retention-windows`

**Created**: 2026-08-19

**Status**: Draft

**Input**: User description: "Time-limited retention for the heaviest media files: expire the 1600px WebP variant of still images after a week, and expire MP4 video files after a month. Storage on the media volume is dominated by these two file classes, and both are almost never requested after the content stops being fresh..."

## Clarifications

### Session 2026-08-19

- Q: FR-011 — what form should the deleted-video placeholder take? → A: Both layers — the media description marks the video expired so the card renders a Russian tombstone, and the serving layer answers stale cached addresses with a shared placeholder file
- Q: FR-013 — how should a card present a video whose file has expired? → A: A Russian text tombstone in the space the player occupied, with no play control and no imagery; no poster thumbnail exists for video today
- Q: FR-014 — is any author-facing retention notice in scope for this release? → A: No; the feature ships silently and FR-014 is satisfied by the tombstone the author sees on their own post
- Q: FR-015 — what must a sweep do when a retention window is zero, negative, or unparseable? → A: Refuse to run that class, remove nothing, and fail loudly; never fall back to a default or clamp
  - *Amended 2026-08-19 after /speckit-analyze*: extended to an **absent** window, which Constitution §III already listed.
  - *Superseded 2026-08-20*: the windows are no longer configuration at all. Both are **hardcoded constants** in `workers/src/helpers/retention.ts` (7 days for images, 30 for videos) — see FR-015. They are not runtime-adjustable, so there is no value to be absent, empty, or unparseable, and FR-015a is satisfied structurally instead of by a runtime guard. Constitution **v5.1.0** (2026-08-20) recognises this form explicitly and prefers it — see Constitutional Impact.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator reclaims the full-size copy of week-old images (Priority: P1)

Every uploaded photo is kept in two sizes: the one the feed displays inline, and a larger one used only when a reader opens the image full-size. Requests for the larger copy fall off sharply once a post stops being fresh, but the file is kept forever. A site operator wants the larger copy removed automatically once an image is older than the image retention window (one week), so that opening an older image full-size falls back to the display copy instead of failing.

**Why this priority**: The larger copy is the single biggest consumer of image storage, it accrues with every upload, and removing it costs nothing but resolution on content nobody is actively browsing. No post loses its picture, no row is touched, and the class can be shipped and verified entirely on its own.

**Independent Test**: Publish a photo, advance past the retention window, run the sweep, then browse the feed and open the image full-size. The feed renders identically; the full-size view still opens and shows the image, at the display copy's resolution. Confirm the reclaimed file is gone from storage and a freshly published photo still opens at full resolution.

**Acceptance Scenarios**:

1. **Given** a still photo older than the retention window, **When** the sweep runs, **Then** its full-size copy is removed and its display copy is left intact.
2. **Given** a still photo newer than the retention window, **When** the sweep runs, **Then** all of its copies are left intact and the full-size view is unchanged.
3. **Given** an image whose full-size copy has been reclaimed, **When** a reader opens it full-size, **Then** the image is shown at the display copy's resolution, with the viewer's zoom and gallery navigation still functioning.
4. **Given** an image whose full-size copy has been reclaimed, **When** any page requests its media, **Then** the system never offers an address for a copy that no longer exists.
5. **Given** a reader's browser still holds a previously cached address for a reclaimed full-size copy, **When** it requests that address, **Then** it receives a valid image rather than an error or a broken picture.
6. **Given** an animated image of any age, **When** the sweep runs, **Then** none of its files are removed and it continues to play everywhere it did before.
7. **Given** an image whose full-size copy has been reclaimed, **When** its post is viewed, **Then** the attachment is still present — the picture does not disappear from the post.
8. **Given** the sweep has already run to completion, **When** it runs again, **Then** it removes nothing and reports nothing left to reclaim.

---

### User Story 2 - Operator reclaims month-old video files (Priority: P2)

Uploaded videos are by far the largest individual files on the media volume and are almost never replayed once a post has aged out of the feed. An operator wants video files removed automatically once they are older than the video retention window (one month) — including videos attached to posts that are still live — with the loss shown to readers explicitly, in Russian, instead of a broken player.

**Why this priority**: The largest per-file storage win, but the only class in this feature that removes media a reader can currently see. It requires a user-visible replacement, Russian copy, and a constitutional amendment (see Constitutional Impact), so it is ranked below the invisible image reclaim and must not block it.

**Independent Test**: Publish a video post, advance past the retention window, run the sweep, then open the post as a reader. The post's text, likes, and comments are unchanged and the reader is told clearly that the video was deleted, with no broken player and no error. Publish a second video inside the window and confirm it still plays.

**Acceptance Scenarios**:

1. **Given** a video older than the retention window attached to a live post, **When** the sweep runs, **Then** the video file is removed and the post, its text, its likes, and its comments remain intact.
2. **Given** a video newer than the retention window, **When** the sweep runs, **Then** the file is left intact and plays normally.
3. **Given** a video whose file has been reclaimed, **When** a reader opens the post, **Then** they are shown an explicit Russian message that the content was deleted, never an error, a spinner that never resolves, or a broken player.
4. **Given** a video whose file has been reclaimed, **When** the placeholder is served, **Then** it is not retained by caches for the lifetime that real media is, and it can never be retained under the address of a video that is still valid.
5. **Given** an animated image or a personal-library animation of any age, **When** the sweep runs, **Then** it is never treated as a video and none of its files are removed.
6. **Given** a post embedding a remote video or animation service, **When** the sweep runs, **Then** nothing about that post changes.
7. **Given** a video whose file has been reclaimed, **When** an administrator restores or moderates the post, **Then** all text and interaction history is complete and only the video is gone.
8. **Given** a reader's browser holds an address cached before expiry, **When** it requests the removed video file directly, **Then** it receives the shared deleted-content placeholder rather than an error.
9. **Given** a video whose file has been reclaimed, **When** its author views their own post, **Then** they see the same Russian deleted-content tombstone a reader sees, and no separate author-facing notice.

---

### User Story 3 - Operator verifies and tunes retention safely (Priority: P3)

Both sweeps face a large backlog the first time they run — every image older than a week and every video older than a month. An operator wants to preview exactly what would be removed before removing it, change either window through a reviewed source edit and see the new window take effect, and read a per-class report afterwards that distinguishes "nothing was due" from "the job is broken".

**Why this priority**: Makes the first, highest-risk run reversible in decision terms and gives ongoing confidence, but the two reclaim classes deliver their storage value without it. Ranked last because it is operational tooling, not user-facing behaviour.

**Independent Test**: Run both sweeps in preview mode against real data and confirm they report a file count and total bytes and change nothing on disk. Change each window constant, rebuild the workers, re-run preview, and confirm the reported set changes accordingly. Run for real and confirm the report accounts for every candidate.

**Acceptance Scenarios**:

1. **Given** a backlog of expired media, **When** the operator runs a sweep in preview mode, **Then** it reports the exact file count and total bytes it would free, per class, and changes nothing.
2. **Given** either retention window constant is changed and the workers are rebuilt, **When** the sweep runs, **Then** the new window governs eligibility, and no deployment-time setting can alter a window without that source change (FR-015).
3. **Given** a sweep run completes, **When** the operator reads its report, **Then** scanned, expired, and skipped counts are given per class, with skipped broken down by reason.
4. **Given** a sweep is interrupted partway through, **When** it is run again, **Then** it completes the remaining work, and the interruption has left at most an unreferenced leftover file — never an address that resolves to nothing.
5. **Given** the first backlog run, **When** it executes, **Then** it processes media in bounded batches and readers see no degradation in page or feed responsiveness while it runs.
6. **Given** a proposed change to a retention window, **When** it is reviewed, **Then** the new value is visible as a source diff before it can ever run — a zero or negative window is caught in review and a non-numeric one by the type checker, so no absent, zero, negative, or unparseable window can reach a sweep at runtime (FR-015a).

---

### Edge Cases

- An image is published, its full-size copy expires, and the post is then deleted and restored by an administrator: the text and the picture come back, at the display copy's resolution. The full-size copy does not return.
- A photo uploaded at original quality is opened full-size at three different ages: inside the original-quality window, after the original is downgraded but inside the retention window, and after the retention window. All three must produce a working image with no intermediate state where the offered address points at a file that was never written or already removed.
- A gallery contains images of mixed ages, so some members have a full-size copy and some do not. Opening the gallery full-size and paging through it must work end to end, with no gap or error between members.
- A reader's page was loaded before a sweep and holds addresses that the sweep then invalidates; the reader opens an image full-size or plays a video minutes later.
- A video expires while a reader is mid-playback, or has the file removed between the poster being fetched and playback starting.
- A video's post is soft-deleted before the video's retention window elapses — the existing deleted-content reclaim and this age-based expiry both consider the same file; whichever removes it first, the second must skip it cleanly rather than fail.
- Media that the existing whole-media reclaim has already emptied is scanned by these sweeps: it must be skipped, and it must not be double-counted as freed storage.
- A single-frame animation saved in a user's personal library is never a video and never loses a copy, at any age.
- An image or video whose stored metadata is unreadable: it must be counted and skipped, never removed on a guess.
- Two sweeps overlap, or a sweep runs while an upload is writing new copies for the same media.
- A retention window is set shorter than the original-quality window. This still runs, and need only fail safely rather than produce a meaningful result. The absent/zero/negative/unparseable cases of FR-015a cannot arise: the windows are compile-time constants, not parsed input (FR-015).
- Storage is full or read-only when a sweep runs.

## Requirements *(mandatory)*

### Functional Requirements

**Image full-size copy expiry**

- **FR-001**: The system MUST remove the full-size copy of a still image once that image is older than the image retention window, a constant defined in the worker source (FR-015).
- **FR-002**: The system MUST NEVER remove an image's display copy under this feature; inline rendering in feeds, cards, and galleries MUST be byte-for-byte unchanged at every age.
- **FR-003**: Once an image's full-size copy is removed, every surface that previously offered a full-size view MUST offer the display copy instead, and the system MUST NEVER advertise an address for a copy that is not present.
- **FR-004**: The system MUST NOT remove any file belonging to an animated image, at any age, whether it is attached to content or held in a user's personal library.
- **FR-004a**: The system MUST NOT remove any file belonging to media saved in a user's personal library, at any age, whether or not that media is animated and whether or not it is also attached to content. Library membership is an exemption in its own right, independent of FR-004: a still image held in a library — such as a single-frame animation, which the system stores and serves as a still — is exempt on this requirement alone. Exemption MUST be determined by looking up library membership directly, and MUST NEVER be inferred from whether the media is animated.
- **FR-005**: For an image uploaded at original quality, the full-size view MUST pass through its three stages — original, then full-size copy, then display copy — such that at every instant the advertised address resolves to a file that exists; no stage may be skipped in a way that leaves the previous stage advertising a removed or never-written file.
- **FR-006**: A request for an image copy that has been removed MUST resolve to a valid image rather than an error, so that addresses cached by clients before the removal continue to work.
- **FR-007**: The full-size viewer MUST remain fully functional for an image whose full-size copy is gone, including opening, zooming, and paging between gallery members; it MUST NOT present the smaller copy in a way that implies a resolution the file does not have.
- **FR-008**: Image expiry MUST NOT cause an attachment to disappear from its post; the picture MUST continue to render everywhere it rendered before, only at reduced full-size resolution.

**Video file expiry**

- **FR-009**: The system MUST remove an uploaded video file once it is older than the video retention window, including videos attached to live, non-deleted content. As with FR-001, the window is a constant defined in the worker source.
- **FR-010**: Video expiry MUST apply only to uploaded video. Animated images, the personal animation library, and remotely hosted video or animation embeds MUST NOT be affected.
- **FR-011**: A request for a removed video MUST be answered with a placeholder stating in Russian that the content was deleted. It MUST NOT produce an error, a broken player, or an indefinite load. The placeholder MUST be delivered at two layers: the media description offered to a page MUST mark the video as expired, so the post's card renders the Russian deleted-content message in place of the player; and the serving layer MUST additionally answer a direct request for the removed file with a shared placeholder file, so that addresses cached before expiry keep resolving.
- **FR-012**: The placeholder MUST NOT be cached under the long-lived immutable policy applied to real media, and MUST NEVER be retained by any cache under the address of a video whose file is still present.
- **FR-013**: After a video's file is removed, its post MUST remain readable with its text, likes, and comments intact. The card MUST render a Russian deleted-content tombstone in the space the player occupied, with no play control and no imagery. It MUST NOT present player chrome, disabled or otherwise, that could imply the video is merely failing to load.
- **FR-013a**: This feature MUST NOT introduce a poster image for video. No poster is produced at upload time today, so there is none to retain, and producing one is excluded by FR-026.
- **FR-014**: Authors MUST NOT be led to believe an expired video is still available. This is satisfied by the tombstone of FR-013, which an author sees on their own post exactly as any reader does. No additional author-facing notice is in scope for this release: the feature ships silently, with no upload-time retention copy, no label on aging posts, and no advance warning before expiry.

**Shared retention behaviour**

- **FR-015**: Both retention windows MUST be hardcoded constants in the worker source, exported from a single shared module and imported by both sweeps. They MUST NOT be read from the environment, and MUST NOT follow the existing grace- and quality-window convention of substituting a default for a missing value. Changing a window is a code change: reviewed, deployed, and visible in history. These are product decisions with one right answer across environments, not operational knobs.
- **FR-015a**: A retention window that is absent, zero, negative, or unparseable MUST NOT cause any file to be removed. Under FR-015 this is met by construction rather than by a runtime check: a literal constant cannot be absent, empty, or unparseable, the type checker rejects a non-number, and a zero or negative window is visible at review time. No parsing means no parse to get wrong. This is why the constants MUST NOT be made environment-readable later without restoring a strict fail-closed resolver — a negative window places the age cutoff in the future and makes every file, including media created that day, eligible for irreversible removal.
- **FR-016**: Eligibility for both classes MUST be determined by the media's age since creation. This is deliberate: both expiries are age-based by design, and neither depends on when content was deleted.
- **FR-017**: Both sweeps MUST run on a recurring schedule and MUST be idempotent — a completed sweep re-run MUST remove nothing and report nothing outstanding.
- **FR-018**: Both sweeps MUST be crash-safe: the recorded state of a media item MUST be advanced before its file is removed, so that an interrupted run can only leave an unreferenced leftover file, never an advertised address with no file behind it.
- **FR-019**: Both sweeps MUST process candidates in bounded batches so that the initial backlog run does not degrade the responsiveness of the site.
- **FR-020**: Both sweeps MUST report, per class, the number of items scanned, expired, and skipped, with skipped broken down by reason, so that a zero-expiry run is distinguishable from a failed one. Storage freed MUST be reported in bytes.
- **FR-021**: Both sweeps MUST support a preview mode that reports exactly what would be removed and changes nothing.
- **FR-022**: Expired media MUST be recorded in a way that is distinct from media whose files have been reclaimed wholesale by the existing unreachable-media reclaim, because that state removes the attachment from its post entirely, which MUST NOT happen here.
- **FR-023**: These sweeps MUST NOT delete any database row — not content, not media records, not the rows linking them.
- **FR-024**: These sweeps MUST leave the existing unreachable-media reclaim working unchanged, MUST skip media that reclaim has already emptied, and MUST NOT double-count storage freed by it.
- **FR-025**: Avatars are outside this feature and MUST NOT be touched.
- **FR-026**: This feature MUST NOT change what is produced at upload time; it governs retention only.

### Key Entities

- **Stored media item**: A record of one uploaded image or video, carrying its creation time, its kind, and the current state of the files stored for it. Rows are never removed; only files are.
- **Image copy set**: The sized copies stored for one image — a display copy, always retained; a full-size copy, retained only while the image is inside the image retention window; and, for animated images, a thumbnail and an animated source, both always retained.
- **Video file**: The single uploaded video file for a video media item, retained only while inside the video retention window.
- **Retention window**: A per-class age threshold past which a file class becomes eligible for removal, declared as a constant in the worker source and changed only by a reviewed, deployed source edit (FR-015). Two exist: one for image full-size copies, one for video files.
- **Deleted-content placeholder**: The user-visible Russian stand-in served in place of a removed video, so the loss is explicit rather than a failure.
- **Sweep report**: The per-run, per-class record of what was scanned, expired, and skipped, with reasons and bytes freed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the first complete run, zero full-size image copies remain in storage for images older than the image retention window, and zero video files remain for videos older than the video retention window.
- **SC-002**: An operator can state, in bytes and per class, exactly how much storage each run freed, and preview a run's effect before committing to it.
- **SC-003**: Every image published on the platform remains viewable inline and at full size, at every age — 100% of images, with zero broken pictures and zero failed media requests attributable to expiry in the first week after rollout.
- **SC-004**: 100% of requests for an expired video produce the Russian deleted-content placeholder within the same load time budget as normal media; zero produce an error, a broken player, or an unresolved load.
- **SC-005**: Zero posts, comments, likes, or media records are removed by this feature; content restored by an administrator after expiry returns with its text and interaction history complete.
- **SC-006**: Re-running a completed sweep frees zero additional bytes and changes zero files.
- **SC-009**: No sweep can ever run on an absent, zero, negative, or unparseable retention window: both windows are source constants with no runtime input, so such a value is a review-time diff or a type error rather than a state a run can reach. Zero occurrences of a window read from the environment across the worker sources.
- **SC-007**: The initial backlog run introduces no measurable degradation in feed or page responsiveness for readers while it executes.
- **SC-008**: Interrupting a sweep at any point leaves zero addresses that resolve to a missing file; the worst outcome is an unreferenced leftover file cleaned up on the next run.

## Assumptions

- Storage pressure on the media volume, not user demand, is the driver. Requests for a full-size copy after a week and for a video after a month are assumed to be rare enough that the storage saved outweighs the loss, and this assumption is not measured before rollout.
- Reduced full-size resolution for older images is an acceptable, permanent trade. There is no restoration path — once a full-size copy is removed it is not regenerated, including for content that later becomes popular again.
- Video loss is permanent and total. This feature provides no export, download, or archival path for a video before it expires. Authors are assumed to accept this without prior notice; the loss is disclosed only by the tombstone on the post after the fact.
- Both windows are measured from media creation because no record of deletion time exists. For this feature that is the intended semantics rather than an approximation.
- The existing degradation of a missing sized copy to the display copy at the serving layer is sufficient to protect clients holding long-lived cached addresses; the feature relies on it rather than replacing it.
- Retention windows are expected to be longer than the original-quality window; a change that inverts that ordering is treated as an authoring error caught in review, and need only fail safely rather than produce a meaningful result. The windows are hardcoded constants (FR-015), so the absent/unparseable failure modes the existing grace windows guard against at runtime cannot occur here — the `value or default` coercion those windows use is not merely avoided, there is no input for it to apply to.
- The two sweeps are independent of each other and of the existing unreachable-media reclaim, and may run on separate schedules.

## Dependencies

- The existing recurring background job infrastructure and its scheduling.
- The existing original-quality downgrade behaviour, whose window this feature's image stage must compose with.
- The existing media-serving fallback that degrades a missing sized copy to the display copy.
- The existing unreachable-media reclaim, whose "files reclaimed" state must remain distinct from this feature's per-class expiry state.
- Pre-existing defect, noted but not fixed here: the media description advertises a thumbnail address for video that upload never writes. It is unused by any surface today, but any work that starts consuming it must write the file first.
- A constitutional amendment covering both changes below, landed alongside this specification.

## Constitutional Impact

**Status: satisfied.** This feature could not be implemented under Constitution v4.0.0 as written. Two amendments were required before implementation, and both have landed: **v5.0.0** (2026-08-19) for the two items below, and **v5.1.0** (2026-08-20) for the window-declaration form described after them. The governing version for this feature is v5.1.0.

- **§III, Exemptions — media reachable from live content.** The constitution states that media reachable from any live content "is not eligible under any clause above". Video expiry removes files that are reachable from live, non-deleted posts, which is the explicit point of User Story 2. The amendment must add age-based retention as a permitted ground for reclaiming a file, distinct from unreachability, abandonment, and deletion. The existing requirement that loss "MUST be visible rather than silent" and "MUST NEVER render as a broken image" is satisfied by the placeholder and carries over unchanged. The exemptions for ban-removed content, the personal library, and avatars are unaffected.
- **Reachable image variants.** The governing rule that a still image's stored copies are exactly those a surface can request becomes age-dependent: a still image has both copies while fresh and only the display copy afterwards, and what the system advertises must track that state. The rule that no unwritten or removed copy may ever be advertised is unchanged and is what FR-003 enforces.

- **§III, age-based retention — the form of a window (v5.1.0).** v5.0.0's fourth reclamation ground required every declared file class to have "its own per-environment configurable window". FR-015 deliberately does the opposite: the windows are source constants, because a configuration surface for a value with one right answer everywhere buys nothing and reintroduces the exact failure the fail-closed limit exists to prevent (`Number("-1") || 7` is `-1`, putting the age cutoff in the future). v5.1.0 rewrites that MUST to require one *declared, discoverable, review-gated* window per class — a source constant or per-environment config — and spells the fail-closed limit out per form: a constant satisfies it structurally and is the preferred form; an environment-read window MUST carry a strict throwing resolver. FR-015 and FR-015a are compliant as written.

Row preservation under §III is untouched: this feature removes files only.

## Resolved Decisions

### D1: Age is clocked from creation, and that is the intended semantics

Both windows are measured from when the media was created. No record of deletion time exists in the data model, and this feature does not add one. Unlike the deleted-content grace period in the unreachable-media reclaim — where clocking from creation is a known compromise that weakens the restore promise — age-based retention is what this feature actually means. A week-old image and a month-old video are exactly the intended targets regardless of what happened to their posts.

### D2: Expiry state is recorded separately from wholesale reclaim

The existing reclaim marks media as having lost its files, and that state deliberately removes the attachment from its post. Reusing it here would make every week-old picture vanish from its post rather than merely lose resolution. Per-class expiry is therefore recorded independently, and content whose media has expired continues to render.

### D3: Cached addresses are protected by the existing serving fallback, not by retaining files

Media addresses are cached by clients for a year. Rather than retaining the full-size copy until every cached address has expired, the feature relies on the serving layer already degrading a missing sized copy to the display copy. This bounds the retention win to the configured window instead of the cache lifetime, at the cost of some clients receiving a smaller image than the address named.

### D4: Video expiry applies to live content, by design

Restricting video expiry to deleted content would leave the large majority of video storage untouched and would duplicate the existing deleted-content reclaim. The feature deliberately removes video from posts that are still live and still readable, and pays for it with an explicit, user-visible placeholder rather than a silent failure. This is the change that requires the constitutional amendment above.

## Out of Scope

- Any change to what is generated or stored at upload time.
- Hard-deletion of any database row.
- Any change to animated image, remote video embed, or remote animation handling.
- Regenerating an expired copy on demand, or any restoration path for expired media.
- Author-facing export or download of media before expiry.
- Any author-facing retention notice: upload-time copy, a label on aging posts, or advance warning before expiry.
- Introducing a poster image for video, or correcting the pre-existing advertisement of a video thumbnail that is never written at upload time (noted under Dependencies).
- Retention policy differentiated by engagement, author, or content popularity.
