import { describe, it, expect } from "vitest";
import {
  parseMeta,
  mergeReclaimed,
  performReclaim,
  emptyResult,
  formatResult,
  type MediaMeta,
  type RemovalPlan,
} from "../src/helpers/reclaim.js";

const NOW = new Date("2026-08-12T10:00:00.000Z");
const MEDIA_DIR = "/media";

/** In-memory filesystem: path → byte size. Absent key = file does not exist. */
function makeFs(files: Record<string, number>) {
  const unlinked: string[] = [];
  const written: Record<string, string> = {};
  return {
    unlinked,
    written,
    fs: {
      existsSync: (p: string) => p in files,
      statSync: (p: string) => ({ size: files[p] }) as never,
      unlinkSync: (p: string) => {
        if (!(p in files)) throw new Error("ENOENT");
        delete files[p];
        unlinked.push(p);
      },
      writeFileSync: (p: string, data: string) => {
        written[p] = data;
      },
    } as never,
  };
}

/**
 * Emulates Prisma's `updateMany`: the guard on `media_meta` is part of the WHERE,
 * so a row whose stored value has drifted from the guard matches nothing.
 * `stored` seeds that drift; an unseeded id is treated as matching.
 */
function makeDb(stored: Record<string, string | null> = {}) {
  const updates: Record<string, string> = {};
  return {
    updates,
    db: {
      updateMany: async (args: {
        where: { id: string; media_meta: string | null };
        data: { media_meta: string };
      }) => {
        const { id, media_meta } = args.where;
        if (id in stored && stored[id] !== media_meta) return { count: 0 };
        stored[id] = args.data.media_meta;
        updates[id] = args.data.media_meta;
        return { count: 1 };
      },
    },
  };
}

const META = { w: 1080, h: 720 };

function plan(over: Partial<RemovalPlan> = {}): RemovalPlan {
  return {
    mediaId: "m1",
    mediaUrl: "m1",
    meta: META,
    metaJson: JSON.stringify(META),
    filesToRemove: ["320.webp"],
    survivor: "960.webp",
    markerPatch: { variants: ["320"] },
    ...over,
  };
}

describe("parseMeta", () => {
  it("returns an object for empty or missing meta", () => {
    expect(parseMeta(null)).toEqual({});
    expect(parseMeta("")).toEqual({});
  });

  it("returns null for malformed JSON rather than throwing", () => {
    expect(parseMeta("{not json")).toBeNull();
  });
});

describe("mergeReclaimed", () => {
  it("records variants and a timestamp without disturbing existing keys", () => {
    const meta: MediaMeta = { w: 100, h: 50, animated: false };
    const out = mergeReclaimed(meta, { variants: ["320"] }, NOW);
    expect(out.w).toBe(100);
    expect(out.animated).toBe(false);
    expect(out.reclaimed).toEqual({ variants: ["320"], at: NOW.toISOString() });
  });

  it("accumulates variants across runs and never drops earlier ones", () => {
    const first = mergeReclaimed({}, { variants: ["320"] }, NOW);
    const second = mergeReclaimed(first, { variants: ["1600"] }, NOW);
    expect(second.reclaimed?.variants).toEqual(["320", "1600"]);
  });

  it("does not duplicate a variant reclaimed twice", () => {
    const first = mergeReclaimed({}, { variants: ["320"] }, NOW);
    const second = mergeReclaimed(first, { variants: ["320"] }, NOW);
    expect(second.reclaimed?.variants).toEqual(["320"]);
  });

  it("keeps files:true sticky once set", () => {
    const first = mergeReclaimed({}, { files: true }, NOW);
    const second = mergeReclaimed(first, { variants: ["320"] }, NOW);
    expect(second.reclaimed?.files).toBe(true);
  });
});

