# Phase 0 Research: Time-Limited Media Retention

All Technical Context unknowns are resolved. Findings below are grounded in the current tree, not assumed.

---

## R1 — Reuse `performReclaim`; build no new removal mechanism

**Decision**: Both sweeps route every removal through the existing `performReclaim` in `workers/src/helpers/reclaim.ts`.

**Rationale**: Its `RemovalPlan` already carries exactly what this feature needs:

| Field | Image expiry (US1) | Video expiry (US2) |
|---|---|---|
| `filesToRemove` | `["1600.webp"]` | `["original.mp4"]` |
| `survivor` | `"960.webp"` | `null` |
| `markerPatch` | `{ variants: ["1600"] }` | `{ video: true }` (new, see R6) |

The mandated ordering — verify survivor, size the doomed files, persist the marker, *then* unlink — is FR-018 verbatim, and the compare-and-set on the whole `media_meta` blob is what keeps these sweeps from clobbering `original-downgrade`, which rewrites the same column hourly from another process. Reimplementing this would duplicate the one piece of the codebase most expensive to get wrong.

**Alternatives considered**: A standalone removal path per class — rejected; it would fork the crash-safety ordering into three places. Extending `media-reclaim.ts` with a third class — rejected; that job's candidate query and its `classifyReferences` gate are about *reachability*, and age-based expiry deliberately ignores reachability (D4), so the two would fight.

---

## R2 — Image expiry MUST skip media still pending original-quality downgrade

**Decision**: Skip any image whose meta has `orig` set and `converted !== true`, counting it under a dedicated `pendingOriginal` skip reason.

**Rationale**: This is the sharpest hazard found. `original-downgrade.ts` refuses to unlink the lossless original unless `1600.webp` is confirmed present and non-empty:

```js
if (!fileSystem.existsSync(webpPath) || fileSystem.statSync(webpPath).size === 0) {
  throw new Error(`1600.webp missing or empty for media ${m.id}`);
}
```

If the image-expiry sweep removes `1600.webp` first, that check throws **forever**. The consequence is not a lost image — it is worse than a no-op:

- `meta.orig` is never cleared, so `buildMedia` keeps `pendingOriginal` true and keeps advertising `full: /media/{id}/{orig}`;
- the original — far larger than the `1600.webp` just reclaimed — is never unlinked, so the sweep *increases* net storage for that item;
- the hourly downgrade job logs a failure for that media on every run, forever.

Ordering normally saves us (24h quality window ≪ 7d retention window), but the spec explicitly contemplates a retention window shorter than the quality window as an operator error that must "fail safely". The skip guard makes it genuinely safe: such an image is simply never expired, and the skip reason says why.

This also satisfies FR-005's three-stage requirement structurally — an image cannot enter stage 3 (display copy only) until stage 2 (`converted: true`, `full` → `1600.webp`) has actually completed.

**Alternatives considered**: Making `original-downgrade` tolerate a missing `1600.webp` — rejected; that check is the guard that keeps it from destroying the last usable copy. Having image expiry unlink the original itself — rejected; it would duplicate downgrade's responsibility and its `orientation`/`orig` meta bookkeeping.

---

## R3 — `buildMedia` must consult `reclaimed.variants`; today it ignores it

**Decision**: The still-image branch drops `full` when the marker records `1600` as reclaimed.

**Rationale**: `api/src/helpers/media.js` currently reads the marker only through `isMediaReclaimed`, which tests `reclaimed.files === true`. The `reclaimed.variants` array is written by feature 008 and **read by nothing**. That was harmless there: 008 only removes variants no surface advertises (`320` from still images, `1600` from animated). It stops being harmless the moment a *reader-visible* variant is expired — `buildMedia` would keep advertising `full: /media/{id}/1600.webp` for a file that is gone, violating FR-003.

nginx would mask it (the `320|960|1600` location degrades to `960.webp`), so nothing would visibly break — which is precisely why this must be fixed deliberately rather than left to the fallback. FR-003 is a promise about what the system *advertises*, and D3 assigns the fallback the narrower job of protecting already-cached addresses.

