# Feature Specification: Original-Quality Image Uploads

**Feature Branch**: `003-original-quality-uploads`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "I want that user could upload pictures (jpg, png) without losing original image quality. There should be some sensible limit in size but otherwise the quality should remain the same. After 24 hours image quality should be downgraded to usual process (converted to webp with compression)"

## Clarifications

### Session 2026-07-13

- Q: What maximum file size should an original-quality JPG/PNG upload allow before rejection? → A: 10 MB (env-configurable)
- Q: Where should the full original-quality image be served during the first 24 hours? → A: Full/opened (zoomed) view only; feed cards use a scaled preview
- Q: How should image metadata be handled for original-quality uploads? → A: Strip privacy-sensitive metadata (GPS/location, camera identifiers) while keeping pixel data fully lossless

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Post a picture at full original quality (Priority: P1)

A user attaches a JPG or PNG image to a shout (or comment) and publishes it. Provided the file is within the size limit, the image is stored and displayed exactly as the user provided it — no visible loss of quality, sharpness, or color — for everyone who views the post during the first 24 hours.

**Why this priority**: This is the core value of the feature. Without it, nothing changes for the user. It delivers a standalone, demonstrable improvement — high-fidelity images — the moment it ships.

**Independent Test**: Upload a detailed JPG and a detailed PNG within the size limit, publish them, and view the resulting posts. The displayed images are visually indistinguishable from the source files (fine detail, gradients, and text remain crisp).

**Acceptance Scenarios**:

1. **Given** a user with a valid session composing a shout, **When** they attach a JPG within the size limit and publish, **Then** the published shout shows the image at its original quality with no lossy re-compression.
2. **Given** a user attaching a PNG within the size limit, **When** they publish, **Then** the image is displayed at original quality to the author and to all other viewers.
3. **Given** a freshly published original-quality image, **When** any viewer opens the image at full size within 24 hours of upload, **Then** they receive the original-quality version (feed cards may show a scaled preview).

---

### User Story 2 - Automatic downgrade to compressed format after 24 hours (Priority: P2)

Twenty-four hours after an original-quality image was uploaded, the system automatically converts it through the usual pipeline (WebP with compression) and serves the compressed version from then on. The change is invisible to users: the post keeps working and the image reference stays valid.

**Why this priority**: This bounds long-term storage cost so the feature is sustainable. It is a distinct, independently testable slice that can ship after P1 without changing the upload experience.

**Independent Test**: Upload an original-quality image, advance time (or the scheduled trigger) past the 24-hour mark, and confirm the post now serves a compressed WebP version while the post and its image reference remain valid.

**Acceptance Scenarios**:

1. **Given** an original-quality image uploaded 24 hours ago whose post still exists, **When** the conversion runs, **Then** the image is replaced by a compressed WebP version and subsequent views serve the compressed version.
2. **Given** an image that has been converted to WebP, **When** any viewer opens the post, **Then** the image reference still resolves and the post renders correctly with the compressed image.
3. **Given** a successful conversion, **When** the WebP version is confirmed stored, **Then** the original full-size file's storage is reclaimed.

---

### User Story 3 - Clear feedback when a picture is too large (Priority: P3)

When a user tries to attach a picture larger than the allowed size limit, the system rejects it before publishing and explains, in Russian, that the file is too large and what the limit is — so the user can resize or choose a different file.

**Why this priority**: Prevents a confusing failure mode introduced by allowing larger original files. Valuable but secondary to the happy path; the feature is usable without it, just less friendly.

**Independent Test**: Attempt to attach a picture that exceeds the size limit and confirm a clear Russian error message is shown, the upload is rejected, and nothing is stored or published.

**Acceptance Scenarios**:

1. **Given** a user attaching a picture larger than the size limit, **When** they try to upload it, **Then** the upload is rejected with a clear Russian message stating the maximum allowed size.
2. **Given** a rejected oversized upload, **When** the rejection occurs, **Then** no partial or corrupted file is stored and the compose flow lets the user pick another file.

---

### Edge Cases

