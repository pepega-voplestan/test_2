# Feature Specification: Reclaim Unused Media Storage

**Feature Branch**: `008-reclaim-unused-media`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Reclaim wasted media storage without degrading any image that users can actually see. Media storage is growing and an audit found three classes of files that occupy disk but are never served..."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator reclaims unreachable image variants (Priority: P1)

The platform generates three sized copies of every uploaded image. An audit found that, depending on the kind of media, one of those copies can never be displayed by any part of the product. A site operator wants to stop producing the useless copy for new uploads and remove the ones already sitting on disk, freeing storage without any visible change for any reader.

**Why this priority**: Largest guaranteed-safe reclaim with zero user-visible consequence and zero policy risk. It touches no deleted or user-owned content, so it can ship and be verified entirely on its own. It is also the only class where the waste keeps growing with every new upload, so stopping the source has compounding value.

**Independent Test**: Upload one still photo and one animated image, confirm only the reachable copies are produced. Run the reclaim in preview mode against existing media, confirm the reported set contains only unreachable copies. Run it for real, then browse the feed, open a gallery, open the full-size viewer, and open the personal animation library — every image renders exactly as before.

**Acceptance Scenarios**:

1. **Given** a still photo is uploaded, **When** processing completes, **Then** only the copies the product can actually display are stored, and the smallest copy is not created.
2. **Given** an animated image is uploaded, **When** processing completes, **Then** the animated source and the copies the product can display are stored, and the largest still copy is not created.
3. **Given** existing media predating this feature, **When** the operator runs the reclaim in preview mode, **Then** the system reports the exact file count and total bytes it would free and changes nothing on disk.
4. **Given** the operator runs the reclaim for real, **When** it finishes, **Then** every still photo retains the copies used for inline display and full-size viewing, and every animated image retains its animated source and the copy used by the library grid.
5. **Given** the reclaim has already run to completion, **When** the operator runs it a second time, **Then** it reports nothing left to reclaim and deletes nothing.
6. **Given** a reader loads a page, **When** any image is displayed inline, in a gallery, at full size, or in the personal animation library, **Then** it renders identically to before the reclaim.

---

### User Story 2 - Operator reclaims media that was never published (Priority: P2)

A user attaches media while composing a post, then abandons it without publishing. The files are already stored permanently and nothing will ever display them. An operator wants these reclaimed automatically on an ongoing basis.

**Why this priority**: Recurring, fully automatic reclaim of content no reader can reach. Ranked below P1 because it requires a safety window and must distinguish abandoned uploads from the personal animation library, which is intentionally unattached to any post.

**Independent Test**: Attach media in the composer, abandon it, advance past the safety window, run the job, and confirm the files are gone. Separately, save an item to the personal animation library, run the job, and confirm it is untouched and still displays.

**Acceptance Scenarios**:

1. **Given** media was uploaded but never published and the safety window has passed, **When** the job runs, **Then** its files are reclaimed.
2. **Given** media was uploaded but never published and the safety window has NOT passed, **When** the job runs, **Then** its files are left intact.
3. **Given** media is saved in a user's personal animation library and attached to no post, **When** the job runs, **Then** it is never reclaimed and continues to display in the library.
4. **Given** a composer session held open beyond the safety window, **When** the user finally publishes, **Then** the outcome is predictable and the user is told clearly if the attachment is no longer available, rather than publishing a post with silently broken media.
5. **Given** the job reclaims media, **When** it finishes, **Then** the database record and any link rows are still present and only files were removed.

---

### User Story 3 - Operator reclaims media behind deleted posts (Priority: P3)

When a post or comment is deleted it is only marked deleted; its media files remain on disk forever. An operator wants that storage back for content that is past any realistic chance of restoration.

**Why this priority**: Potentially the largest reclaim, but the only class that touches preserved user content and interacts with the moderation restore path. It requires a constitutional amendment (see Resolved Decisions D1) and MUST NOT block the two safe classes above.

**Independent Test**: Delete a post, advance past the grace period, run the job, confirm files are reclaimed while the post's tombstone still renders. Separately, delete a post, restore it inside the grace period, and confirm its media still displays intact.

**Acceptance Scenarios**:

1. **Given** a post was deleted by its author and the grace period has passed, **When** the job runs, **Then** its media files are reclaimed and its database records remain.
2. **Given** a post was deleted and is still inside the grace period, **When** an administrator restores it, **Then** all of its media displays exactly as before.
3. **Given** a post was deleted, its grace period has passed, and its media was reclaimed, **When** an administrator restores it, **Then** the restore succeeds and the post returns as text-only, with its media permanently gone and the loss visible rather than presented as a broken image.
4. **Given** content was removed by a ban, **When** the job runs, **Then** its media is never reclaimed, so that unbanning restores the account's content complete.
5. **Given** a deleted post still carries live comments and therefore remains visible as a tombstone, **When** its media is reclaimed, **Then** the tombstone still renders correctly and no error appears.
6. **Given** media is shared by one deleted and one live post, **When** the job runs, **Then** it is NOT reclaimed, because a live post still displays it.

