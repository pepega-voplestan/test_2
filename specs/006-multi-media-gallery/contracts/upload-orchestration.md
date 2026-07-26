# Contract: Client-side multi-upload orchestration

**Feature**: 006-multi-media-gallery | **Stage**: 1

There is **no new upload endpoint**. This contract governs how the client drives
the existing per-file `POST /api/v1/upload/media` to build a gallery, and where
each spec requirement is satisfied. See `research.md` D2 for why a batch endpoint
was rejected.

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
         reject the ENTIRE action — upload nothing, attached list unchanged
         show Russian message naming the limit
         STOP
3. For each file, in order: POST /upload/media
     - requests may run concurrently, but results are reassembled
       into selection order before being appended
4. PARTIAL FAILURE  (FR-034)
     successes → appended to the pending list, in selection order
     failures  → reported individually, each with its filename and reason
     (a failure never discards a success)
5. On submit: POST /shouts|/comments with mediaIds = pending ids, in order
```

## Why the capacity gate must precede uploading

Uploads persist `Media` rows and files *before* the shout exists. If the count
were only checked at create time, a rejected over-limit action would already have
written files to disk. Gating on count first is what makes FR-033's "attach
nothing" literally true. The server's `max(5)` check (R2 in
[shout-comment-create.md](./shout-comment-create.md)) remains the authoritative
backstop for non-browser clients.

## Error reporting requirements

| Condition | Behavior |
|---|---|
| Over capacity | Whole action rejected, nothing uploaded, one message stating the 5-item limit |
| One file wrong type | That file reported by name; other files still attach |
| One file oversized | That file reported by name with the existing `oversizedMessage()` copy; others still attach |
| `403` media restriction | Every file fails identically; nothing attaches. Message is 005's existing copy |
| `429` rate limited | Remaining files fail; already-succeeded files stay attached |
| Network failure mid-batch | Treated as a per-file failure; successes retained |
| **Video inside a multi-file batch** | That file is rejected and reported by name; other files still attach. Video is not gallery-eligible (FR-028, invariant I4) |
| **Video selected alone, nothing else attached** | Follows today's existing single-attachment path unchanged — this feature does not alter single-video behavior |

Both composers' file inputs currently accept `video/mp4`
(`accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"`), so the video
case is reachable in normal use and must be handled explicitly rather than left
to the server's R5 rejection — which would otherwise happen only after the file
had already been uploaded and stored.

All copy is Russian. Counts require correct declension (`1 файл` / `2 файла` /
`5 файлов`) — a plural helper, not concatenation (Constitution II).

## Rate-limit budget

`uploadLimiter` = 100 uploads / 10 min / user, unchanged. A 5-image gallery
consumes 5 units → ~20 full galleries per window. Accepted; monitor after
Stage 1.

## Known consequence: orphaned uploads

Files uploaded into an abandoned composer are never reclaimed. This is
**pre-existing** behavior (one abandoned upload already orphans today); galleries
raise the rate up to 5×. Out of scope here — see `research.md`, Known debt.