**Alternatives considered**: Relying solely on the nginx degrade and leaving `buildMedia` alone — rejected; it silently violates FR-003 and leaves clients fetching a 1600-sized address that returns a 960-sized body with no signal.

---

## R4 — The frontend reads `.full` unguarded; it needs a fallback

**Decision**: Every consumer falls back to the display copy (`url`) when `full` is absent.

**Rationale**: Three call sites read it directly, and none tolerates `undefined`:

- `web/components/Lightbox.tsx:98` — `activeSrc = activeItem ? activeItem.full : (src as string)`
- `web/components/ShoutCard.tsx:1438` — single-image lightbox source
- `web/components/ShoutCard.tsx:931` — the same for a comment's image

`full` is already optional in `web/types.ts:24` (animated images never carry it), so the type permits `undefined` and the code simply does not handle it. Dropping `full` per R3 without this change hands `<img>` a `src` of `undefined` — a broken picture, violating FR-007 and §III's "MUST NEVER render as a broken image".

A gallery of mixed ages is the case that makes this non-optional: some members carry `full`, some do not, and paging between them must not flicker or fail (spec Edge Cases).

**Alternatives considered**: Having `buildMedia` keep `full` pointing at `960.webp` — rejected; it would report a full-size address that is really the display copy, misleading callers and violating FR-007's "MUST NOT imply a resolution the file does not have".

---

## R5 — Video placeholder is delivered at two layers

**Decision**: DTO marks expiry (card renders the tombstone); nginx answers stale cached addresses with a `no-store` placeholder.

**Rationale**: Matches the clarified FR-011. The nginx half needs one subtlety: `try_files` performs an *internal redirect*, which re-runs location matching, so a fallback landing back in the regex `\.(webp|…|mp4)$` location would inherit `Cache-Control: immutable` — exactly what FR-012 forbids. An **exact-match** location wins over regex locations in nginx, so the placeholder gets its own headers:

```nginx
location ~* ^/.+\.mp4$ {          # split out of the shared extension location
    ...
    try_files $uri /_deleted.mp4;
}

location = /_deleted.mp4 {
    root /assets;
    add_header Cache-Control "no-store";
    add_header X-Content-Type-Options "nosniff";
}
```

> *Amended 2026-08-20*: two corrections. The fallback must live on an **mp4-only** location — on the shared `(webp|…|gif|mp4)` location it would answer a stale `original.gif` with an MP4 body under an image URL, which `nosniff` makes unrecoverable. And the asset is committed at `media-assets/_deleted.mp4` and mounted at `/assets`, not placed at the media volume root: that volume is populated only by uploads, is mounted `:ro` on the media service, and no service has a build context, so nothing would ever have put a file there.

Because the fallback only fires when the real file is absent, and carries `no-store`, FR-012's second clause — never retained under the address of a video still present — holds by construction.

**Alternatives considered**: `error_page 404 = @placeholder` — equivalent, but `try_files` already exists in this file and reads consistently with the WebP rule directly above it. A DTO-only approach was rejected during clarification.

---

## R6 — Video expiry gets its own marker field, not `variants`

**Decision**: Extend `ReclaimedMarker` with `video?: boolean`; `mergeReclaimed` carries it through alongside `variants` and `files`.

**Rationale**: `variants` is documented and used as "variant widths whose `.webp` files were removed" and is keyed by width strings. Pushing `"original.mp4"` into it would break that contract for every existing reader and for the accumulate-across-runs `Set` union. A separate boolean is honest and keeps FR-022's three states cleanly distinguishable:

| Marker state | Meaning | `buildMedia` result |
|---|---|---|
| `variants: ["1600"]` | full-size copy expired | image DTO **without** `full` |
| `video: true` | mp4 expired | video DTO with `expired: true`, no `url` |
| `files: true` | wholesale reclaim (008) | `undefined` — attachment disappears |

The last row is why FR-022 exists: reusing `files: true` for expiry would make every month-old video post lose its attachment entirely rather than show a tombstone.

**Alternatives considered**: A generic `expired: string[]` covering both classes — rejected; images already have a correct home in `variants`, and a second overlapping list invites drift.

---

## R7 — Hardcoded windows, not configuration

