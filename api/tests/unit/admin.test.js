import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

// ── Hoist shared state so it's available inside vi.mock() factories ─────────
const { mockPrisma, capturedConfig, capturedAuth } = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  });
  return {
    mockPrisma: {
      user: model(),
      shout: model(),
      comment: model(),
      announcement: model(),
    },
    capturedConfig: { value: null },
    capturedAuth: { value: null },
  };
});

vi.mock("../../src/db.js", () => ({ prisma: mockPrisma }));

vi.mock("adminjs", () => {
  function AdminJS(config) {
    capturedConfig.value = config;
  }
  AdminJS.registerAdapter = vi.fn();
  return { default: AdminJS };
});

vi.mock("@adminjs/express", () => ({
  default: {
    buildAuthenticatedRouter: vi.fn((_admin, authOpts) => {
      capturedAuth.value = authOpts;
      return "mockRouter";
    }),
  },
}));

vi.mock("@adminjs/prisma", () => ({
  Database: {},
  Resource: {},
  getModelByName: vi.fn((name) => ({ __modelName: name })),
}));

import { setupAdmin } from "../../src/admin.js";
import { hashPassword } from "../../src/auth.js";

// ── Env helpers ───────────────────────────────────────────────────────────────
const VALID_ENV = {
  ADMIN_EMAIL: "admin@test.local",
  ADMIN_PASSWORD_HASH: "$2b$10$aaaaaaaaaaaaaaaaaaaaaaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  ADMIN_COOKIE_SECRET: "a-secret-that-is-at-least-32-chars!",
};

function setValidEnv() { Object.assign(process.env, VALID_ENV); }
function clearAdminEnv() {
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_COOKIE_SECRET;
}

// ── Env validation ────────────────────────────────────────────────────────────

describe("setupAdmin — env validation", () => {
  afterAll(clearAdminEnv);

  it("throws when ADMIN_EMAIL is missing", async () => {
    setValidEnv();
    delete process.env.ADMIN_EMAIL;
    await expect(setupAdmin()).rejects.toThrow("ADMIN_EMAIL");
  });

  it("throws when ADMIN_PASSWORD_HASH is missing", async () => {
    setValidEnv();
    delete process.env.ADMIN_PASSWORD_HASH;
    await expect(setupAdmin()).rejects.toThrow("ADMIN_PASSWORD_HASH");
  });

  it("throws when ADMIN_COOKIE_SECRET is missing", async () => {
    setValidEnv();
    delete process.env.ADMIN_COOKIE_SECRET;
    await expect(setupAdmin()).rejects.toThrow("ADMIN_COOKIE_SECRET");
  });

  it("throws when ADMIN_COOKIE_SECRET is shorter than 32 chars", async () => {
    setValidEnv();
    process.env.ADMIN_COOKIE_SECRET = "tooshort";
    await expect(setupAdmin()).rejects.toThrow("32");
  });

  it("returns { admin, adminRouter } for valid env", async () => {
    setValidEnv();
    const result = await setupAdmin();
    expect(result).toHaveProperty("admin");
    expect(result).toHaveProperty("adminRouter");
  });
});

// ── Action handler tests ──────────────────────────────────────────────────────

