import { describe, it, expect } from "vitest";
import { hasLiveReference, hasAnyReference, type RefDb } from "../src/helpers/media-refs.js";

interface ShoutRef { media_id: string; shout_id: string; shoutDeleted: number }
interface CommentRef { media_id: string; comment_id: string; commentDeleted: number }
interface GifRef { media_id: string; id: string; is_deleted: number }

/** Matches Prisma's `{ in: [...] }` filter, or a bare equality, or "no filter". */
function matches(filter: unknown, value: number): boolean {
  if (filter === undefined) return true;
  if (typeof filter === "object" && filter !== null && "in" in filter) {
    return (filter as { in: number[] }).in.includes(value);
  }
  return filter === value;
}

function makeDb(rows: {
  shoutMedia?: ShoutRef[];
  commentMedia?: CommentRef[];
  userGifs?: GifRef[];
}): RefDb {
  const { shoutMedia = [], commentMedia = [], userGifs = [] } = rows;
  return {
    shoutMedia: {
      findFirst: async ({ where }: { where: { media_id: string; shout?: { is_deleted?: unknown } } }) =>
        shoutMedia.find(
          (r) => r.media_id === where.media_id && matches(where.shout?.is_deleted, r.shoutDeleted)
        ) ?? null,
    },
    commentMedia: {
      findFirst: async ({ where }: { where: { media_id: string; comment?: { is_deleted?: unknown } } }) =>
        commentMedia.find(
          (r) => r.media_id === where.media_id && matches(where.comment?.is_deleted, r.commentDeleted)
        ) ?? null,
    },
    userGif: {
      findFirst: async ({ where }: { where: { media_id: string; is_deleted?: unknown } }) =>
        userGifs.find(
          (r) => r.media_id === where.media_id && matches(where.is_deleted, r.is_deleted)
        ) ?? null,
    },
  } as unknown as RefDb;
}

describe("hasLiveReference — the personal GIF library", () => {
  // The most destructive possible bug in this feature: a library GIF is
  // deliberately attached to no post, so a check that consults only the two
  // join tables deletes every user's saved library.
  it("PROTECTS media whose only reference is an active user_gifs row", async () => {
    const db = makeDb({ userGifs: [{ media_id: "m1", id: "g1", is_deleted: 0 }] });
    expect(await hasLiveReference(db, "m1")).toBe(true);
  });

  it("does not protect via a soft-deleted library entry", async () => {
    const db = makeDb({ userGifs: [{ media_id: "m1", id: "g1", is_deleted: 1 }] });
    expect(await hasLiveReference(db, "m1")).toBe(false);
  });
});

describe("hasLiveReference — content references", () => {
  it("protects media attached to a live shout", async () => {
    const db = makeDb({ shoutMedia: [{ media_id: "m1", shout_id: "s1", shoutDeleted: 0 }] });
    expect(await hasLiveReference(db, "m1")).toBe(true);
  });

  it("protects media attached to a live comment", async () => {
    const db = makeDb({ commentMedia: [{ media_id: "m1", comment_id: "c1", commentDeleted: 0 }] });
    expect(await hasLiveReference(db, "m1")).toBe(true);
  });

  // Constitution §III: unbanning restores the account's content wholesale, so
  // ban-removed content must protect its media exactly like live content does.
  it("protects media attached to ban-removed content (is_deleted=2)", async () => {
    const db = makeDb({ shoutMedia: [{ media_id: "m1", shout_id: "s1", shoutDeleted: 2 }] });
    expect(await hasLiveReference(db, "m1")).toBe(true);

    const db2 = makeDb({ commentMedia: [{ media_id: "m1", comment_id: "c1", commentDeleted: 2 }] });
    expect(await hasLiveReference(db2, "m1")).toBe(true);
  });

  it("does not protect media attached only to user-deleted content (is_deleted=1)", async () => {
    const db = makeDb({ shoutMedia: [{ media_id: "m1", shout_id: "s1", shoutDeleted: 1 }] });
    expect(await hasLiveReference(db, "m1")).toBe(false);
  });

  it("protects when one of several references is live", async () => {
    const db = makeDb({
      shoutMedia: [
        { media_id: "m1", shout_id: "dead", shoutDeleted: 1 },
        { media_id: "m1", shout_id: "live", shoutDeleted: 0 },
      ],
    });
    expect(await hasLiveReference(db, "m1")).toBe(true);
  });

  it("returns false for media nothing references", async () => {
    expect(await hasLiveReference(makeDb({}), "m1")).toBe(false);
  });
});

describe("hasAnyReference", () => {
  // This is what separates "never published" from "behind deleted content".
  // Conflating the two would sweep deleted-content media on the upload-based
  // grace period instead of the deletion-based one.
  it("is true for a reference to soft-deleted content, where hasLiveReference is false", async () => {
    const db = makeDb({ shoutMedia: [{ media_id: "m1", shout_id: "s1", shoutDeleted: 1 }] });
    expect(await hasLiveReference(db, "m1")).toBe(false);
    expect(await hasAnyReference(db, "m1")).toBe(true);
  });

  it("is true for a soft-deleted library entry", async () => {
    const db = makeDb({ userGifs: [{ media_id: "m1", id: "g1", is_deleted: 1 }] });
    expect(await hasAnyReference(db, "m1")).toBe(true);
  });

  it("is true for a reference to a soft-deleted comment", async () => {
    const db = makeDb({ commentMedia: [{ media_id: "m1", comment_id: "c1", commentDeleted: 1 }] });
    expect(await hasAnyReference(db, "m1")).toBe(true);
  });

  it("is false only when nothing references the media at all", async () => {
    expect(await hasAnyReference(makeDb({}), "m1")).toBe(false);
  });
});
