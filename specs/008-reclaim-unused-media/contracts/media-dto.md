# Contract: Media DTO and reclaim interfaces

**Feature**: 008-reclaim-unused-media

Three contracts change. Two are internal (job + script entry points); one is the
client-facing payload and is the only breaking change.

---

## C1 — Image media DTO (BREAKING)

Produced by `buildMedia` in `api/src/helpers/media.js:182`. Consumed by every
feed, shout, comment, and profile response, and typed at `web/types.ts:22`.

### Before

```ts
{ type: 'image'; url: string; thumb: string; full: string;
  width: number; height: number;
  animated?: boolean; gif?: string; orientation?: number }
```

### After

```ts
{ type: 'image'; url: string; thumb?: string; full?: string;
  width: number; height: number;
  animated?: boolean; gif?: string; orientation?: number }
```

### Emission rules

| Condition | `url` | `thumb` | `full` |
|---|---|---|---|
| Non-animated image | `960.webp` | **omitted** | `1600.webp` |
| Animated image | `960.webp` | `320.webp` | **omitted** |
| `reclaimed.files === true` | *(entire media object omitted — see C2)* | | |

`url` is never omitted while the media is renderable. `orientation` continues to
appear only while a pending original is being served.

### Compatibility

Safe because no reader exists for either omitted field on its affected path
(verified — [research D4](../research.md#d4)). The TypeScript widening and the
API change MUST land together; otherwise the frontend compiles against a
contract the server has already stopped honouring.

---

## C2 — Reclaimed media is omitted, not broken

When `media_meta.reclaimed.files === true`, `buildMedia` returns `undefined` and
`buildGallery` filters the item out.

**Consequences**

- A restored post renders as text-only. Satisfies FR-014 and constitution §III's
  "the loss must be visible, never a broken image".
- `buildGallery` (`media.js:251`) already returns `undefined` for fewer than two
  surviving items, so a gallery reduced to one item degrades to the single-media
  shape without special handling.
- A shout whose only media was reclaimed still renders — text, author, likes and
  comments are unaffected.

**Not covered**: a shout with empty text whose only media was reclaimed becomes
visually empty. Acceptable — it can only occur for content deleted longer ago
than the grace period, which is exactly the case the constitution declares
media-incomplete.

---

## C3 — Publish guard

`attachments.js` — the sole writer of the join tables — MUST reject any
`media_id` whose `media_meta.reclaimed.files` is `true`.

- **Failure mode**: reject the whole publish; do not silently drop the
  attachment.
- **Message**: Russian, consistent with existing attachment errors
  (Principle II).
- **Trigger**: a composer held open past the grace period, then submitted.

Satisfies FR-013.

---

## C4 — Recurring job entry point

```ts
interface ReclaimDeps {
  db;                    // Prisma-like; injectable for tests
  fileSystem;            // existsSync / statSync / unlinkSync / writeFileSync
  mediaDir: string;
  unpublishedGraceDays: number;
  deletedGraceDays: number;
  batchSize: number;
  dryRun: boolean;
  now: number;
}

export async function runMediaReclaim(deps?: Partial<ReclaimDeps>): Promise<ReclaimResult>;
export function createMediaReclaimWorker(): Worker;
```

Mirrors `runOriginalDowngrade` / `createOriginalDowngradeWorker`
(`original-downgrade.ts:48,152`) exactly — dependency injection for tests with
real defaults, so no DB or Redis is needed in unit tests. Registered on queue
`media-reclaim`, scheduled daily.

`dryRun: true` performs every read and computes `bytesFreed`, but issues no
`unlink` and no DB write.

---

## C5 — One-time script entry point

```
npx tsx workers/src/scripts/reclaim-unreachable-variants.ts [--execute] [--limit N]
```

| Flag | Default | Effect |
|---|---|---|
| *(none)* | — | **Dry run.** Reports counts and bytes; changes nothing |
| `--execute` | off | Actually removes files |
| `--limit N` | unlimited | Process at most N items — for a staged rollout |

Dry run is the default posture; destruction requires an explicit opt-in
(FR-015). Exit code 0 on success, non-zero if any item failed.

---

## C6 — Media serving fallback

`media-nginx.conf` — replaces the `try_files $uri =404` rule at line 18:

```nginx
location ~* ^/(?<mid>[^/]+)/(320|960|1600)\.webp$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options "nosniff";
    try_files $uri /$mid/960.webp =404;
}
```

Non-webp media (`.gif`, `.mp4`, `.jpg`, `.png`) keeps the existing rule and
its `=404`.

**Depends on**: `960.webp` never being reclaimed. Any future feature that
removes it must revisit this block first
([research D5](../research.md#d5)).
