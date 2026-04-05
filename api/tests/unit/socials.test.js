import { describe, it, expect, vi } from "vitest";
import {
  validateSocialUrl,
  normalizeSocialUrl,
  extractSocialDisplay,
  resolveSocialDisplay,
  SOCIAL_TYPES,
} from "../../src/helpers/socials.js";

describe("socials helper", () => {
  describe("SOCIAL_TYPES", () => {
    it("contains expected platforms", () => {
      expect(SOCIAL_TYPES).toContain("steam");
      expect(SOCIAL_TYPES).toContain("telegram");
      expect(SOCIAL_TYPES).toContain("x");
      expect(SOCIAL_TYPES).toContain("discord");
      expect(SOCIAL_TYPES).toContain("youtube");
      expect(SOCIAL_TYPES).toContain("spotify");
      expect(SOCIAL_TYPES).toContain("battlenet");
      expect(SOCIAL_TYPES).toContain("playstation");
      expect(SOCIAL_TYPES).toContain("xbox");
      expect(SOCIAL_TYPES).toContain("epicgames");
      expect(SOCIAL_TYPES).toContain("boosty");
    });
  });

  describe("validateSocialUrl", () => {
    it("rejects unknown platform", () => {
      expect(validateSocialUrl("tiktok", "https://tiktok.com/@user").valid).toBe(false);
    });

    it("rejects invalid URL", () => {
      expect(validateSocialUrl("steam", "not-a-url").valid).toBe(false);
    });

    it("rejects wrong hostname", () => {
      expect(validateSocialUrl("steam", "https://example.com/id/test").valid).toBe(false);
    });

    // Steam
    it("accepts steam /id/ URL", () => {
      expect(validateSocialUrl("steam", "https://steamcommunity.com/id/FlameInTheDark").valid).toBe(true);
    });

    it("accepts steam /profiles/ URL", () => {
      expect(validateSocialUrl("steam", "https://steamcommunity.com/profiles/76561198000000000").valid).toBe(true);
    });

    it("rejects steam invalid path", () => {
      expect(validateSocialUrl("steam", "https://steamcommunity.com/groups/test").valid).toBe(false);
    });

    // Telegram
    it("accepts telegram profile URL", () => {
      expect(validateSocialUrl("telegram", "https://t.me/testuser").valid).toBe(true);
    });

    it("rejects telegram joinchat", () => {
      expect(validateSocialUrl("telegram", "https://t.me/joinchat").valid).toBe(false);
    });

    it("rejects telegram + links", () => {
      expect(validateSocialUrl("telegram", "https://t.me/+abc123").valid).toBe(false);
    });

    it("rejects telegram short username", () => {
      expect(validateSocialUrl("telegram", "https://t.me/ab").valid).toBe(false);
    });

    // X / Twitter
    it("accepts x.com profile", () => {
      expect(validateSocialUrl("x", "https://x.com/maxozornin").valid).toBe(true);
    });

    it("accepts twitter.com profile", () => {
      expect(validateSocialUrl("x", "https://twitter.com/maxozornin").valid).toBe(true);
    });

    it("rejects x.com status URL", () => {
      expect(validateSocialUrl("x", "https://x.com/user/status/12345").valid).toBe(false);
    });

    it("rejects x.com reserved paths", () => {
      expect(validateSocialUrl("x", "https://x.com/home").valid).toBe(false);
      expect(validateSocialUrl("x", "https://x.com/settings").valid).toBe(false);
    });

    // YouTube
    it("accepts youtube @handle", () => {
      expect(validateSocialUrl("youtube", "https://www.youtube.com/@coolname").valid).toBe(true);
    });

    it("accepts youtube /channel/", () => {
      expect(validateSocialUrl("youtube", "https://www.youtube.com/channel/UC12345").valid).toBe(true);
    });

    it("accepts youtube /c/", () => {
      expect(validateSocialUrl("youtube", "https://www.youtube.com/c/MyChannel").valid).toBe(true);
    });

    it("accepts youtube /user/", () => {
      expect(validateSocialUrl("youtube", "https://www.youtube.com/user/OldName").valid).toBe(true);
    });

    it("rejects youtube watch URL", () => {
      expect(validateSocialUrl("youtube", "https://www.youtube.com/watch?v=abc123").valid).toBe(false);
    });

    it("rejects youtube shorts URL", () => {
      expect(validateSocialUrl("youtube", "https://www.youtube.com/shorts/abc123").valid).toBe(false);
    });

    // Spotify
    it("accepts spotify /user/ URL", () => {
      expect(validateSocialUrl("spotify", "https://open.spotify.com/user/testuser123").valid).toBe(true);
    });

    it("accepts spotify /artist/ URL", () => {
      expect(validateSocialUrl("spotify", "https://open.spotify.com/artist/abc123").valid).toBe(true);
    });

    it("rejects spotify track URL", () => {
      expect(validateSocialUrl("spotify", "https://open.spotify.com/track/abc123").valid).toBe(false);
    });

    it("rejects spotify playlist URL", () => {
      expect(validateSocialUrl("spotify", "https://open.spotify.com/playlist/abc123").valid).toBe(false);
    });

    // Epic Games
    it("accepts epicgames /id/ URL", () => {
      expect(validateSocialUrl("epicgames", "https://www.epicgames.com/id/TestPlayer").valid).toBe(true);
    });

    // PlayStation
    it("accepts psnprofiles URL", () => {
      expect(validateSocialUrl("playstation", "https://psnprofiles.com/TestGamer").valid).toBe(true);
    });

    // Xbox
    it("accepts xbox profile URL", () => {
      expect(validateSocialUrl("xbox", "https://www.xbox.com/profile/TestGamer").valid).toBe(true);
    });

    // Battle.net — now uses BattleTag format, not URLs
    it("rejects battle.net URLs (BattleTag only)", () => {
      expect(validateSocialUrl("battlenet", "https://battle.net/en-us/profile/Player-1234").valid).toBe(false);
    });
  });

  describe("normalizeSocialUrl", () => {
    it("normalizes steam URL (strips trailing slash)", () => {
      expect(normalizeSocialUrl("steam", "https://steamcommunity.com/id/FlameInTheDark/"))
        .toBe("https://steamcommunity.com/id/FlameInTheDark");
    });

    it("normalizes twitter.com to x.com", () => {
      expect(normalizeSocialUrl("x", "https://twitter.com/maxozornin"))
        .toBe("https://x.com/maxozornin");
    });

    it("normalizes youtube handle", () => {
      expect(normalizeSocialUrl("youtube", "https://youtube.com/@coolname/"))
        .toBe("https://www.youtube.com/@coolname");
    });
  });

  describe("extractSocialDisplay", () => {
    it("extracts steam custom URL id", () => {
      expect(extractSocialDisplay("steam", "https://steamcommunity.com/id/FlameInTheDark"))
        .toBe("FlameInTheDark");
    });

    it("extracts steam profile id", () => {
      expect(extractSocialDisplay("steam", "https://steamcommunity.com/profiles/76561198000000000"))
        .toBe("76561198000000000");
    });

    it("extracts telegram username with @", () => {
      expect(extractSocialDisplay("telegram", "https://t.me/testuser"))
        .toBe("@testuser");
    });

    it("extracts x handle with @", () => {
      expect(extractSocialDisplay("x", "https://x.com/maxozornin"))
        .toBe("@maxozornin");
    });

    it("extracts youtube @handle", () => {
      expect(extractSocialDisplay("youtube", "https://www.youtube.com/@coolname"))
        .toBe("@coolname");
    });

    it("extracts youtube channel id", () => {
      expect(extractSocialDisplay("youtube", "https://www.youtube.com/channel/UC12345"))
        .toBe("UC12345");
    });

    it("extracts spotify user id", () => {
      expect(extractSocialDisplay("spotify", "https://open.spotify.com/user/testuser123"))
        .toBe("testuser123");
    });

    it("extracts psnprofiles username", () => {
      expect(extractSocialDisplay("playstation", "https://psnprofiles.com/TestGamer"))
        .toBe("TestGamer");
    });

    it("extracts xbox gamertag from profile URL", () => {
      expect(extractSocialDisplay("xbox", "https://www.xbox.com/profile/TestGamer"))
        .toBe("TestGamer");
    });

    it("extracts epic games display name", () => {
      expect(extractSocialDisplay("epicgames", "https://www.epicgames.com/id/TestPlayer"))
        .toBe("TestPlayer");
    });
  });

  describe("resolveSocialDisplay", () => {
    it("returns vanity name for steam /id/ URL without API call", async () => {
      const result = await resolveSocialDisplay("steam", "https://steamcommunity.com/id/FlameInTheDark");
      expect(result).toBe("FlameInTheDark");
    });

    it("falls back to URL extraction for steam /profiles/ when API is unreachable", async () => {
      // Mock fetch to simulate network failure
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));
      try {
        const result = await resolveSocialDisplay("steam", "https://steamcommunity.com/profiles/76561199520238573");
        // Falls back to the numeric ID from URL
        expect(result).toBe("76561199520238573");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("resolves steam persona name from XML API", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`<?xml version="1.0" encoding="UTF-8"?>
          <profile>
            <steamID><![CDATA[CoolPlayer123]]></steamID>
            <steamID64>76561199520238573</steamID64>
          </profile>`),
      });
      try {
        const result = await resolveSocialDisplay("steam", "https://steamcommunity.com/profiles/76561199520238573");
        expect(result).toBe("CoolPlayer123");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("resolves youtube channel name from oEmbed", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ author_name: "My Cool Channel" }),
      });
      try {
        const result = await resolveSocialDisplay("youtube", "https://www.youtube.com/channel/UC12345abc");
        expect(result).toBe("My Cool Channel");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns @handle for youtube handle URL without API call", async () => {
      const result = await resolveSocialDisplay("youtube", "https://www.youtube.com/@coolname");
      expect(result).toBe("@coolname");
    });

    it("resolves spotify artist name from oEmbed", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ title: "Arctic Monkeys" }),
      });
      try {
        const result = await resolveSocialDisplay("spotify", "https://open.spotify.com/artist/7Ln80lUS6He07XvHI8qqHH");
        expect(result).toBe("Arctic Monkeys");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("falls back to URL extraction for telegram (no API resolution)", async () => {
      const result = await resolveSocialDisplay("telegram", "https://t.me/testuser");
      expect(result).toBe("@testuser");
    });

    it("falls back to URL extraction for x (no API resolution)", async () => {
      const result = await resolveSocialDisplay("x", "https://x.com/elonmusk");
      expect(result).toBe("@elonmusk");
    });
  });
});
