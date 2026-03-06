import { describe, it, expect } from "vitest";
import { effectiveLength } from "../../components/MentionInput";

// Same constant as used in the components
const COST = 40;

describe("effectiveLength", () => {
  it("returns 0 for empty string", () => {
    expect(effectiveLength("", COST)).toBe(0);
  });

  it("returns character count for plain text", () => {
    expect(effectiveLength("hello", COST)).toBe(5);
    expect(effectiveLength("hello world", COST)).toBe(11);
  });

  // ── Mention token normalisation ───────────────────────────────────────────

  it("replaces @[name:id] with @name (not full token)", () => {
    // @[alice:abc-123] → @alice = 6 chars, not 16
    expect(effectiveLength("@[alice:abc-123]", COST)).toBe(6);
  });

  it("handles a mention with a long username", () => {
    // @[LongUsername:abc-123-def-456] → @LongUsername = 13
    expect(effectiveLength("@[LongUsername:abc-123-def-456]", COST)).toBe(13);
  });

  it("handles multiple mention tokens in one string", () => {
    // "@[alice:id1] and @[bob:id2]" → "@alice and @bob" = 15
    expect(effectiveLength("@[alice:id1] and @[bob:id2]", COST)).toBe(15);
  });

  it("handles a mention at the start", () => {
    // "@[a:1] hi" → "@a hi" = 5
    expect(effectiveLength("@[a:1] hi", COST)).toBe(5);
  });

  // ── Spoiler marker stripping ──────────────────────────────────────────────

  it("strips || spoiler markers and counts only the inner content", () => {
    // "||spoiler||" → "spoiler" = 7
    expect(effectiveLength("||spoiler||", COST)).toBe(7);
  });

  it("strips multiple || pairs", () => {
    // "||a|| ||b||" → "a b" = 3
    expect(effectiveLength("||a|| ||b||", COST)).toBe(3);
  });

  it("handles text with no spoilers unchanged", () => {
    expect(effectiveLength("plain text", COST)).toBe(10);
  });

  // ── Newline cost ──────────────────────────────────────────────────────────

  it("charges (newlineCharCost - 1) extra for each newline", () => {
    // "a\nb" = 3 chars + 1 newline × (40-1) = 42
    expect(effectiveLength("a\nb", COST)).toBe(42);
  });

  it("charges for each newline independently", () => {
    // "a\nb\nc" = 5 chars + 2 × 39 = 83
    expect(effectiveLength("a\nb\nc", COST)).toBe(83);
  });

  it("respects newlineCharCost=1 (newlines cost nothing extra)", () => {
    expect(effectiveLength("a\nb", 1)).toBe(3);
  });

  it("respects a custom newlineCharCost", () => {
    // "a\nb" = 3 + 1*(10-1) = 12
    expect(effectiveLength("a\nb", 10)).toBe(12);
  });

  // ── Combinations ─────────────────────────────────────────────────────────

  it("combines mention normalisation, spoiler stripping, and newline cost", () => {
    // "@[alice:id1]\n||secret||"
    //   mentions → "@alice\n||secret||"
    //   spoilers → "@alice\nsecret"
    //   length   = 13,  newlines = 1
    //   result   = 13 + 1*39 = 52
    expect(effectiveLength("@[alice:id1]\n||secret||", COST)).toBe(52);
  });

  it("handles a string with only a newline", () => {
    // "\n" = 1 char + 1*(40-1) = 40
    expect(effectiveLength("\n", COST)).toBe(40);
  });
});