describe("admin action handlers", () => {
  let resources;

  beforeAll(async () => {
    setValidEnv();
    await setupAdmin();
    resources = capturedConfig.value.resources;
  });

  afterAll(clearAdminEnv);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Build a minimal AdminJS context object for record actions */
  function makeContext(recordParams, resourceId = "Resource") {
    return {
      record: {
        params: recordParams,
        toJSON: vi.fn().mockReturnValue({}),
      },
      resource: {
        _decorated: null,
        id: vi.fn().mockReturnValue(resourceId),
      },
      h: { resourceUrl: vi.fn().mockReturnValue(`/admin/resources/${resourceId}`) },
      currentAdmin: {},
    };
  }

  // ── User: resources[0] ───────────────────────────────────────────────────

  describe("User edit.before", () => {
    let editBefore;
    beforeAll(() => { editBefore = resources[0].options.actions.edit.before; });

    it("snapshots is_banned into request.params._prevIsBanned on POST", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ is_banned: 0 });
      const request = { method: "post", params: {} };
      const context = { record: { params: { id: "u1" } } };
      const result = await editBefore(request, context);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "u1" },
        select: { is_banned: true },
      });
      expect(result.params._prevIsBanned).toBe(0);
    });

    it("is a no-op on non-POST requests", async () => {
      const request = { method: "get", params: {} };
      const context = { record: { params: { id: "u1" } } };
      await editBefore(request, context);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("User edit.after — ban", () => {
    let editAfter;
    beforeAll(() => { editAfter = resources[0].options.actions.edit.after; });

    it("sets is_deleted=2 on active shouts and comments when user is banned", async () => {
      mockPrisma.shout.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.comment.updateMany.mockResolvedValue({ count: 1 });
      const request = { method: "post", params: { _prevIsBanned: "0" } };
      const response = { record: { params: { id: "u1", is_banned: "1" } } };
      await editAfter(response, request, {});
      expect(mockPrisma.shout.updateMany).toHaveBeenCalledWith({
        where: { user_id: "u1", is_deleted: 0 },
        data: { is_deleted: 2 },
      });
      expect(mockPrisma.comment.updateMany).toHaveBeenCalledWith({
        where: { user_id: "u1", is_deleted: 0 },
        data: { is_deleted: 2 },
      });
    });

    it("restores is_deleted=2 shouts and comments when user is unbanned", async () => {
      mockPrisma.shout.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.comment.updateMany.mockResolvedValue({ count: 1 });
      const request = { method: "post", params: { _prevIsBanned: "1" } };
      const response = { record: { params: { id: "u1", is_banned: "0" } } };
      await editAfter(response, request, {});
      expect(mockPrisma.shout.updateMany).toHaveBeenCalledWith({
        where: { user_id: "u1", is_deleted: 2 },
        data: { is_deleted: 0 },
      });
      expect(mockPrisma.comment.updateMany).toHaveBeenCalledWith({
        where: { user_id: "u1", is_deleted: 2 },
        data: { is_deleted: 0 },
      });
    });

    it("does not touch content when is_banned is unchanged", async () => {
      const request = { method: "post", params: { _prevIsBanned: "0" } };
      const response = { record: { params: { id: "u1", is_banned: "0" } } };
      await editAfter(response, request, {});
      expect(mockPrisma.shout.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.comment.updateMany).not.toHaveBeenCalled();
    });

    it("returns response unchanged on non-POST", async () => {
      const request = { method: "get", params: {} };
      const response = { record: null };
      const result = await editAfter(response, request, {});
      expect(result).toBe(response);
      expect(mockPrisma.shout.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── Shout: resources[1] ──────────────────────────────────────────────────

  describe("Shout delete handler", () => {
    let deleteHandler;
    beforeAll(() => { deleteHandler = resources[1].options.actions.delete.handler; });

    it("sets is_deleted=1 on the shout and all its comments", async () => {
      mockPrisma.shout.update.mockResolvedValue({});
      mockPrisma.comment.updateMany.mockResolvedValue({ count: 2 });
      const ctx = makeContext({ id: "shout-1" }, "Shout");
      await deleteHandler(null, null, ctx);
      expect(mockPrisma.shout.update).toHaveBeenCalledWith({
        where: { id: "shout-1" },
        data: { is_deleted: 1 },
      });
      expect(mockPrisma.comment.updateMany).toHaveBeenCalledWith({
        where: { shout_id: "shout-1" },
        data: { is_deleted: 1 },
      });
    });

    it("returns a success notice", async () => {
      mockPrisma.shout.update.mockResolvedValue({});
      mockPrisma.comment.updateMany.mockResolvedValue({ count: 0 });
      const ctx = makeContext({ id: "shout-1" }, "Shout");
      const result = await deleteHandler(null, null, ctx);
      expect(result.notice.type).toBe("success");
    });
  });

  describe("Shout restore handler", () => {
    let restoreHandler;
    beforeAll(() => { restoreHandler = resources[1].options.actions.restore.handler; });

    it("sets is_deleted=0 on the shout", async () => {
      mockPrisma.shout.update.mockResolvedValue({});
      const ctx = makeContext({ id: "shout-1" }, "Shout");
      await restoreHandler(null, null, ctx);
      expect(mockPrisma.shout.update).toHaveBeenCalledWith({
        where: { id: "shout-1" },
        data: { is_deleted: 0 },
      });
    });

    it("returns a success notice", async () => {
      mockPrisma.shout.update.mockResolvedValue({});
      const ctx = makeContext({ id: "shout-1" }, "Shout");
      const result = await restoreHandler(null, null, ctx);
      expect(result.notice.type).toBe("success");
    });
  });

  // ── Comment: resources[2] ────────────────────────────────────────────────

  describe("Comment delete handler", () => {
    let deleteHandler;
    beforeAll(() => { deleteHandler = resources[2].options.actions.delete.handler; });

    it("sets is_deleted=1 on the comment", async () => {
      mockPrisma.comment.update.mockResolvedValue({});
      const ctx = makeContext({ id: "comment-1" }, "Comment");
      await deleteHandler(null, null, ctx);
      expect(mockPrisma.comment.update).toHaveBeenCalledWith({
        where: { id: "comment-1" },
        data: { is_deleted: 1 },
      });
    });

    it("returns a success notice", async () => {
      mockPrisma.comment.update.mockResolvedValue({});
      const ctx = makeContext({ id: "comment-1" }, "Comment");
      const result = await deleteHandler(null, null, ctx);
      expect(result.notice.type).toBe("success");
    });
  });

  describe("Comment restore handler", () => {
    let restoreHandler;
    beforeAll(() => { restoreHandler = resources[2].options.actions.restore.handler; });

    it("sets is_deleted=0 on the comment", async () => {
      mockPrisma.comment.update.mockResolvedValue({});
      const ctx = makeContext({ id: "comment-1" }, "Comment");
      await restoreHandler(null, null, ctx);
      expect(mockPrisma.comment.update).toHaveBeenCalledWith({
        where: { id: "comment-1" },
        data: { is_deleted: 0 },
      });
    });

    it("returns a success notice", async () => {
      mockPrisma.comment.update.mockResolvedValue({});
      const ctx = makeContext({ id: "comment-1" }, "Comment");
      const result = await restoreHandler(null, null, ctx);
      expect(result.notice.type).toBe("success");
    });
  });

  // ── Announcement: resources[4] ───────────────────────────────────────────

  describe("Announcement delete handler", () => {
    let deleteHandler;
    beforeAll(() => { deleteHandler = resources[4].options.actions.delete.handler; });

    it("sets is_deleted=1 on the announcement", async () => {
      mockPrisma.announcement.update.mockResolvedValue({});
      const ctx = makeContext({ id: "ann-1" }, "Announcement");
      await deleteHandler(null, null, ctx);
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith({
        where: { id: "ann-1" },
        data: { is_deleted: 1 },
      });
    });

    it("returns a success notice", async () => {
      mockPrisma.announcement.update.mockResolvedValue({});
      const ctx = makeContext({ id: "ann-1" }, "Announcement");
      const result = await deleteHandler(null, null, ctx);
      expect(result.notice.type).toBe("success");
    });
  });

  describe("Announcement new.before", () => {
    let newBefore;
    beforeAll(() => { newBefore = resources[4].options.actions.new.before; });

    it("soft-deletes all active announcements before creating a new one", async () => {
      mockPrisma.announcement.updateMany.mockResolvedValue({ count: 1 });
      await newBefore({ method: "post" });
      expect(mockPrisma.announcement.updateMany).toHaveBeenCalledWith({
        where: { is_deleted: 0 },
        data: { is_deleted: 1 },
      });
    });

    it("does not soft-delete on non-POST (GET = form render)", async () => {
      await newBefore({ method: "get" });
      expect(mockPrisma.announcement.updateMany).not.toHaveBeenCalled();
    });
  });
});

// ── authenticate callback ─────────────────────────────────────────────────────

describe("authenticate callback", () => {
  let authenticate;

  beforeAll(async () => {
    const hash = await hashPassword("adminpass");
    process.env.ADMIN_EMAIL = "admin@test.local";
    process.env.ADMIN_PASSWORD_HASH = hash;
    process.env.ADMIN_COOKIE_SECRET = "a-secret-that-is-at-least-32-chars!";
    await setupAdmin();
    authenticate = capturedAuth.value.authenticate;
  });

  afterAll(clearAdminEnv);

  it("returns { email } for correct credentials", async () => {
    const result = await authenticate("admin@test.local", "adminpass");
    expect(result).toEqual({ email: "admin@test.local" });
  });

  it("returns null for wrong email", async () => {
    expect(await authenticate("wrong@test.local", "adminpass")).toBeNull();
  });

  it("returns null for wrong password", async () => {
    expect(await authenticate("admin@test.local", "wrongpass")).toBeNull();
  });
});
