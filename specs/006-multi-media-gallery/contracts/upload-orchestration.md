# Contract: Client-side multi-upload orchestration

**Feature**: 006-multi-media-gallery | **Stage**: 1 (revised 2026-07-30)

> **Revision 2026-07-30**: Upload timing moved from selection-time to
> submit-time, and submission is now atomic. This directly reverses the
> orchestration this contract originally described — see `research.md` D14 for
> why, and D2 for the (now superseded) original reasoning. The endpoint itself,
> and every per-file validation/permission/rate-limit rule below it, are
> **unchanged** — only *when* the client calls it changes.

There is **no new upload endpoint**. This contract governs how the client drives
the existing per-file `POST /api/v1/upload/media` to build a gallery, and where
each spec requirement is satisfied.

## Endpoint (unchanged)

```
POST /api/v1/upload/media
Content-Type: multipart/form-data; field name "file"
→ 200 { "mediaId": "uuid", … }
→ 400 { "error": "<Russian>" }   // bad type, oversized, decode failure
→ 403 { "error": "Вам запрещено прикреплять медиафайлы" }   // feature 005
→ 429 { "error": "Слишком много загрузок. Подождите немного" }
```

Per-file validation, `sharp` variant generation, EXIF stripping and the
original-quality window are all inherited untouched (FR-007, FR-010).

## Orchestration sequence

```
1. User selects/drops F files
2. CAPACITY GATE  (FR-033)
     if attached.length + F.length > 5:
         reject the ENTIRE action — nothing added, attached list unchanged
         show Russian message naming the limit
         STOP
3. CLIENT-SIDE PRE-VALIDATION  (FR-034, client-checkable subset only)
     for each file: check type + size locally, no network call
     failing files → rejected individually, reported by name and reason
     passing files → held client-side as { file, objectUrl }, appended to the
       pending list in selection order — NOT yet uploaded to the server
4. Pending tiles render from objectUrl; each is individually removable
   (FR-024) and individually openable in Lightbox on that objectUrl (FR-037) —
   all of this is pure client state, no network calls
5. On submit:
     a. Upload every pending file's { file } to POST /upload/media, in
        parallel (research D15) — reusing any mediaId already obtained from a
        prior failed attempt for that same file rather than re-uploading it
        (research D16)
     b. If EVERY upload succeeds: call POST /shouts|/comments with
        mediaIds = the resulting ids, in pending order. This is the only case
        that creates or posts anything.
     c. If ANY upload fails (bad file, transient storage error, 403 permission
        revoked, 429 rate limited): make NO create call. Nothing is posted.
        Report which file(s) failed and why. Leave every pending item and all
        composed text exactly as arranged. Offer a "Try again" action that
        re-runs step 5 against the same pending list.
```

## Why the capacity gate and client-side pre-validation still happen before submit

Rejecting an over-limit action, and rejecting an obviously-bad file (wrong type,
too large), are both detectable **without any network call** — so there is no
reason to defer them to submit-time; doing so immediately gives the user
feedback while composing, before they've invested any more effort. This is
unrelated to the upload-timing change: FR-033/FR-034's client-checkable half was
never about server round trips. The server's `max(5)` check (R2 in
[shout-comment-create.md](./shout-comment-create.md)) remains the authoritative
backstop for non-browser clients.

## Error reporting requirements

| Condition | When detected | Behavior |
|---|---|---|
| Over capacity | Selection/drop time | Whole action rejected, nothing added to pending, one message stating the 5-item limit |
| One file wrong type or oversized | Selection/drop time (client-side) | That file reported by name and reason; other files in the same batch still become pending |
| **Video inside a multi-file batch** | Selection/drop time | Rejected and reported by name; other files still become pending. Video is not gallery-eligible (FR-028, invariant I4) |
| **Video selected alone, nothing else attached** | — | Follows today's existing single-attachment path unchanged — this feature does not alter single-video behavior |
| One file fails to actually upload (transient storage error) | Submit time | **Whole submit fails** — no partial attach, no create call (FR-041) |
| `403` media restriction | Submit time | Whole submit fails identically; nothing attaches, nothing posts (FR-009) |
| `429` rate limited | Submit time | Whole submit fails; user sees the rate-limit message and can retry once the window clears |
| Retry after a failed submit | User-initiated | Re-runs upload for files without a `mediaId` yet; reuses `mediaId`s already obtained (research D16); succeeds and posts, or fails again with the same all-or-nothing behavior |

The key distinction from the pre-2026-07-30 contract: **selection-time**
failures (type/size) are still per-file and partial, exactly as before — nothing
about that layer changed. **Submit-time** failures (anything that used to be a
per-file upload-time failure) are no longer partial — they now block the entire
submission, because upload and creation happen together as one user action
instead of two independent ones.

Both composers' file inputs currently accept `video/mp4`
(`accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"`), so the video
case is reachable in normal use and must be handled explicitly at
selection/drop time rather than left to the server's R5 rejection — which would
otherwise only surface at submit, after the rest of the batch had already been
committed to uploading.

All copy is Russian. Counts require correct declension (`1 файл` / `2 файла` /
`5 файлов`) — a plural helper, not concatenation (Constitution II).

## Rate-limit budget

`uploadLimiter` = 100 uploads / 10 min / user, unchanged. A 5-image gallery
consumes 5 units in one burst at submit-time rather than spread across the
composing session — still ~20 full galleries per window. Accepted; monitor
after this revision ships (research D15).

## Known consequence: orphaned uploads — narrowed by this revision

A composer abandoned **without ever submitting** now uploads nothing at all —
this fully eliminates that previously-accepted orphan case (see `research.md`,
Known debt). The residual case is a submit that fails after some files already
uploaded, then is abandoned without retrying; retry itself never compounds this
further, since it reuses already-obtained `mediaId`s (D16) rather than
re-uploading. Net effect: orphan risk shrinks from "up to 5× the single-media
rate" back down to roughly the single-media baseline.
