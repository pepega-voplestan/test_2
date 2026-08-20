import { describe, it, expect } from "vitest";
import { runVideoExpiry, summarize, type VideoExpiryDeps } from "../src/jobs/video-expiry.js";

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

function media(id: string, daysAgo: number, meta: object = {}, over: Partial<MediaRow> = {}): MediaRow {
  return {
    id,
    media_url: id,
    media_type: "video",
    media_meta: JSON.stringify({ w: 1280, h: 720, ...meta }),
    created_at: new Date(NOW - daysAgo * DAY).toISOString(),
    ...over,
  };
}

function makeDb(rowsMedia: MediaRow[]) {
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
  };
  return { db: db as unknown as VideoExpiryDeps["db"], rowsMedia };
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
  return { fileSystem: fileSystem as unknown as VideoExpiryDeps["fileSystem"], dirs, unlinked };
}

const VIDEO = { "original.mp4": 48_000_000, "meta.json": 120 };

function run(deps: Partial<VideoExpiryDeps>) {
  return runVideoExpiry({ mediaDir: MEDIA_DIR, retentionDays: 30, now: NOW, ...deps });
}

describe("video-expiry", () => {
  it("removes original.mp4 past the window and marks the media expired", async () => {
    const { db, rowsMedia } = makeDb([media("v1", 40)]);
    const { fileSystem, unlinked } = makeFs({ "/media/v1": { ...VIDEO } });

    const r = await run({ db, fileSystem });

    expect(r.reclaimed).toBe(1);
    expect(r.bytesFreed).toBe(48_000_000);
    expect(unlinked).toEqual(["/media/v1/original.mp4"]);
    expect(JSON.parse(rowsMedia[0].media_meta!).reclaimed.video).toBe(true);
  });

  // Nothing is meant to survive a video, so `survivor` is null and the removal
  // must go through even though the directory is left with no playable file.
  it("removes the only file without a survivor check refusing it", async () => {
    const { db } = makeDb([media("solo", 40)]);
    const { fileSystem, dirs } = makeFs({ "/media/solo": { "original.mp4": 1000 } });

    const r = await run({ db, fileSystem });

    expect(r.failed).toBe(0);
    expect(r.reclaimed).toBe(1);
    expect(dirs["/media/solo"]).not.toHaveProperty("original.mp4");
  });

  it("leaves a video inside the window alone", async () => {
    const { db } = makeDb([media("fresh", 5)]);
    const { fileSystem, unlinked } = makeFs({ "/media/fresh": { ...VIDEO } });

    const r = await run({ db, fileSystem });

    expect(r.scanned).toBe(0);
    expect(unlinked).toEqual([]);
  });

  it("skips media already wholesale-reclaimed without double-counting its bytes", async () => {
    const { db } = makeDb([media("gone", 40, { reclaimed: { files: true, at: "2026-08-01T00:00:00.000Z" } })]);
    const { fileSystem } = makeFs({ "/media/gone": { "meta.json": 120 } });

    const r = await run({ db, fileSystem });

    expect(r.retained.alreadyReclaimed).toBe(1);
    expect(r.reclaimed).toBe(0);
    expect(r.bytesFreed).toBe(0);
  });

  it("counts unparseable meta as failed and removes nothing", async () => {
    const { db } = makeDb([media("bad", 40, {}, { media_meta: "{oops" })]);
    const { fileSystem, unlinked } = makeFs({ "/media/bad": { ...VIDEO } });

    const r = await run({ db, fileSystem });

    expect(r.failed).toBe(1);
    expect(r.retained.unreadableMeta).toBe(1);
    expect(unlinked).toEqual([]);
  });

  it("dryRun reports the bytes it would free and changes nothing", async () => {
    const { db, rowsMedia } = makeDb([media("dry", 40)]);
    const before = rowsMedia[0].media_meta;
    const { fileSystem, dirs, unlinked } = makeFs({ "/media/dry": { ...VIDEO } });

    const r = await run({ db, fileSystem, dryRun: true });

    expect(r.dryRun).toBe(true);
    expect(r.bytesFreed).toBe(48_000_000);
    expect(unlinked).toEqual([]);
    expect(dirs["/media/dry"]["original.mp4"]).toBe(48_000_000);
    expect(rowsMedia[0].media_meta).toBe(before);
  });

  it("a completed re-run is a no-op", async () => {
    const { db } = makeDb([media("twice", 40)]);
    const { fileSystem } = makeFs({ "/media/twice": { ...VIDEO } });

    const first = await run({ db, fileSystem });
    const second = await run({ db, fileSystem });

    expect(first.reclaimed).toBe(1);
    expect(second.reclaimed).toBe(0);
    expect(second.retained.alreadyExpired).toBe(1);
    expect(second.bytesFreed).toBe(0);
  });

  it("counts a CAS mismatch as raced, not failed, and deletes nothing", async () => {
    const { db, rowsMedia } = makeDb([media("race", 40)]);
    const { fileSystem, unlinked } = makeFs({ "/media/race": { ...VIDEO } });
    const original = db.media.updateMany;
    (db.media as any).updateMany = async (args: any) => {
      rowsMedia[0].media_meta = JSON.stringify({ w: 1280, h: 720, touched: true });
      return original.call(db.media, args);
    };

    const r = await run({ db, fileSystem });

    expect(r.retained.raced).toBe(1);
    expect(r.failed).toBe(0);
    expect(unlinked).toEqual([]);
  });

  it("pages through more candidates than one batch", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => media(`v${i}`, 40));
    const { db } = makeDb(rows);
    const { fileSystem, unlinked } = makeFs(
      Object.fromEntries(rows.map((r) => [`/media/${r.id}`, { ...VIDEO }]))
    );

    const r = await run({ db, fileSystem, batchSize: 2 });

    expect(r.scanned).toBe(5);
    expect(r.reclaimed).toBe(5);
    expect(unlinked).toHaveLength(5);
  });

  // A run with nothing due must still explain itself: "it did nothing" has to
  // stay distinguishable from "it never ran" (FR-020).
  it("still emits a summarize line with its breakdown when nothing is due", async () => {
    const { db } = makeDb([media("old", 40, { reclaimed: { video: true, at: "2026-08-01T00:00:00.000Z" } })]);
    const { fileSystem } = makeFs({ "/media/old": { "meta.json": 120 } });

    const line = summarize(await run({ db, fileSystem }));

    expect(line).toContain("video-expiry");
    expect(line).toContain("reclaimed=0");
    expect(line).toContain("alreadyExpired=1");
    expect(line).toContain("window=30d");
    expect(line).toContain("cutoff=");
  });
});
