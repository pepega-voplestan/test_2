import { describe, it, expect, vi } from "vitest";
import { runOriginalDowngrade, toDatetimeString } from "../src/jobs/original-downgrade.js";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 16, 12, 0, 0);
const dt = (ms: number) => toDatetimeString(new Date(ms));

/** Build a fake `db` (Prisma-like) over an in-memory media/shout/comment set. */
function makeDb({ media = [], shouts = [], comments = [] }: {
  media?: any[];
  shouts?: any[];
  comments?: any[];
}) {
  const updates: Record<string, string> = {};
  return {
    updates,
    db: {
      media: {
        findMany: vi.fn(async ({ where }: any) => {
          const cutoff = where.created_at.lt as string;
          return media
            .filter((m) => m.media_type === "image" && m.created_at < cutoff)
            .map((m) => ({ id: m.id, media_url: m.media_url, media_meta: m.media_meta }));
        }),
        update: vi.fn(async ({ where, data }: any) => {
          updates[where.id] = data.media_meta;
          const row = media.find((m) => m.id === where.id);
          if (row) row.media_meta = data.media_meta;
          return row;
        }),
      },
      shout: {
        findFirst: vi.fn(async ({ where }: any) =>
          shouts.find((s) => s.media_id === where.media_id && s.is_deleted === where.is_deleted) ?? null
        ),
      },
      comment: {
        findFirst: vi.fn(async ({ where }: any) =>
          comments.find((c) => c.media_id === where.media_id && c.is_deleted === where.is_deleted) ?? null
        ),
      },
    },
  };
}

/** Fake fs where 1600.webp exists (non-empty) for the given media_urls. */
function makeFs(webpPresentFor: string[], unlinked: string[] = []) {
  return {
    existsSync: (p: string) => webpPresentFor.some((u) => p.includes(`/${u}/1600.webp`)),
    statSync: () => ({ size: 1234 }) as any,
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn((p: string) => { unlinked.push(p); }),
  };
}

const pending = (id: string, ageHours: number, extra: Record<string, unknown> = {}) => ({
  id,
  media_url: id,
  media_type: "image",
  created_at: dt(NOW - ageHours * HOUR),
  media_meta: JSON.stringify({
    w: 4000,
    h: 3000,
    orig: "original.jpg",
    converted: false,
    uploaded_at: new Date(NOW - ageHours * HOUR).toISOString(),
    ...extra,
  }),
});

describe("runOriginalDowngrade", () => {
  it("converts a due, live original: flips flag, drops orig, unlinks file (FR-005/006/007)", async () => {
    const media = [pending("m1", 25)];
    const { db, updates } = makeDb({ media, shouts: [{ media_id: "m1", is_deleted: 0 }] });
    const unlinked: string[] = [];
    const fileSystem = makeFs(["m1"], unlinked);

    const res = await runOriginalDowngrade({ db, fileSystem, mediaDir: "/media", windowHours: 24, now: NOW });

    expect(res).toMatchObject({ scanned: 1, converted: 1, skipped: 0, failed: 0 });
    const newMeta = JSON.parse(updates["m1"]);
    expect(newMeta.converted).toBe(true);
    expect(newMeta.orig).toBeUndefined();
    expect(unlinked.some((p) => p.endsWith("/m1/original.jpg"))).toBe(true);
  });

  it("skips an original whose owning content was soft-deleted (FR-008)", async () => {
    const media = [pending("m2", 25)];
    const { db, updates } = makeDb({ media, shouts: [{ media_id: "m2", is_deleted: 1 }] });
    const unlinked: string[] = [];
    const fileSystem = makeFs(["m2"], unlinked);

    const res = await runOriginalDowngrade({ db, fileSystem, mediaDir: "/media", windowHours: 24, now: NOW });

    expect(res).toMatchObject({ scanned: 1, converted: 0, skipped: 1 });
    expect(updates["m2"]).toBeUndefined();
    expect(unlinked).toHaveLength(0);
  });

  it("does not convert an original still inside its window", async () => {
    const media = [pending("m3", 1)]; // 1h old, well within 24h
    const { db } = makeDb({ media, shouts: [{ media_id: "m3", is_deleted: 0 }] });
    const fileSystem = makeFs(["m3"]);

    const res = await runOriginalDowngrade({ db, fileSystem, mediaDir: "/media", windowHours: 24, now: NOW });
    // Prefilter excludes it (created_at not before cutoff) → not even scanned.
    expect(res.converted).toBe(0);
    expect(res.scanned).toBe(0);
  });

  it("retains the original and reports failure when 1600.webp is missing (FR-009)", async () => {
    const media = [pending("m4", 25)];
    const { db, updates } = makeDb({ media, shouts: [{ media_id: "m4", is_deleted: 0 }] });
    const unlinked: string[] = [];
    const fileSystem = makeFs([], unlinked); // webp NOT present

    const res = await runOriginalDowngrade({ db, fileSystem, mediaDir: "/media", windowHours: 24, now: NOW });

    expect(res).toMatchObject({ scanned: 1, converted: 0, failed: 1 });
    expect(updates["m4"]).toBeUndefined(); // flag NOT flipped
    expect(unlinked).toHaveLength(0); // original NOT deleted
  });

  it("is idempotent: an already-converted row is not reprocessed", async () => {
    const converted = {
      id: "m5",
      media_url: "m5",
      media_type: "image",
      created_at: dt(NOW - 48 * HOUR),
      media_meta: JSON.stringify({ w: 4000, h: 3000, converted: true }),
    };
    const { db } = makeDb({ media: [converted], shouts: [{ media_id: "m5", is_deleted: 0 }] });
    const fileSystem = makeFs(["m5"]);

    const res = await runOriginalDowngrade({ db, fileSystem, mediaDir: "/media", windowHours: 24, now: NOW });
    expect(res).toMatchObject({ scanned: 0, converted: 0 });
  });

  it("converts when the owning content is a live comment (not a shout)", async () => {
    const media = [pending("m6", 30)];
    const { db, updates } = makeDb({ media, comments: [{ media_id: "m6", is_deleted: 0 }] });
    const fileSystem = makeFs(["m6"]);

    const res = await runOriginalDowngrade({ db, fileSystem, mediaDir: "/media", windowHours: 24, now: NOW });
    expect(res.converted).toBe(1);
    expect(JSON.parse(updates["m6"]).converted).toBe(true);
  });
});