---

### Edge Cases

- What happens when the same media is referenced by both a deleted post and a live one? It MUST be retained; a single live reference protects it.
- What happens when media is referenced by both a post and a user's personal animation library? The library reference alone MUST protect it.
- What happens if the process crashes between recording an intent and deleting files? The next run MUST reach the same end state without double-deleting or leaving a record that claims a file exists when it does not.
- What happens when a reader's already-loaded page requests a copy that was just reclaimed? The reader MUST NOT see a broken image; the system MUST degrade to an available copy.
- What happens when a file is already missing at reclaim time? It MUST count as success, not failure.
- What happens when the expected surviving copy is missing or empty? The reclaim MUST abort for that item, leaving it untouched for a later run, rather than removing the last usable copy.
- What happens when an administrator restores content whose media was already reclaimed? The restore MUST succeed and return the content media-free; the loss MUST be visible rather than surfacing as a broken image.
- What happens to media whose type stores no derived copies at all, such as externally-hosted embeds? It MUST be skipped, not treated as reclaimable.
- What happens when free disk space is exhausted mid-run? The run MUST stop safely and be resumable.

## Requirements *(mandatory)*

### Functional Requirements

#### Unreachable copies (User Story 1)

- **FR-001**: The system MUST NOT generate the smallest derived copy for non-animated images, which no display surface requests.
- **FR-002**: The system MUST NOT generate the largest derived copy for animated images, whose full-size view uses the animated source instead.
- **FR-003**: The system MUST continue generating every copy that a display surface can request, specifically the smallest copy for animated images and the largest copy for non-animated images.
- **FR-004**: The system MUST provide an operator-run, one-time reclaim that removes already-generated unreachable copies from existing media, applying the per-kind rule in FR-001 and FR-002.
- **FR-005**: The media description returned to clients MUST NOT advertise an address for a copy that no longer exists; any field that would do so MUST be removed or repointed, and client-side type definitions updated to match.
- **FR-006**: The one-time reclaim MUST be an operator-invoked tool rather than a permanent schedule, because after FR-001 and FR-002 no new unreachable copies are produced.

#### No live association (User Stories 2 and 3)

- **FR-007**: The system MUST provide a recurring background job that reclaims files for media no display surface can reach.
- **FR-008**: The job MUST treat media as reachable if ANY of the following holds: it is attached to a non-deleted post, attached to a non-deleted comment, or referenced by a user's personal animation library. Only media failing all three MUST be considered for reclaim.
- **FR-009**: The job MUST delete files ONLY. It MUST NOT delete database records or link rows, because tombstone rendering for a deleted post with live comments depends on them.
- **FR-010**: The job MUST NOT reclaim media whose only references are to content removed by a ban, so that unbanning restores that content complete.
- **FR-011**: The job MUST leave never-published media untouched until a configurable safety window has elapsed since upload.
- **FR-012**: The job MUST leave media behind deleted content untouched until a configurable grace period has elapsed since deletion. Once elapsed, its files MUST be reclaimed; restoring such content afterwards returns it without its media, which is accepted (see D1).
- **FR-013**: Publishing a post whose attachment has already been reclaimed MUST fail with a clear message in the product's language rather than creating a post with broken media.
- **FR-014**: Restoring content whose media was already reclaimed MUST succeed and MUST present the content as media-free rather than rendering a broken image, so the loss is visible and unambiguous to both administrator and readers.

#### Cross-cutting

- **FR-015**: Every reclaim capability MUST offer a preview mode that reports exactly which files would be removed and how many bytes would be freed, while changing nothing.
- **FR-016**: Every reclaim MUST verify that the surviving copies are present and non-empty BEFORE removing anything, and MUST abort for that item if they are not.
- **FR-017**: Every reclaim MUST record its intent durably before removing files, so that an interruption can only leave a harmless stray file, never a record pointing at a file that no longer exists.
- **FR-018**: Every reclaim MUST be idempotent and resumable: repeated runs MUST converge to the same end state, never double-delete, and never fail because a file is already gone.
- **FR-019**: Every reclaim MUST report file counts and bytes freed in operational logs so its effect is measurable.
- **FR-020**: Requests for a copy that has been reclaimed MUST degrade to an available copy rather than producing a broken image, because already-delivered pages may reference it and cached addresses are long-lived.
- **FR-021**: Avatars MUST NOT be affected by any capability in this feature.
- **FR-022**: No capability in this feature may re-encode, resize, or otherwise alter the visual quality of any copy that remains reachable.

### Key Entities

