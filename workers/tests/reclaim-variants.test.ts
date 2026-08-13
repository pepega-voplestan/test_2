import { describe, it, expect } from "vitest";
import { unreachableVariantPlan } from "../src/helpers/variant-rules.js";

/**
 * The per-kind reachability rule (spec FR-001..FR-003, data-model.md).
 *
 * The asymmetry is the whole point and is the easiest thing to get wrong:
 * 320 is dead for still images but LIVE for GIFs (personal library grid),
 * 1600 is dead for animated GIFs but LIVE for still images (lightbox), and a
 * single-frame GIF is reachable at both ends so nothing of it is dead.
 */

describe("unreachableVariantPlan — non-animated images", () => {
  it("marks 320 removable", () => {
    const p = unreachableVariantPlan("image", { animated: false }, false);
    expect(p?.remove).toEqual(["320.webp"]);
    expect(p?.widths).toEqual(["320"]);
  });

  it("requires 960 to survive", () => {
    expect(unreachableVariantPlan("image", { animated: false }, false)?.survivor).toBe("960.webp");
  });

  it("never removes 1600, which the lightbox reads", () => {
    expect(unreachableVariantPlan("image", {}, false)?.remove).not.toContain("1600.webp");
  });

  it("treats absent `animated` as non-animated", () => {
    expect(unreachableVariantPlan("image", {}, false)?.remove).toEqual(["320.webp"]);
  });
});

describe("unreachableVariantPlan — animated images", () => {
  it("marks 1600 removable", () => {
    const p = unreachableVariantPlan("image", { animated: true }, true);
    expect(p?.remove).toEqual(["1600.webp"]);
    expect(p?.widths).toEqual(["1600"]);
  });

  it("never removes 320, which the GIF picker grid reads", () => {
    expect(unreachableVariantPlan("image", { animated: true }, true)?.remove).not.toContain("320.webp");
  });

  it("never removes 960, which the blur placeholder reads", () => {
    expect(unreachableVariantPlan("image", { animated: true }, true)?.remove).not.toContain("960.webp");
  });

  it("never removes the animated source itself", () => {
    expect(unreachableVariantPlan("image", { animated: true }, true)?.remove).not.toContain("original.gif");
  });

  it("still applies the animated rule when the source GIF is already gone", () => {
    // Falling through to STILL here would delete the 320 the picker tile reads.
    expect(unreachableVariantPlan("image", { animated: true }, false)?.remove).toEqual(["1600.webp"]);
  });
});

describe("unreachableVariantPlan — single-frame GIF in the personal library", () => {
  it("has nothing dead: 320 feeds the picker grid, 1600 feeds the lightbox", () => {
    expect(unreachableVariantPlan("image", { animated: false }, true)).toBeNull();
  });

  it("is distinguished from an ordinary still only by the source file", () => {
    const meta = { animated: false, w: 200, h: 200 };
    expect(unreachableVariantPlan("image", meta, true)).toBeNull();
    expect(unreachableVariantPlan("image", meta, false)?.remove).toEqual(["320.webp"]);
  });
});

describe("unreachableVariantPlan — 960 is never removable for any kind", () => {
  it.each([
    ["static", { animated: false }, false],
    ["animated", { animated: true }, true],
    ["single-frame gif", { animated: false }, true],
  ])("%s", (_label, meta, hasGifSource) => {
    expect(unreachableVariantPlan("image", meta, hasGifSource)?.remove ?? []).not.toContain("960.webp");
  });
});

describe("unreachableVariantPlan — non-image kinds are skipped", () => {
  it.each(["video", "youtube", "giphy"])("returns null for %s", (kind) => {
    expect(unreachableVariantPlan(kind, {}, false)).toBeNull();
  });
});

describe("unreachableVariantPlan — idempotency", () => {
  it("returns null once the variant is already recorded as reclaimed", () => {
    const meta = { animated: false, reclaimed: { variants: ["320"], at: "2026-08-12T00:00:00.000Z" } };
    expect(unreachableVariantPlan("image", meta, false)).toBeNull();
  });

  it("still returns a plan when a DIFFERENT variant was previously reclaimed", () => {
    const meta = { animated: false, reclaimed: { variants: ["9999"], at: "2026-08-12T00:00:00.000Z" } };
    expect(unreachableVariantPlan("image", meta, false)?.remove).toEqual(["320.webp"]);
  });

  it("returns null for media whose files were wholly reclaimed", () => {
    const meta = { animated: false, reclaimed: { files: true, at: "2026-08-12T00:00:00.000Z" } };
    expect(unreachableVariantPlan("image", meta, false)).toBeNull();
  });
});