**Decision**: Two constants in `workers/src/helpers/retention.ts` — `IMAGE_RETENTION_DAYS = 7`, `VIDEO_RETENTION_DAYS = 30` — imported by both sweeps. No environment variables, no Compose entries, no `.env.example` entries, no resolver.

> *Superseded 2026-08-20*: this decision previously specified required env vars with a strict throwing resolver (itself an amendment of an earlier defaults-based design). Both versions solved a problem the feature does not have. These windows are a product decision with one right answer everywhere; nobody tunes them per environment or at runtime, so the configuration surface bought nothing and cost a resolver, its tests, three Compose entries, and two operator-validation tasks.

**Rationale**: The established convention is `Number(process.env.X) || DEFAULT` (`media-reclaim.ts:35-36`). It is dangerous for this feature and the failure mode is severe: `Number("-1") || 7` is `-1`, which survives the `||`, and a negative window puts the age cutoff *in the future*, making every file — including today's uploads — eligible for irreversible removal. Zero and unparseable values silently become the default instead, hiding operator error.

A constant sidesteps that entire class of bug rather than defending against it. There is no string to coerce, so `Number("")` being `0` cannot bite; no unset variable, so Compose's empty-string substitution cannot bite; no fallback, so no silent default. FR-015a's fail-closed guarantee holds by construction — the value is a literal the type checker validates and a reviewer reads in the diff.

**Constraint this creates**: if a later feature does need per-environment windows, the strict resolver must come back with it. Reading these from the environment with the house convention would reintroduce the worst bug available in this feature.

**Alternatives considered**: Required env vars with a throwing resolver — rejected as machinery out of proportion to a value that never changes. Env vars with defaults — rejected twice over: it conflicts with Constitution §III's fail-closed rule *and* is the exact `|| DEFAULT` shape that lets `-1` through. Clamping to a floor — rejected during clarification; still sweeps under an unintended window.

---

## R8 — Two independent jobs, not one combined sweep

**Decision**: Two queues, two workers, two schedules, sharing `retention.ts` and `performReclaim`.

**Rationale**: The spec assumes the sweeps are "independent of each other … and may run on separate schedules". Separation gives per-class reporting for free (FR-020), lets a video-sweep failure leave image expiry running, and lets the windows be tuned and previewed independently (US3). It also matches the existing one-job-per-queue shape in `queues.ts`.

**Schedule**: both after the 02:00 db-backup, staggered clear of the 03:00 `media-reclaim`, so a day's snapshot always precedes that day's removals — the same reasoning already recorded in `scheduler.ts`:

- `image-variant-expiry` — `0 4 * * *`
- `video-expiry` — `30 4 * * *`

**Alternatives considered**: One sweep with a class parameter — rejected; it would force a shared schedule and entangle the two failure domains for no gain.

---

## R9 — Batching and preview reuse existing shapes

**Decision**: `take`/`cursor` paging at 500 per batch, and `dryRun` threaded through exactly as `media-reclaim` does.

**Rationale**: `performReclaim` already short-circuits on `dryRun` after sizing the doomed files, returning `bytesFreed` without touching disk — FR-021 needs no new machinery. Cursor paging (not `skip`/`offset`) matters for the same reason it does in `media-reclaim`: the candidate set does not self-empty, because protected and skipped media stay candidates on every run. Batching satisfies FR-019 and SC-007.

**Alternatives considered**: Loading all candidates like `original-downgrade` does — rejected; that job's candidate set shrinks to near-empty each run, while this one faces the full historical backlog on day one.

---

## R10 — Pre-existing defect, noted and left alone

`buildMedia` advertises `thumb: /media/{id}/320.webp` for every video (`api/src/helpers/media.js:243`), but `upload.js:57-88` writes only `original.mp4` and `meta.json` for a video upload — there is no ffmpeg in the pipeline and the code comments say so. The address 404s (nginx degrades `320.webp` → `960.webp`, also absent for video). Nothing in `web/` consumes it.

The spec puts this Out of Scope. It is recorded here because it constrains the video work: **the tombstone cannot use a poster**, and any future task that starts reading `media.thumb` for video must write the file first.
