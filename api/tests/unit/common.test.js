import { describe, it, expect, vi } from "vitest";
import { utcTimestamp, toSqliteDatetime, avatarFor, asyncHandler } from "../../src/helpers/common.js";

describe("utcTimestamp", () => {
  it("appends Z to SQLite datetime", () => {
    expect(utcTimestamp("2026-01-15 12:30:00")).toBe("2026-01-15T12:30:00Z");
  });

  it("replaces space with T", () => {
    expect(utcTimestamp("2026-01-15 00:00:00")).toBe("2026-01-15T00:00:00Z");
  });

  it("does not double-append Z", () => {
    expect(utcTimestamp("2026-01-15T12:30:00Z")).toBe("2026-01-15T12:30:00Z");
  });

  it("returns falsy input as-is", () => {
    expect(utcTimestamp(null)).toBe(null);
    expect(utcTimestamp(undefined)).toBe(undefined);
    expect(utcTimestamp("")).toBe("");
  });
});

describe("toSqliteDatetime", () => {
  it("formats a Date to SQLite datetime string", () => {
    const date = new Date("2026-03-15T08:30:45.123Z");
    expect(toSqliteDatetime(date)).toBe("2026-03-15 08:30:45");
  });

  it("strips milliseconds and Z suffix", () => {
    const result = toSqliteDatetime(new Date("2026-01-01T00:00:00.999Z"));
    expect(result).not.toContain(".");
    expect(result).not.toContain("Z");
  });

  it("defaults to current date when called without arguments", () => {
    const result = toSqliteDatetime();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe("avatarFor", () => {
  it("generates DiceBear URL with encoded username", () => {
    expect(avatarFor("testuser")).toBe(
      "https://api.dicebear.com/7.x/thumbs/svg?seed=testuser"
    );
  });

  it("encodes special characters in username", () => {
    const url = avatarFor("user name");
    expect(url).toContain("seed=user%20name");
  });

  it("encodes unicode characters", () => {
    const url = avatarFor("Пользователь");
    expect(url).toContain("seed=%D0%9F%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8C");
  });
});

describe("asyncHandler", () => {
  it("calls the wrapped function with req, res, next", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const handler = asyncHandler(fn);
    const req = {}, res = {}, next = vi.fn();

    await handler(req, res, next);

    expect(fn).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards rejected promise to next (error middleware)", async () => {
    const error = new Error("test error");
    const fn = vi.fn().mockRejectedValue(error);
    const handler = asyncHandler(fn);
    const req = {}, res = {}, next = vi.fn();

    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("handles functions that return non-promise values", async () => {
    const fn = vi.fn().mockReturnValue("result");
    const handler = asyncHandler(fn);
    const req = {}, res = {}, next = vi.fn();

    await handler(req, res, next);

    expect(fn).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