describe("performReclaim — survivor verification (FR-016)", () => {
  it("aborts when the survivor is missing, removing nothing", async () => {
    const { fs, unlinked } = makeFs({ "/media/m1/320.webp": 5000 });
    const { db, updates } = makeDb();

    await expect(
      performReclaim(plan(), { db, fileSystem: fs, mediaDir: MEDIA_DIR, dryRun: false, now: NOW })
    ).rejects.toThrow(/missing or empty/);

    expect(unlinked).toEqual([]);
    expect(updates).toEqual({});
  });

  it("aborts when the survivor exists but is zero-length", async () => {
    const { fs, unlinked } = makeFs({ "/media/m1/320.webp": 5000, "/media/m1/960.webp": 0 });
    const { db } = makeDb();

    await expect(
      performReclaim(plan(), { db, fileSystem: fs, mediaDir: MEDIA_DIR, dryRun: false, now: NOW })
    ).rejects.toThrow(/missing or empty/);
    expect(unlinked).toEqual([]);
  });

  it("skips the survivor check when nothing is meant to survive", async () => {
    const { fs, unlinked } = makeFs({ "/media/m1/320.webp": 100, "/media/m1/960.webp": 200 });
    const { db } = makeDb();

    const r = await performReclaim(
      plan({ survivor: null, filesToRemove: ["320.webp", "960.webp"], markerPatch: { files: true } }),
      { db, fileSystem: fs, mediaDir: MEDIA_DIR, dryRun: false, now: NOW }
    );

    expect(r.bytesFreed).toBe(300);
    expect(unlinked).toHaveLength(2);
  });
});

describe("performReclaim — ordering and idempotency (FR-017, FR-018)", () => {
  it("persists the marker before unlinking", async () => {
    const order: string[] = [];
    const files: Record<string, number> = { "/media/m1/320.webp": 5000, "/media/m1/960.webp": 9000 };
    const fs = {
      existsSync: (p: string) => p in files,
      statSync: (p: string) => ({ size: files[p] }) as never,
      unlinkSync: (p: string) => {
        order.push(`unlink:${p}`);
        delete files[p];
      },
      writeFileSync: () => order.push("meta.json"),
    } as never;
    const db = {
      updateMany: async () => {
        order.push("db");
        return { count: 1 };
      },
    };

    await performReclaim(plan(), { db, fileSystem: fs, mediaDir: MEDIA_DIR, dryRun: false, now: NOW });

    expect(order[0]).toBe("db");
    expect(order.at(-1)).toBe("unlink:/media/m1/320.webp");
  });

  it("treats an already-missing file as success", async () => {
    const { fs, unlinked } = makeFs({ "/media/m1/960.webp": 9000 });
    const { db, updates } = makeDb();

    const r = await performReclaim(plan(), {
      db,
      fileSystem: fs,
      mediaDir: MEDIA_DIR,
      dryRun: false,
      now: NOW,
    });

    expect(r.bytesFreed).toBe(0);
    expect(unlinked).toEqual([]);
    expect(JSON.parse(updates.m1).reclaimed.variants).toEqual(["320"]);
  });

  it("writes the on-disk meta mirror alongside the DB update", async () => {
    const { fs, written } = makeFs({ "/media/m1/320.webp": 1, "/media/m1/960.webp": 2 });
    const { db } = makeDb();

    await performReclaim(plan(), { db, fileSystem: fs, mediaDir: MEDIA_DIR, dryRun: false, now: NOW });

    expect(JSON.parse(written["/media/m1/meta.json"]).reclaimed.variants).toEqual(["320"]);
  });

  it("survives a failing meta.json mirror write, since the DB is authoritative", async () => {
    const files: Record<string, number> = { "/media/m1/320.webp": 10, "/media/m1/960.webp": 20 };
    const fs = {
      existsSync: (p: string) => p in files,
      statSync: (p: string) => ({ size: files[p] }) as never,
      unlinkSync: (p: string) => void delete files[p],
      writeFileSync: () => {
        throw new Error("EROFS");
      },
    } as never;
    const { db, updates } = makeDb();

    const r = await performReclaim(plan(), {
      db,
      fileSystem: fs,
      mediaDir: MEDIA_DIR,
      dryRun: false,
      now: NOW,
    });

    expect(r.bytesFreed).toBe(10);
    expect(updates.m1).toBeDefined();
  });
});