- **File exactly at the limit**: a file whose size equals the limit is accepted; only files strictly above the limit are rejected.
- **Non-JPG/PNG uploads** (e.g., existing WebP, GIF, animated content): follow the current behavior unchanged; they are not treated as original-quality candidates.
- **Post/comment deleted before 24 hours**: the pending conversion is skipped or safely cancelled; no orphaned work runs against removed content.
- **Conversion fails** (corrupt data, processing error, resource limit): the original is retained and continues to be served; the conversion is retried; the image is never lost.
- **Server restart during the 24-hour window**: pending conversions survive restarts and still run at (or shortly after) their due time.
- **Very large pixel dimensions but small file size**: covered by the standard pipeline's existing dimension handling during the eventual WebP conversion; the original is still served during the first 24 hours.
- **Corrupted or invalid image file at upload**: rejected at upload with a clear Russian message; nothing is stored.
- **Viewer requests the image at the 24-hour boundary**: the system serves a consistent version (either original or converted), never a broken or missing reference, during the transition.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept JPG and PNG image uploads and store them without lossy re-encoding for the initial retention window, preserving the original pixel data as provided by the user.
- **FR-002**: System MUST enforce a maximum file size for original-quality uploads and reject any file above that limit before it is stored or published.
- **FR-003**: When an upload is rejected for exceeding the size limit or for being an invalid/corrupt image, System MUST return a clear Russian-language message (with correct declensions) and MUST NOT store a partial or corrupted file.
- **FR-004**: For 24 hours following the upload, System MUST serve the original-quality version of the image to any viewer who opens the image at full size (opened/zoomed view). Feed and inline listing surfaces MAY use a scaled-down preview during this window; the full-size opened view MUST deliver the original quality.
- **FR-005**: Twenty-four hours after upload, System MUST automatically convert the image through the standard pipeline (WebP with compression) and serve the compressed version thereafter, with no user action required.
- **FR-006**: The conversion MUST be transparent to end users — existing image references/URLs for the post MUST continue to resolve, and the post MUST continue to render correctly after conversion.
- **FR-007**: After a conversion is confirmed successful, System MUST reclaim the storage occupied by the original full-size file, retaining the compressed WebP version.
- **FR-008**: If the associated shout or comment is removed before the 24-hour mark, System MUST skip or cancel the pending conversion for that image.
- **FR-009**: If a conversion fails, System MUST keep serving and retaining the original image, retry the conversion, and MUST NOT lose the image under any failure.
- **FR-010**: System MUST continue to enforce the single-media-per-post/comment rule; the original-quality path applies to that single image and MUST NOT allow an additional media item.
- **FR-011**: The maximum original-quality file size MUST be configurable via environment configuration rather than hardcoded in business logic.
- **FR-012**: Rate limiting on the upload path MUST continue to behave correctly for both authenticated and unauthenticated states (falling back to IP-based limiting when unauthenticated).
- **FR-013**: System MUST strip privacy-sensitive metadata (e.g., embedded GPS/location and camera identifiers) from stored images so that neither the original-quality nor the converted version exposes it.

### Key Entities *(include if data involves data)*

- **Uploaded image asset**: represents a single image attached to a shout or comment. Key attributes: current serving format (original vs. compressed WebP), original file size, upload timestamp, conversion status, and the reference to its owning shout/comment. Governed by the single-media-per-post/comment rule.
- **Scheduled downgrade job**: a deferred task tied to an original-quality image, due 24 hours after upload, that performs the WebP conversion, marks the asset converted, and reclaims the original's storage. Must survive restarts and be cancellable when the owning content is removed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A JPG or PNG uploaded within the size limit is served at original quality — visually indistinguishable from the source file — in the full-size opened view for the full 24 hours after upload.
- **SC-002**: At least 99% of eligible images are converted to compressed WebP within 15 minutes of their 24-hour deadline.
- **SC-003**: 100% of uploads exceeding the size limit are rejected with a clear Russian message, and no oversized or partial file is stored.
- **SC-004**: After conversion completes, long-term storage per image returns to the compressed baseline — no original full-size file older than roughly 24 hours (plus the conversion window) remains stored.
- **SC-005**: Zero images are lost as a result of the conversion process, including across conversion failures and server restarts.
- **SC-006**: The 24-hour transition is seamless to users — 0 broken or missing images are observed for posts whose images have been converted.

## Assumptions

- **Size limit default**: The maximum original-quality upload size is 10 MB, chosen to fit high-quality phone/camera JPGs and typical PNGs while bounding storage and bandwidth. The exact value is environment-configurable (FR-011) and can be tuned without code changes.
- **Serving surface**: Original quality is delivered in the full-size opened/zoomed image view. Feed and inline listing surfaces may serve a scaled-down preview during the 24-hour window, since perceived quality matters when the user opens/zooms the image (FR-004).
- **Retention window**: The original-quality window is exactly 24 hours measured from the moment of upload (not from post edits or views).
- **Scope of "original quality"**: "Without losing quality" means no lossy re-encoding and no downscaling of images within the size limit. Stripping privacy-sensitive metadata (FR-013) is not considered a quality loss.
- **Applies to new uploads only**: The feature applies to newly uploaded JPG/PNG images after release; already-stored (already-compressed) images are not retroactively restored to original quality.
- **Supported formats**: Only JPG and PNG are eligible for the original-quality path. Other formats (e.g., GIF, WebP, YouTube embeds) follow existing behavior unchanged.
- **Reuse of existing pipeline**: The 24-hour downgrade reuses the project's existing WebP conversion/compression process rather than introducing a new one; the standard pipeline's dimension/format handling applies at conversion time.
- **Scheduling infrastructure**: A durable background-job/scheduling mechanism is available to run the deferred, restart-surviving 24-hour conversion.
