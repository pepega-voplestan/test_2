import { describe, it, expect } from "vitest";
import { runMediaReclaim, type MediaReclaimDeps } from "../src/jobs/media-reclaim.js";

const NOW = Date.parse("2026-08-12T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const MEDIA_DIR = "/media";

interface MediaRow {
  id: string;
  media_url: string;
  media_type: string;
  media_meta: string | null;
  created_at: string;
}

/** `daysAgo` is relative to NOW, so grace-window cases read at the call site. */
function media(id: string, daysAgo: number, over: Partial<MediaRow> = {}): MediaRow {
  return {
    id,
    media_url: id,
    media_type: "image",
    media_meta: JSON.stringify({ w: 800, h: 600 }),
    created_at: new Date(NOW - daysAgo * DAY).toISOString(),
    ...over,
  };
}

function makeDb(rows: {
  media?: MediaRow[];
  shoutMedia?: { media_id: string; shoutDeleted: number }[];
  commentMedia?: { media_id: string; commentDeleted: number }[];
  userGifs?: { media_id: string; is_deleted: number }[];
}) {
  const { media: rowsMedia = [], shoutMedia = [], commentMedia = [], userGifs = [] } = rows;

  const db = {
    media: {
      // Mirrors Prisma cursor paging: `cursor` + `skip: 1` resumes after the
      // named row, and ordering is by id so the resume point is stable.
      findMany: async ({ where, take, cursor }: any) => {
        let list = rowsMedia
          .filter(
            (m) =>
              where.media_type.in.includes(m.media_type) && m.created_at < where.created_at.lt
          )
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
    shoutMedia: {
      findFirst: async ({ where }: any) =>
        shoutMedia.find(
          (r) =>
            r.media_id === where.media_id &&
            (!where.shout || where.shout.is_deleted.in.includes(r.shoutDeleted))
        ) ?? null,
    },
    commentMedia: {
      findFirst: async ({ where }: any) =>
        commentMedia.find(
          (r) =>
            r.media_id === where.media_id &&
            (!where.comment || where.comment.is_deleted.in.includes(r.commentDeleted))
        ) ?? null,
    },
    userGif: {
      findFirst: async ({ where }: any) =>
        userGifs.find(
          (r) =>
            r.media_id === where.media_id &&
            (where.is_deleted === undefined || r.is_deleted === where.is_deleted)
        ) ?? null,
    },
  };
  return { db: db as unknown as MediaReclaimDeps["db"], rowsMedia };
}

function splitPath(p: string): [string, string] {
  const i = p.lastIndexOf("/");
  return [p.slice(0, i), p.slice(i + 1)];
}

/** In-memory volume: directory path → { filename: byteSize }. */
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
  return { fileSystem: fileSystem as unknown as MediaReclaimDeps["fileSystem"], dirs, unlinked };
}

const VARIANTS = { "960.webp": 40000, "1600.webp": 90000, "meta.json": 120 };

function run(deps: Partial<MediaReclaimDeps>) {
  return runMediaReclaim({ mediaDir: MEDIA_DIR, unpublishedGraceDays: 7, now: NOW, ...deps });
}

describe("runMediaReclaim — never-published class (US2)", () => {
  it("leaves an unpublished upload alone while it is inside the grace window", async () => {
    const { db } = makeDb({ media: [media("m1", 3)] });
    const { fileSystem, dirs, unlinked } = makeFs({ "/media/m1": { ...VARIANTS } });

    const res = await run({ db, fileSystem });

    expect(res).toMatchObject({ scanned: 0, reclaimed: 0 });
    expect(unlinked).toHaveLength(0);
    expect(Object.keys(dirs["/media/m1"]).sort()).toEqual(["1600.webp", "960.webp", "meta.json"]);
  });

  it("reclaims an unpublished upload once the grace window has passed", async () => {
    const { db, rowsMedia } = makeDb({ media: [media("m1", 10)] });
    const { fileSystem, dirs, unlinked } = makeFs({ "/media/m1": { ...VARIANTS } });

    const res = await run({ db, fileSystem });

    expect(res).toMatchObject({ scanned: 1, reclaimed: 1, skipped: 0, failed: 0 });
    expect(res.bytesFreed).toBe(130000);
    expect(unlinked.sort()).toEqual(["/media/m1/1600.webp", "/media/m1/960.webp"]);
    // The on-disk marker survives as a record that the directory was reclaimed
    // deliberately rather than emptied by accident.
    expect(Object.keys(dirs["/media/m1"])).toEqual(["meta.json"]);
    expect(JSON.parse(rowsMedia[0].media_meta!).reclaimed.files).toBe(true);
  });

  // FR-009 / constitution §III: only files, never rows.
  it("removes files without touching the media row's identity", async () => {
    const { db, rowsMedia } = makeDb({ media: [media("m1", 10)] });
    const { fileSystem } = makeFs({ "/media/m1": { ...VARIANTS } });

    await run({ db, fileSystem });

    expect(rowsMedia).toHaveLength(1);
    expect(rowsMedia[0].id).toBe("m1");
    expect(rowsMedia[0].media_url).toBe("m1");
    // Pre-existing meta keys survive alongside the new marker.
    expect(JSON.parse(rowsMedia[0].media_meta!)).toMatchObject({ w: 800, h: 600 });
  });

  it("reports without deleting in dry-run mode (FR-015)", async () => {
    const { db, rowsMedia } = makeDb({ media: [media("m1", 10)] });
    const { fileSystem, dirs, unlinked } = makeFs({ "/media/m1": { ...VARIANTS } });

    const res = await run({ db, fileSystem, dryRun: true });

    expect(res).toMatchObject({ reclaimed: 1, bytesFreed: 130000, dryRun: true });
    expect(unlinked).toHaveLength(0);
    expect(Object.keys(dirs["/media/m1"]).sort()).toEqual(["1600.webp", "960.webp", "meta.json"]);
    expect(rowsMedia[0].media_meta).not.toContain("reclaimed");
  });

  it("is idempotent: a second sweep reclaims nothing (FR-018)", async () => {
    const { db } = makeDb({ media: [media("m1", 10)] });
    const { fileSystem, unlinked } = makeFs({ "/media/m1": { ...VARIANTS } });

    await run({ db, fileSystem });
    const second = await run({ db, fileSystem });

    expect(second).toMatchObject({ scanned: 1, reclaimed: 0, skipped: 1, failed: 0 });
    expect(unlinked).toHaveLength(2);
  });

  it("counts a media directory that is already gone as success, not failure", async () => {
    const { db } = makeDb({ media: [media("m1", 10)] });
    const { fileSystem } = makeFs({});

    const res = await run({ db, fileSystem });

    expect(res).toMatchObject({ reclaimed: 1, failed: 0, bytesFreed: 0 });
  });
});

describe("runMediaReclaim — what it must never touch", () => {
  it("never reclaims media held only by a personal GIF library (SC-008)", async () => {
    const { db } = makeDb({
      media: [media("m1", 100)],
      userGifs: [{ media_id: "m1", is_deleted: 0 }],
    });
    const { fileSystem, unlinked } = makeFs({ "/media/m1": { ...VARIANTS } });

    const res = await run({ db, fileSystem });

    expect(res).toMatchObject({ scanned: 1, reclaimed: 0, skipped: 1 });
    expect(unlinked).toHaveLength(0);
  });

  it("leaves media attached to live content alone", async () => {
    const { db } = makeDb({
      media: [media("m1", 100)],
      shoutMedia: [{ media_id: "m1", shoutDeleted: 0 }],
    });
    const { fileSystem, unlinked } = makeFs({ "/media/m1": { ...VARIANTS } });

    expect(await run({ db, fileSystem })).toMatchObject({ reclaimed: 0, skipped: 1 });
    expect(unlinked).toHaveLength(0);
  });

  // This pass owns the never-published class only. Media behind soft-deleted
  // content is a different class on a deletion-based grace period (US3), and
  // sweeping it here would apply the wrong clock.
  it("leaves media behind soft-deleted content to the deleted-content class", async () => {
    const { db } = makeDb({
      media: [media("m1", 100)],
      shoutMedia: [{ media_id: "m1", shoutDeleted: 1 }],
    });
    const { fileSystem, unlinked } = makeFs({ "/media/m1": { ...VARIANTS } });

    expect(await run({ db, fileSystem })).toMatchObject({ reclaimed: 0, skipped: 1 });
    expect(unlinked).toHaveLength(0);
  });

  it("leaves ban-removed content's media alone (SC-007)", async () => {
    const { db } = makeDb({
      media: [media("m1", 100)],
      commentMedia: [{ media_id: "m1", commentDeleted: 2 }],
    });
    const { fileSystem, unlinked } = makeFs({ "/media/m1": { ...VARIANTS } });

    expect(await run({ db, fileSystem })).toMatchObject({ reclaimed: 0, skipped: 1 });
    expect(unlinked).toHaveLength(0);
  });

  it("skips youtube and giphy rows, which own no local files", async () => {
    const { db } = makeDb({
      media: [
        media("y1", 100, { media_type: "youtube" }),
        media("g1", 100, { media_type: "giphy" }),
      ],
    });
    const { fileSystem } = makeFs({});

    expect(await run({ db, fileSystem })).toMatchObject({ scanned: 0, reclaimed: 0 });
  });

  it("does not resurrect files when another writer changed media_meta since the read", async () => {
    const { db, rowsMedia } = makeDb({ media: [media("m1", 10)] });
    const { fileSystem, unlinked } = makeFs({ "/media/m1": { ...VARIANTS } });

    const original = db.media.findMany;
    db.media.findMany = (async (args: never) => {
      const batch = await original.call(db.media, args);
      // The hourly original-downgrade job rewrites the same column.
      rowsMedia[0].media_meta = JSON.stringify({ w: 800, h: 600, converted: true });
      return batch;
    }) as typeof db.media.findMany;

    const res = await run({ db, fileSystem });

    expect(res).toMatchObject({ reclaimed: 0, skipped: 1, failed: 0 });
    expect(unlinked).toHaveLength(0);
    expect(JSON.parse(rowsMedia[0].media_meta!).converted).toBe(true);
  });
});

describe("runMediaReclaim — why a run reclaimed nothing", () => {
  it("attributes each retained item to its reason", async () => {
    const rows = [media("m1", 10), media("m2", 10), media("m3", 10)];
    rows[2].media_meta = JSON.stringify({ w: 1, h: 1, reclaimed: { files: true, at: "x" } });
    const { db } = makeDb({
      media: rows,
      shoutMedia: [{ media_id: "m1", shoutDeleted: 0 }],
      userGifs: [{ media_id: "m2", is_deleted: 0 }],
    });
    const { fileSystem } = makeFs({});

    const res = await run({ db, fileSystem });

    expect(res).toMatchObject({ scanned: 3, reclaimed: 0, skipped: 3 });
    expect(res.retained).toEqual({ referenced: 2, alreadyReclaimed: 1, raced: 0, unreadableMeta: 0 });
  });

  it("distinguishes an empty candidate set from a fully-retained one", async () => {
    const { db } = makeDb({ media: [media("m1", 1)] });
    const { fileSystem } = makeFs({});

    const res = await run({ db, fileSystem });

    expect(res).toMatchObject({ scanned: 0, skipped: 0 });
    expect(res.retained).toEqual({ referenced: 0, alreadyReclaimed: 0, raced: 0, unreadableMeta: 0 });
  });
});

describe("runMediaReclaim — a volume it cannot write to", () => {
  // The failure this must never hide: every unlink throws, yet the run reports
  // a healthy bytesFreed and the operator sees no change in volume space.
  it("reports zero bytes and counts strays when removal fails", async () => {
    const { db } = makeDb({ media: [media("m1", 10)] });
    const { fileSystem, dirs } = makeFs({ "/media/m1": { ...VARIANTS } });
    fileSystem.unlinkSync = () => {
      throw Object.assign(new Error("EROFS: read-only file system"), { code: "EROFS" });
    };

    const res = await run({ db, fileSystem });

    expect(res.bytesFreed).toBe(0);
    expect(res.strayFiles).toBe(2);
    // The files are still there — which is the whole point of the assertion.
    expect(Object.keys(dirs["/media/m1"]).sort()).toEqual(["1600.webp", "960.webp", "meta.json"]);
  });

  it("still credits bytes for a file that vanished by other means", async () => {
    const { db } = makeDb({ media: [media("m1", 10)] });
    const { fileSystem, dirs } = makeFs({ "/media/m1": { ...VARIANTS } });
    const realUnlink = fileSystem.unlinkSync;
    fileSystem.unlinkSync = (p: string) => {
      delete dirs["/media/m1"][p.slice(p.lastIndexOf("/") + 1)];
      throw new Error("boom"); // removed, but reported as a failure
    };
    void realUnlink;

    const res = await run({ db, fileSystem });

    expect(res.strayFiles).toBe(0);
    expect(res.bytesFreed).toBe(130000);
  });
});

describe("runMediaReclaim — batching", () => {
  it("pages past the batch size without skipping or repeating rows (research D6)", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => media(`m${i}`, 10));
    const { db } = makeDb({ media: rows });
    const dirs = Object.fromEntries(rows.map((r) => [`/media/${r.id}`, { ...VARIANTS }]));
    const { fileSystem, unlinked } = makeFs(dirs);

    const res = await run({ db, fileSystem, batchSize: 2 });

    expect(res).toMatchObject({ scanned: 7, reclaimed: 7, failed: 0 });
    expect(unlinked).toHaveLength(14);
  });

  it("terminates when every candidate is protected and nothing is marked", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => media(`m${i}`, 10));
    const { db } = makeDb({
      media: rows,
      userGifs: rows.map((r) => ({ media_id: r.id, is_deleted: 0 })),
    });
    const { fileSystem } = makeFs({});

    expect(await run({ db, fileSystem, batchSize: 2 })).toMatchObject({ scanned: 5, skipped: 5 });
  });
});