- **Media item**: A stored upload with a kind (still image, animated image, video, external embed). Owns a set of derived copies at fixed sizes, and for some kinds an original source file. Carries the record of what has already been reclaimed.
- **Derived copy**: One sized rendition of a media item. Reachable or unreachable depending on the media item's kind and which display surface requests it.
- **Post attachment link**: The ordered association between a post or comment and its media. Survives deletion of its parent, because deletion is a marking rather than a removal.
- **Personal animation library entry**: A user's saved animated item, referencing media that is deliberately attached to no post. A protecting reference for reclaim purposes.
- **Reclaim run**: One execution of a reclaim capability, in preview or live mode, producing counts of items examined, files removed, bytes freed, and failures.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No image visible anywhere in the product changes in appearance, dimensions, or sharpness as a result of this feature — verified across inline display, galleries, full-size viewing, and the personal animation library.
- **SC-002**: Newly uploaded media occupies measurably less storage than an identical upload before this feature, with no visible difference.
- **SC-003**: The operator can state, before committing to any deletion, the exact number of files and total bytes each reclaim would free.
- **SC-004**: Total media storage measurably decreases after the reclaims run, and the operator can attribute the reduction to each waste class separately.
- **SC-005**: Zero broken images are served during or after a reclaim, including to readers whose pages were loaded before it ran.
- **SC-006**: Content restored by an administrator inside the grace period displays with all of its media intact, in 100% of cases. Content restored after the grace period returns as text-only with zero broken images.
- **SC-007**: Unbanning a user restores that user's content with all media intact, in 100% of cases.
- **SC-008**: No media belonging to a personal animation library is ever removed.
- **SC-009**: Every reclaim can be interrupted at any point and re-run to completion with the same end state and no data loss.
- **SC-010**: Storage growth per newly uploaded item is lower than before this feature, measured over a comparable sample.

## Assumptions

- **Banned content is retained.** Media referenced only by content removed via ban is never reclaimed. The unban path restores that content wholesale, so reclaiming it would make unbanning lossy. This is the conservative reading of the project's data-preservation principle.
- **Safety window for never-published media defaults to 7 days.** Long enough to cover a composer left open across a weekend, short enough that abandoned uploads do not accumulate. Configurable.
- **Grace period for deleted content defaults to 7 days**, matching the never-published window so operators reason about one number rather than two. Configurable independently. This implements decision D1's "a few days" as a concrete default; lowering it to 3 changes no requirement.
- **Database records are always retained.** Even for media that was never published, only files are reclaimed. This keeps the feature uniformly file-only, avoids referential surprises, and keeps the reclaim reversible in the sense that history remains auditable. Records are small relative to files.
- **Video and external embeds are unaffected by the unreachable-copy work.** That work concerns image copies only. Video and embeds are still subject to the association-based reclaim.
- **Preview mode is the default posture for the one-time reclaim.** An operator must opt in explicitly to destructive execution.
- **Reclaim is irreversible.** Lossless originals are already discarded shortly after upload by existing behaviour, so a removed copy cannot be regenerated. Every requirement here is written on that basis.
- **The existing scheduled-job mechanism is reused** for the recurring reclaim rather than introducing new infrastructure.
- **"Unreachable" was determined by auditing current display surfaces.** Per decision D2 this risk is accepted: if a future feature wants a removed copy, it cannot be regenerated for any existing image.

## Dependencies

- The existing scheduled background-job mechanism and its operational dashboard.
- The existing administrator restore capability for posts, comments, and unbanning, whose fidelity this feature directly affects.
- The existing media-serving layer, which must provide the fallback required by FR-019.
- The project constitution's data-preservation principle, which governs Q1 and may require an amendment or an explicit documented exception.

## Resolved Decisions

### D1: Media behind deleted content is reclaimed after a short grace period

**Decision**: Reclaim media for deleted content once a grace period of a few days has elapsed since deletion. Content restored after that point returns without its media, and that loss is accepted.

**Rationale**: Restore remains fully faithful for the window in which it is realistically exercised — a user or moderator reversing a recent decision. Beyond that, storage is worth more than perfect fidelity on content nobody has looked at in a week. The loss is made visible rather than silent (FR-014), so restore never produces a broken image.

**Consequence**: This requires amending the project constitution's data-preservation principle, which currently permits exactly one hard-delete exception. The amendment establishes that reclaiming media *files* while preserving all database records is permitted, and that restore is content-complete but not media-complete beyond the grace period. Ban-removed content remains exempt.

**Rejected**: never reclaiming (forfeits the largest single reclaim) and reclaiming immediately on deletion (makes routine, same-day restore lossy for no meaningful extra saving).

---

### D2: The smallest copy is removed for non-animated images

**Decision**: Stop generating it, and remove the ones already stored.

**Rationale**: It has no consumer on any current display surface, and the waste grows with every upload.

**Consequence**: Irreversible. Lossless originals are already discarded shortly after upload, so this copy can never be regenerated for any existing image. A future responsive-images or quality-downgrade feature would have it available only for uploads made after that feature ships. This trade-off is accepted deliberately.

**Rejected**: retaining it as future-proofing (forfeits the reclaim and lets the waste keep growing for a benefit no planned feature currently requires).