describe("performReclaim — concurrent modification", () => {
  it("deletes nothing when another writer changed media_meta since the read", async () => {
    const { fs, unlinked, written } = makeFs({ "/media/m1/320.webp": 4096, "/media/m1/960.webp": 9000 });
    // What original-downgrade would leave behind: `orig` dropped, converted flipped.
    const { db, updates } = makeDb({ m1: JSON.stringify({ ...META, converted: true }) });

    const r = await performReclaim(plan(), {
      db,
      fileSystem: fs,
      mediaDir: MEDIA_DIR,
      dryRun: false,
      now: NOW,
    });

    expect(r.applied).toBe(false);
    expect(r.bytesFreed).toBe(0);
    expect(unlinked).toEqual([]);
    expect(written).toEqual({});
    expect(updates).toEqual({});
  });

  it("does not resurrect a stale `orig` key over the downgrade job's write", async () => {
    const staleMeta = { ...META, orig: "original.jpg", converted: false };
    const downgraded = JSON.stringify({ ...META, converted: true });
    const { fs } = makeFs({ "/media/m1/320.webp": 10, "/media/m1/960.webp": 20 });
    const stored = { m1: downgraded };
    const { db } = makeDb(stored);

    await performReclaim(plan({ meta: staleMeta, metaJson: JSON.stringify(staleMeta) }), {
      db,
      fileSystem: fs,
      mediaDir: MEDIA_DIR,
      dryRun: false,
      now: NOW,
    });

    expect(stored.m1).toBe(downgraded);
    expect(JSON.parse(stored.m1).orig).toBeUndefined();
  });

  it("applies normally when the row is untouched", async () => {
    const { fs, unlinked } = makeFs({ "/media/m1/320.webp": 4096, "/media/m1/960.webp": 9000 });
    const { db } = makeDb({ m1: JSON.stringify(META) });

    const r = await performReclaim(plan(), {
      db,
      fileSystem: fs,
      mediaDir: MEDIA_DIR,
      dryRun: false,
      now: NOW,
    });

    expect(r.applied).toBe(true);
    expect(unlinked).toEqual(["/media/m1/320.webp"]);
  });
});

describe("performReclaim — dry run (FR-015)", () => {
  it("reports bytes but mutates nothing", async () => {
    const { fs, unlinked, written } = makeFs({
      "/media/m1/320.webp": 4096,
      "/media/m1/960.webp": 9000,
    });
    const { db, updates } = makeDb();

    const r = await performReclaim(plan(), {
      db,
      fileSystem: fs,
      mediaDir: MEDIA_DIR,
      dryRun: true,
      now: NOW,
    });

    expect(r.bytesFreed).toBe(4096);
    expect(unlinked).toEqual([]);
    expect(updates).toEqual({});
    expect(written).toEqual({});
  });

  it("still enforces the survivor check, so a dry run reports what a real run would do", async () => {
    const { fs } = makeFs({ "/media/m1/320.webp": 4096 });
    const { db } = makeDb();

    await expect(
      performReclaim(plan(), { db, fileSystem: fs, mediaDir: MEDIA_DIR, dryRun: true, now: NOW })
    ).rejects.toThrow(/missing or empty/);
  });
});

describe("result reporting", () => {
  it("starts empty and carries the dry-run flag", () => {
    expect(emptyResult(true)).toEqual({
      scanned: 0,
      reclaimed: 0,
      skipped: 0,
      failed: 0,
      bytesFreed: 0,
      dryRun: true,
    });
  });

  it("formats bytes as MB and marks dry runs", () => {
    const r = { ...emptyResult(true), scanned: 10, reclaimed: 4, bytesFreed: 2097152 };
    expect(formatResult("test", r)).toContain("DRY RUN");
    expect(formatResult("test", r)).toContain("freed=2.0MB");
  });
});
