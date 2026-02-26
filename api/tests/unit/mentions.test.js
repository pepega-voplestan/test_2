import { describe, it, expect } from "vitest";
import { extractMentionedUserIds, buildSnippet } from "../../src/helpers/mentions.js";

describe("extractMentionedUserIds", () => {
  it("extracts user IDs from mention tokens", () => {
    const content = "Hey @[alice:aaa-111] and @[bob:bbb-222]!";
    expect(extractMentionedUserIds(content)).toEqual(["aaa-111", "bbb-222"]);
  });

  it("deduplicates repeated mentions", () => {
    const content = "@[alice:aaa-111] said hi to @[alice:aaa-111]";
    expect(extractMentionedUserIds(content)).toEqual(["aaa-111"]);
  });

  it("excludes the actor (self-mentions)", () => {
    const content = "@[alice:aaa-111] @[bob:bbb-222]";
    expect(extractMentionedUserIds(content, "aaa-111")).toEqual(["bbb-222"]);
  });

  it("returns empty array when no mentions", () => {
    expect(extractMentionedUserIds("no mentions here")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractMentionedUserIds("")).toEqual([]);
  });

  it("handles mention-only content", () => {
    expect(extractMentionedUserIds("@[user:abc-123]")).toEqual(["abc-123"]);
  });

  it("returns empty when all mentions are the actor", () => {
    expect(extractMentionedUserIds("@[me:my-id]", "my-id")).toEqual([]);
  });
});

describe("buildSnippet", () => {
  it("strips mention tokens to @name", () => {
    expect(buildSnippet("Hi @[alice:aaa-111]!")).toBe("Hi @alice!");
  });

  it("collapses whitespace", () => {
    expect(buildSnippet("hello   world\n\ntest")).toBe("hello world test");
  });

  it("truncates to maxLen with ellipsis", () => {
    const long = "a".repeat(100);
    const result = buildSnippet(long, 60);
    expect(result.length).toBe(61); // 60 chars + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate short text", () => {
    expect(buildSnippet("short text")).toBe("short text");
  });

  it("returns empty string for falsy input", () => {
    expect(buildSnippet("")).toBe("");
    expect(buildSnippet(null)).toBe("");
    expect(buildSnippet(undefined)).toBe("");
  });

  it("respects custom maxLen", () => {
    const result = buildSnippet("a".repeat(20), 10);
    expect(result).toBe("a".repeat(10) + "…");
  });

  it("handles multiple mentions with surrounding text", () => {
    const content = "@[alice:1] said hello to @[bob:2]";
    expect(buildSnippet(content)).toBe("@alice said hello to @bob");
  });
});
