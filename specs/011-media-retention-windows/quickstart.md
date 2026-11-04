# Quickstart: Validating Time-Limited Media Retention

Runnable validation for each user story. Details live in [contracts/](./contracts/) and [data-model.md](./data-model.md) — this file is the run guide.

> **Gate**: the constitutional amendment described in [plan.md](./plan.md) must be ratified before any of this is implemented. These scenarios validate the built feature; they do not authorise building it.

## Prerequisites

```sh
make install
make local                       # Docker local dev on :3006, isolated volumes
```

Both sweeps are injectable (`now`, `retentionDays`, `fileSystem`, `db`), so unit tests need no clock manipulation. The manual runs below use a **short window** rather than a fake clock, because that is what an operator can actually do against a live volume.

---

## US1 — Image full-size copy expiry (P1)

**Setup**: publish a post with a still photo. Confirm both variants exist and note the full-size address.

```sh
docker compose -f docker-compose.local.yml exec media-nginx ls /media/<mediaId>
# expect: 960.webp  1600.webp  meta.json
curl -sI http://localhost:3006/media/<mediaId>/1600.webp | head -3
```

**Preview first** (FR-021 — changes nothing):

```sh
docker compose -f docker-compose.local.yml exec workers \
  node -e "import('./dist/jobs/image-variant-expiry.js').then(m => m.runImageVariantExpiry({ retentionDays: 0.0001, dryRun: true }).then(r => console.log(r)))"
```

Expect a non-zero `scanned`/`reclaimed` and a `bytesFreed` figure, and `1600.webp` still on disk.

**Run for real**, then verify the four things that matter:

| Check | Expected |
|---|---|
| `ls /media/<mediaId>` | `1600.webp` gone, `960.webp` present |
| Feed renders the post | Identical to before — inline is `960.webp` (FR-002) |
| Open the image full-size | Opens, shows the image, zoom and gallery paging work (FR-007) |
| API response for the post | Image object has **no** `full` key (FR-003) |
| `curl -sI .../1600.webp` | `200`, not `404` — degrades to 960 (FR-006) |

**Negatives**:

- Publish a *fresh* photo, re-run → skipped as `inWindow`, opens at full resolution.
- Publish an animated GIF, run with any window → nothing removed, plays everywhere (FR-004).
- Re-run the sweep → `reclaimed=0`, `bytesFreed=0`, all `alreadyExpired` (FR-017, SC-006).

**The composition case (research R2)** — the one most likely to regress:

1. Upload at original quality; confirm `meta.orig` set and `converted` unset.
2. Run image expiry **before** the downgrade window elapses.
3. Expect: skipped as `pendingOriginal`, `1600.webp` untouched.
4. Let `original-downgrade` run; confirm it converts cleanly and unlinks the original.
5. Now run image expiry; `1600.webp` is removed and `full` disappears.

If step 3 removes the file instead, `original-downgrade` will fail on this media forever and the original will never be reclaimed — a net storage *loss*.

---

## US2 — Video expiry (P2)

**Setup**: publish a post with an MP4. Note the post's likes and comments.

```sh
curl -sI http://localhost:3006/media/<mediaId>/original.mp4 | head -3
# expect 200, Cache-Control: ... immutable
```

**Run** the video sweep with a short window, then verify:

| Check | Expected |
|---|---|
| `ls /media/<mediaId>` | `original.mp4` gone, `meta.json` present |
| Post opens as a reader | Russian deleted-content tombstone, no player, no spinner, no error (FR-011, FR-013) |
| Post text, likes, comments | Unchanged (FR-013, SC-005) |
| API response | `{ type: "video", expired: true }`, no `url` |
| `curl -sI .../original.mp4` | `200`, `Cache-Control: no-store`, placeholder body (FR-012) |
| Author views own post | Same tombstone, no separate notice (FR-014) |

**Negatives**:

- Publish a second video inside the window → plays normally.
- Animated GIF and a personal-library GIF at any age → untouched (FR-010).
- A YouTube-embedding post → completely unchanged (FR-010).
- Admin restore/moderate the post → text and interaction history complete, only the video gone (SC-005).

---

## US3 — Operator tooling (P3)

**Window values** (FR-015): both windows are constants in `workers/src/helpers/retention.ts` — `IMAGE_RETENTION_DAYS = 7`, `VIDEO_RETENTION_DAYS = 30`. Changing one is an edit plus a rebuild:

```sh
docker compose -f docker-compose.local.yml up -d --build workers
```

Re-run both previews and confirm the candidate set changes accordingly.

**Guard against reintroducing configuration** (FR-015a, SC-009): grep the worker sources for `RETENTION_DAYS` and confirm no hit reads `process.env`. The windows must not become environment-driven without a strict fail-closed resolver coming back with them — `Number("-1") || 7` is `-1`, and a negative window places the cutoff in the future, making every video including today's uploads eligible for irreversible removal.

**Report legibility** (FR-020): trigger from Bull Board at `http://localhost:3001/workers`. Check **both** sweeps, not just the image one — confirm each has its Logs tab and its Return Value tab populated, and that a run with nothing due still logs, with `retained` explaining every skip.

**Batching** (FR-019, SC-007): with a backlog present, browse the feed while a sweep runs and confirm no perceptible degradation.

**Interruption** (FR-018, SC-008): kill the workers container mid-sweep, restart, re-run. Expect at most an unreferenced stray file, and zero addresses resolving to nothing.

---

## Automated tests

```sh
make test-workers    # sweep logic, retention parsing, marker merging
make test            # buildMedia DTO shape
make test-web        # Lightbox / ShoutCard fallback and tombstone
make test-all
```

Tests run **sequentially** — no `describe`-level parallelism, no shared mutable state between files.

Coverage to assert:

- `retention.ts`: nothing to test — two constants, no branches. The windows are exercised through the sweeps, which take `retentionDays` as an injectable dep defaulting to the constant.
- `mergeReclaimed`: `video` carried through; `variants` still unions across runs; `files` still dominates.
- Both sweeps: each skip reason reachable and counted; `dryRun` frees nothing; re-run is a no-op; CAS mismatch counts `raced`, not `failed`.
- `buildMedia`: `full` omitted on `variants:["1600"]`; video `expired` shape; `files:true` still returns `undefined`.
- Lightbox/ShoutCard: absent `full` falls back to `url`; a mixed-age gallery pages end to end; expired video renders the tombstone, never a `<video>` with an undefined `src`.
