# Quickstart: Reclaim Unused Media Storage

**Feature**: 008-reclaim-unused-media

How to validate the feature end to end. Assumes `make install` has run.

---

## Step 0 — Repair the workers test harness (blocking)

`workers/tests/original-downgrade.test.ts` imports `vitest`, but
`workers/package.json` declares no `vitest` dependency and no `test` script.
The suite cannot currently run ([research D8](./research.md#d8)).

```sh
cd workers
npm pkg set scripts.test="vitest run"
npm install -D vitest
npm test          # establish a baseline for the EXISTING suite first
```

The existing suite's pass/fail state is unknown. Establish it before adding
anything, or a pre-existing failure will be misattributed to this feature.

---

## Step 1 — Measure before

The reclaim is irreversible, so capture a baseline you can compare against.
Run on the host holding the media volume:

```sh
M=$(docker volume inspect $(docker volume ls -q | grep -v dev | grep media | head -1) \
      --format '{{.Mountpoint}}')

du -sh "$M"
for f in 320.webp 960.webp 1600.webp original.gif original.mp4; do
  printf '%-14s ' "$f"
  find "$M" -name "$f" -type f -printf '%s\n' \
    | awk '{s+=$1;n++} END {printf "%8.1f MB  %6d files\n", s/1048576, n}'
done
```

Note the `grep -v dev` — this project has both `media` and `media-dev` volumes,
and picking the wrong one produces meaningless numbers.

This is a metadata-only walk (no file contents read), so it will not evict hot
media from page cache. On a spinning or shared disk, prefix with
`ionice -c3 nice -n19`.

---

## Step 2 — Verify the upload change (US1)

```sh
cd web && npm run dev     # API :3000 + Vite :5173
```

Upload one JPG and one animated GIF, then inspect what landed:

```sh
ls -la $MEDIA_PATH/<mediaId>/
```

| Upload | Expect present | Expect absent |
|---|---|---|
| JPG | `960.webp`, `1600.webp`, `original.jpg`, `meta.json` | `320.webp` |
| Animated GIF | `320.webp`, `960.webp`, `original.gif`, `meta.json` | `1600.webp` |

Then confirm nothing regressed visually: the image renders inline, opens in the
lightbox at full size, and the GIF animates inline and appears in the personal
GIF picker.

---

## Step 3 — Dry-run the one-time script (US1)

```sh
docker compose exec worker npx tsx src/scripts/reclaim-unreachable-variants.ts
```

Expect a report of files and bytes, and **zero** changes on disk. Verify by
re-running Step 1 and confirming identical totals.

Then execute, ideally staged:

```sh
docker compose exec worker npx tsx src/scripts/reclaim-unreachable-variants.ts --execute --limit 100
# verify the app still renders correctly, then run without --limit
```

Re-run afterwards: it must report nothing left to reclaim (FR-018).

---

## Step 4 — Verify the nginx fallback (FR-020)

The reason cached pages don't break. Request a variant that was just removed:

```sh
curl -sI http://localhost:3006/media/<staticImageId>/320.webp | head -1
```

Expect `200`, served from `960.webp` — not `404`.

---

## Step 5 — Verify the recurring job (US2, US3)

Unit tests first — they use injected fakes, so no DB or Redis is needed:

```sh
cd workers && npm test
```

The cases that matter most, in descending order of blast radius:

1. **Personal GIF library is never reclaimed.** Media referenced only by an
   active `user_gifs` row survives. This is the most destructive possible bug
   in the feature ([research D9](./research.md#d9)).
2. **Banned content is never reclaimed.** `is_deleted=2` protects its media.
3. **Shared media is retained.** Referenced by one deleted and one live post →
   retained.
4. **Grace periods hold.** Just inside the window → untouched; just outside →
   reclaimed.
5. **Crash safety.** DB marker written before `unlink`; a missing file at
   unlink time counts as success.
6. **Rows survive.** After reclaim, `media` and join rows still exist.

Then end-to-end against the local stack:

```sh
make local
# publish a shout with an image, delete it, then force the sweep:
docker compose -f docker-compose.local.yml exec worker-dev \
  npx tsx -e "import('./src/jobs/media-reclaim.js').then(m => m.runMediaReclaim({ deletedGraceDays: 0, dryRun: true }))"
```

`dryRun: true` first, always.

---

## Step 6 — Verify restore degrades visibly (FR-014)

The behaviour the constitution amendment specifically authorises.

1. Publish a shout with an image; delete it.
2. Run the sweep with `deletedGraceDays: 0` and `dryRun: false`.
3. Restore the shout via the admin panel (Вопли → restore).
4. **Expect**: the shout returns with its text, no media, and **no broken image
   icon**. The media object is omitted from the payload entirely
   ([contract C2](./contracts/media-dto.md#c2--reclaimed-media-is-omitted-not-broken)).

Repeat with a deleted-then-restored shout *inside* the grace period and confirm
its media is fully intact — the other half of SC-006.

Admin changes carry extra risk: any uncaught error in `admin.js` exits the
process with code 1 in production. Exercise restore locally before deploying.

---

## Step 7 — Verify the publish guard (FR-013)

1. Attach media in the composer; do not publish.
2. Run the sweep with `unpublishedGraceDays: 0` and `dryRun: false`.
3. Submit the still-open composer.
4. **Expect**: a Russian error message, and no post created with broken media.

---

## Step 8 — Measure after

Re-run Step 1. Compare against the baseline and attribute the reduction to each
class separately (SC-004). Confirm zero 404s for `.webp` under `/media/` in the
nginx access log (SC-005).

---

## Rollback

There is none for the files — originals are already gone 24h after upload, so
nothing can be regenerated. This is why every step above dry-runs first and why
`--limit` exists.

What *can* be rolled back: the code. Reverting restores full DTO emission, but
any media already marked `reclaimed.files` will then advertise addresses for
files that no longer exist — producing exactly the broken images FR-020 was
written to prevent. **If you revert, keep the nginx fallback from
[C6](./contracts/media-dto.md#c6--media-serving-fallback) in place.**
