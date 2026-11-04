import { describe, it, expect } from "vitest";
import {
  runImageVariantExpiry,
  summarize,
  type ImageVariantExpiryDeps,
} from "../src/jobs/image-variant-expiry.js";

const NOW = Date.parse("2026-08-20T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const MEDIA_DIR = "/media";

interface MediaRow {
  id: string;
  media_url: string;
  media_type: string;
  media_meta: string | null;
  created_at: string;
}

/** `daysAgo` is relative to NOW, so window cases read at the call site. */
function media(id: string, daysAgo: number, meta: object = {}, over: Partial<MediaRow> = {}): MediaRow {
  return {
    id,
    media_url: id,
    media_type: "image",
    media_meta: JSON.stringify({ w: 1600, h: 1200, ...meta }),
    created_at: new Date(NOW - daysAgo * DAY).toISOString(),
    ...over,
  };
}

function makeDb(rowsMedia: MediaRow[], userGifs: { media_id: string; is_deleted: number }[] = []) {
  const db = {
    media: {
      findMany: async ({ where, take, cursor }: any) => {
        let list = rowsMedia
          .filter((m) => m.media_type === where.media_type && m.created_at < where.created_at.lt)
          .sort((a, b) => (a.id < b.id ? -1 : 1));
        if (cursor) list = list.slice(list.findIndex((m) => m.id === cursor.id) + 1);
        return list
          .slice(0, take)
          .map((m) => ({ id: m.id, media_url: m.media_url, media_meta: m.media_meta }));
      },
      updateMany: async ({ where, data }: any) => {
        const row = rowsMedia.find((m) => m.id === where.id);
        if (!row || row.media_meta !== where.media_meta) return { count: 0 };
        row.media_meta = data.media_meta;
        return { count: 1 };
      },
    },
    userGif: {
      findMany: async ({ where }: any) =>
        userGifs.filter((r) => where.media_id.in.includes(r.media_id)).map((r) => ({ media_id: r.media_id })),
    },
  };
  return { db: db as unknown as ImageVariantExpiryDeps["db"], rowsMedia };
}

function splitPath(p: string): [string, string] {
  const i = p.lastIndexOf("/");
  return [p.slice(0, i), p.slice(i + 1)];
}

function makeFs(dirs: Record<string, Record<string, number>>) {
  const unlinked: string[] = [];
  const fileSystem = {
    existsSync: (p: string) => {
      if (p in dirs) return true;
      const [dir, name] = splitPath(p);
      return dir in dirs && name in dirs[dir];
    },
    readdirSync: (p: string) => Object.keys(dirs[p] ?? {}),
    statSync: (p: string) => {
      const [dir, name] = splitPath(p);
      return { size: dirs[dir][name] } as never;
    },
    unlinkSync: (p: string) => {
      const [dir, name] = splitPath(p);
      if (!(dir in dirs) || !(name in dirs[dir])) throw new Error("ENOENT");
      delete dirs[dir][name];
      unlinked.push(p);
    },
    writeFileSync: (p: string, data: string) => {
      const [dir, name] = splitPath(p);
      if (dir in dirs) dirs[dir][name] = String(data).length;
    },
  };
  return { fileSystem: fileSystem as unknown as ImageVariantExpiryDeps["fileSystem"], dirs, unlinked };
}

const STILL = { "960.webp": 40000, "1600.webp": 90000, "meta.json": 120 };

function run(deps: Partial<ImageVariantExpiryDeps>) {
  return runImageVariantExpiry({ mediaDir: MEDIA_DIR, retentionDays: 7, now: NOW, ...deps });
}

describe("image-variant-expiry", () => {
  it("removes 1600.webp for a still image past the window, keeping 960", async () => {
    const { db, rowsMedia } = makeDb([media("a", 10)]);
    const { fileSystem, dirs, unlinked } = makeFs({ "/media/a": { ...STILL } });

    const r = await run({ db, fileSystem });

    expect(r.scanned).toBe(1);
    expect(r.reclaimed).toBe(1);
    expect(r.bytesFreed).toBe(90000);
    expect(unlinked).toEqual(["/media/a/1600.webp"]);
    expect(dirs["/media/a"]["960.webp"]).toBe(40000);
    expect(JSON.parse(rowsMedia[0].media_meta!).reclaimed.variants).toEqual(["1600"]);
  });

  it("leaves an image inside the window alone", async () => {
    const { db } = makeDb([media("fresh", 2)]);
    const { fileSystem, unlinked } = makeFs({ "/media/fresh": { ...STILL } });

    const r = await run({ db, fileSystem });

    // Filtered by the candidate query, so it is never even scanned.
    expect(r.scanned).toBe(0);
    expect(unlinked).toEqual([]);
  });

  it("never removes a file from an animated image", async () => {
    const { db } = makeDb([media("gif", 30, { animated: true })]);
    const { fileSystem, unlinked } = makeFs({ "/media/gif": { "320.webp": 5000, "960.webp": 20000, "original.gif": 800000 } });

    const r = await run({ db, fileSystem });

    expect(r.retained.animated).toBe(1);
    expect(r.reclaimed).toBe(0);
    expect(unlinked).toEqual([]);
  });

  // The FR-004a case. A single-frame GIF in a personal library is stored
  // media_type "image" with animated:false — pages === 1 — and gifs.js writes
  // it all three variants, so it DOES have a 1600.webp the lightbox reads. A
  // guard resting on `meta.animated` alone would delete a file §III exempts
  // absolutely, and no restore path exists.
  it("keeps 1600.webp for a single-frame library GIF older than the window", async () => {
    const { db } = makeDb([media("lib", 90, { animated: false })], [{ media_id: "lib", is_deleted: 0 }]);
    const { fileSystem, dirs, unlinked } = makeFs({
      "/media/lib": { "320.webp": 5000, "960.webp": 20000, "1600.webp": 45000, "original.gif": 300000 },
    });

    const r = await run({ db, fileSystem });

    expect(r.retained.library).toBe(1);
    expect(r.retained.animated).toBe(0);
    expect(r.reclaimed).toBe(0);
    expect(unlinked).toEqual([]);
    expect(dirs["/media/lib"]["1600.webp"]).toBe(45000);
  });

  // Library membership protects regardless of the row's own state: the helper
  // applies no is_deleted filter, because a missed protection retains data
  // while a missed filter destroys it.
  it("keeps a library GIF even when the library row is soft-deleted", async () => {
    const { db } = makeDb([media("lib2", 90)], [{ media_id: "lib2", is_deleted: 1 }]);
    const { fileSystem, unlinked } = makeFs({ "/media/lib2": { ...STILL } });

    const r = await run({ db, fileSystem });

    expect(r.retained.library).toBe(1);
    expect(unlinked).toEqual([]);
  });

  it("leaves media still inside the original-quality window to original-downgrade", async () => {
    const { db } = makeDb([media("pending", 10, { orig: "original.jpg", converted: false })]);
    const { fileSystem, unlinked } = makeFs({ "/media/pending": { ...STILL, "original.jpg": 2000000 } });

    const r = await run({ db, fileSystem });

    expect(r.retained.pendingOriginal).toBe(1);
    expect(unlinked).toEqual([]);
  });

  it("skips media already wholesale-reclaimed without double-counting bytes", async () => {
    const { db } = makeDb([media("gone", 10, { reclaimed: { files: true, at: "2026-08-01T00:00:00.000Z" } })]);
    const { fileSystem } = makeFs({ "/media/gone": { "meta.json": 120 } });

    const r = await run({ db, fileSystem });

    expect(r.retained.alreadyReclaimed).toBe(1);
    expect(r.bytesFreed).toBe(0);
  });

  it("counts unparseable meta as failed and removes nothing", async () => {
    const { db } = makeDb([media("bad", 10, {}, { media_meta: "{not json" })]);
    const { fileSystem, unlinked } = makeFs({ "/media/bad": { ...STILL } });

    const r = await run({ db, fileSystem });

    expect(r.failed).toBe(1);
    expect(r.retained.unreadableMeta).toBe(1);
    expect(unlinked).toEqual([]);
  });

  it("refuses the removal when 960.webp is missing, counting noSurvivor", async () => {
    const { db } = makeDb([media("nosurv", 10)]);
    const { fileSystem, dirs } = makeFs({ "/media/nosurv": { "1600.webp": 90000 } });

    const r = await run({ db, fileSystem });

    expect(r.failed).toBe(1);
    expect(r.retained.noSurvivor).toBe(1);
    expect(dirs["/media/nosurv"]["1600.webp"]).toBe(90000);
  });

  it("refuses the removal when 960.webp exists but is empty", async () => {
    const { db } = makeDb([media("empty", 10)]);
    const { fileSystem, dirs } = makeFs({ "/media/empty": { "960.webp": 0, "1600.webp": 90000 } });

    const r = await run({ db, fileSystem });

    expect(r.retained.noSurvivor).toBe(1);
    expect(dirs["/media/empty"]["1600.webp"]).toBe(90000);
  });

  it("dryRun reports the bytes it would free and changes nothing", async () => {
    const { db, rowsMedia } = makeDb([media("dry", 10)]);
    const before = rowsMedia[0].media_meta;
    const { fileSystem, dirs, unlinked } = makeFs({ "/media/dry": { ...STILL } });

    const r = await run({ db, fileSystem, dryRun: true });

    expect(r.dryRun).toBe(true);
    expect(r.reclaimed).toBe(1);
    expect(r.bytesFreed).toBe(90000);
    expect(unlinked).toEqual([]);
    expect(dirs["/media/dry"]["1600.webp"]).toBe(90000);
    expect(rowsMedia[0].media_meta).toBe(before);
  });

  it("a completed re-run reclaims zero and frees nothing", async () => {
    const { db } = makeDb([media("twice", 10)]);
    const { fileSystem } = makeFs({ "/media/twice": { ...STILL } });

    const first = await run({ db, fileSystem });
    const second = await run({ db, fileSystem });

    expect(first.reclaimed).toBe(1);
    expect(second.reclaimed).toBe(0);
    expect(second.retained.alreadyExpired).toBe(1);
    expect(second.bytesFreed).toBe(0);
  });

  // A concurrent writer (original-downgrade rewrites the same column hourly)
  // means the CAS matches no row. That is a yield, not an error.
  it("counts a CAS mismatch as raced, not failed, and deletes nothing", async () => {
    const { db, rowsMedia } = makeDb([media("race", 10)]);
    const { fileSystem, unlinked } = makeFs({ "/media/race": { ...STILL } });
    const original = db.media.updateMany;
    (db.media as any).updateMany = async (args: any) => {
      rowsMedia[0].media_meta = JSON.stringify({ w: 1600, h: 1200, touched: true });
      return original.call(db.media, args);
    };

    const r = await run({ db, fileSystem });

    expect(r.retained.raced).toBe(1);
    expect(r.failed).toBe(0);
    expect(unlinked).toEqual([]);
  });

  it("pages through more candidates than one batch", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => media(`m${i}`, 10));
    const { db } = makeDb(rows);
    const dirs = Object.fromEntries(rows.map((r) => [`/media/${r.id}`, { ...STILL }]));
    const { fileSystem, unlinked } = makeFs(dirs);

    const r = await run({ db, fileSystem, batchSize: 2 });

    expect(r.scanned).toBe(5);
    expect(r.reclaimed).toBe(5);
    expect(unlinked).toHaveLength(5);
  });

  /**
   * Composition with `original-downgrade` (research R2) — the failure this
   * guards is silent and permanent, not loud.
   *
   * `original-downgrade` refuses to unlink an original unless 1600.webp is
   * confirmed present. If this sweep expires the 1600 first, that check throws
   * FOREVER: the original is never reclaimed, the hourly job logs a failure for
   * that media on every run, and net storage goes UP — the expiry freed 90 KB
   * and stranded a multi-megabyte original.
   */
  it("leaves a pending original alone, then expires it once downgrade has converted", async () => {
    const row = media("compose", 10, { orig: "original.jpg", converted: false });
    const { db, rowsMedia } = makeDb([row]);
    const { fileSystem, dirs, unlinked } = makeFs({
      "/media/compose": { ...STILL, "original.jpg": 4_000_000 },
    });

    const first = await run({ db, fileSystem });
    expect(first.retained.pendingOriginal).toBe(1);
    expect(dirs["/media/compose"]["1600.webp"]).toBe(90000);

    // original-downgrade runs: its survivor check finds the 1600 intact, so it
    // converts and unlinks the original.
    const meta = JSON.parse(rowsMedia[0].media_meta!);
    delete meta.orig;
    meta.converted = true;
    rowsMedia[0].media_meta = JSON.stringify(meta);
    delete dirs["/media/compose"]["original.jpg"];

    const second = await run({ db, fileSystem });
    expect(second.reclaimed).toBe(1);
    expect(unlinked).toEqual(["/media/compose/1600.webp"]);
  });

  it("summarize explains a zero-expiry run rather than reporting a bare zero", async () => {
    const { db } = makeDb([media("gif", 30, { animated: true })]);
    const { fileSystem } = makeFs({ "/media/gif": { "960.webp": 20000 } });

    const line = summarize(await run({ db, fileSystem }));

    expect(line).toContain("reclaimed=0");
    expect(line).toContain("animated=1");
    expect(line).toContain("window=7d");
    expect(line).toContain("cutoff=");
  });
});
