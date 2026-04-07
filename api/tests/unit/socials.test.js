import { describe, it, expect, vi } from "vitest";
import {
  validateSocialUrl,
  normalizeSocialUrl,
  extractSocialDisplay,
  resolveSocialDisplay,
  ensureProtocol,
  preprocessSocialInput,
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
      expect(SOCIAL_TYPES).toContain("battlenet");
      expect(SOCIAL_TYPES).toContain("playstation");
      expect(SOCIAL_TYPES).toContain("xbox");
      expect(SOCIAL_TYPES).toContain("epicgames");
      expect(SOCIAL_TYPES).toContain("boosty");
      expect(SOCIAL_TYPES).toContain("retroachievements");
      expect(SOCIAL_TYPES).toContain("exophase");
      expect(SOCIAL_TYPES).toContain("backloggd");
      expect(SOCIAL_TYPES).toContain("myshows");
      expect(SOCIAL_TYPES).toContain("shikimori");
    });

    it("does not contain removed platforms", () => {
      expect(SOCIAL_TYPES).not.toContain("spotify");
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

    // Battle.net — uses BattleTag format, not URLs
    it("rejects battle.net URLs (BattleTag only)", () => {
      expect(validateSocialUrl("battlenet", "https://battle.net/en-us/profile/Player-1234").valid).toBe(false);
    });

    // Exophase
    it("accepts exophase user URL", () => {
      expect(validateSocialUrl("exophase", "https://www.exophase.com/user/TestPlayer").valid).toBe(true);
    });

    it("rejects exophase non-user URL", () => {
      expect(validateSocialUrl("exophase", "https://www.exophase.com/game/test").valid).toBe(false);
    });

    // Backloggd
    it("accepts backloggd user URL", () => {
      expect(validateSocialUrl("backloggd", "https://www.backloggd.com/u/TestPlayer").valid).toBe(true);
    });

    it("rejects backloggd non-user URL", () => {
      expect(validateSocialUrl("backloggd", "https://www.backloggd.com/games/test").valid).toBe(false);
    });

    // MyShows
    it("accepts myshows profile URL", () => {
      expect(validateSocialUrl("myshows", "https://myshows.me/m/testuser").valid).toBe(true);
    });

    it("accepts myshows en subdomain", () => {
      expect(validateSocialUrl("myshows", "https://en.myshows.me/m/testuser").valid).toBe(true);
    });

    it("rejects myshows non-profile URL", () => {
      expect(validateSocialUrl("myshows", "https://myshows.me/view/123").valid).toBe(false);
    });

    // Shikimori
    it("accepts shikimori profile URL", () => {
      expect(validateSocialUrl("shikimori", "https://shikimori.one/TestUser").valid).toBe(true);
    });

    it("accepts shikimori profile URL with +id", () => {
      expect(validateSocialUrl("shikimori", "https://shikimori.one/TestUser+12345").valid).toBe(true);
    });

    it("accepts shikimori.me domain", () => {
      expect(validateSocialUrl("shikimori", "https://shikimori.me/TestUser").valid).toBe(true);
    });

    it("rejects shikimori reserved paths", () => {
      expect(validateSocialUrl("shikimori", "https://shikimori.one/animes").valid).toBe(false);
      expect(validateSocialUrl("shikimori", "https://shikimori.one/forum").valid).toBe(false);
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

    it("normalizes shikimori.me to shikimori.one", () => {
      expect(normalizeSocialUrl("shikimori", "https://shikimori.me/TestUser"))
        .toBe("https://shikimori.one/TestUser");
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

    it("extracts telegram username without @", () => {
      expect(extractSocialDisplay("telegram", "https://t.me/testuser"))
        .toBe("testuser");
    });

    it("extracts x handle without @", () => {
      expect(extractSocialDisplay("x", "https://x.com/maxozornin"))
        .toBe("maxozornin");
    });

    it("extracts youtube handle without @", () => {
      expect(extractSocialDisplay("youtube", "https://www.youtube.com/@coolname"))
        .toBe("coolname");
    });

    it("extracts youtube channel id", () => {
      expect(extractSocialDisplay("youtube", "https://www.youtube.com/channel/UC12345"))
        .toBe("UC12345");
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

    it("extracts exophase username", () => {
      expect(extractSocialDisplay("exophase", "https://www.exophase.com/user/TestPlayer/"))
        .toBe("TestPlayer");
    });

    it("extracts backloggd username", () => {
      expect(extractSocialDisplay("backloggd", "https://www.backloggd.com/u/TestPlayer/"))
        .toBe("TestPlayer");
    });

    it("extracts myshows username", () => {
      expect(extractSocialDisplay("myshows", "https://myshows.me/m/testuser"))
        .toBe("testuser");
    });

    it("extracts shikimori username (strips +id)", () => {
      expect(extractSocialDisplay("shikimori", "https://shikimori.one/TestUser+12345"))
        .toBe("TestUser");
    });
  });

  describe("preprocessSocialInput", () => {
    it("converts bare steam username to URL", () => {
      const result = preprocessSocialInput("steam", "FlameInTheDark");
      expect(result).toEqual({ url: "https://steamcommunity.com/id/FlameInTheDark", display: "FlameInTheDark" });
    });

    it("converts bare X username to URL", () => {
      const result = preprocessSocialInput("x", "maxozornin");
      expect(result).toEqual({ url: "https://x.com/maxozornin", display: "maxozornin" });
    });

    it("converts @username for X to URL", () => {
      const result = preprocessSocialInput("x", "@maxozornin");
      expect(result).toEqual({ url: "https://x.com/maxozornin", display: "maxozornin" });
    });

    it("rejects reserved X usernames", () => {
      expect(preprocessSocialInput("x", "home")).toBeNull();
      expect(preprocessSocialInput("x", "settings")).toBeNull();
    });

    it("converts telegram @username", () => {
      const result = preprocessSocialInput("telegram", "@testuser");
      expect(result).toEqual({ url: "https://t.me/testuser", display: "testuser" });
    });

    it("converts telegram bare username", () => {
      const result = preprocessSocialInput("telegram", "testuser");
      expect(result).toEqual({ url: "https://t.me/testuser", display: "testuser" });
    });

    it("handles Discord username", () => {
      const result = preprocessSocialInput("discord", "cooluser#1234");
      expect(result).toEqual({ url: null, display: "cooluser#1234" });
    });

    it("handles Battle.net tag", () => {
      const result = preprocessSocialInput("battlenet", "Player#12345");
      expect(result).toEqual({ url: null, display: "Player#12345" });
    });

    it("converts YouTube @handle", () => {
      const result = preprocessSocialInput("youtube", "@coolchannel");
      expect(result).toEqual({ url: "https://www.youtube.com/@coolchannel", display: "coolchannel" });
    });

    it("converts bare YouTube handle", () => {
      const result = preprocessSocialInput("youtube", "coolchannel");
      expect(result).toEqual({ url: "https://www.youtube.com/@coolchannel", display: "coolchannel" });
    });

    it("converts boosty username", () => {
      const result = preprocessSocialInput("boosty", "coolcreator");
      expect(result).toEqual({ url: "https://boosty.to/coolcreator", display: "coolcreator" });
    });

    it("rejects reserved boosty names", () => {
      expect(preprocessSocialInput("boosty", "login")).toBeNull();
    });

    it("converts retroachievements username", () => {
      const result = preprocessSocialInput("retroachievements", "retrogamer");
      expect(result).toEqual({ url: "https://retroachievements.org/user/retrogamer", display: "retrogamer" });
    });

    it("converts playstation username", () => {
      const result = preprocessSocialInput("playstation", "TestGamer");
      expect(result).toEqual({ url: "https://psnprofiles.com/TestGamer", display: "TestGamer" });
    });

    it("converts epicgames username", () => {
      const result = preprocessSocialInput("epicgames", "TestPlayer");
      expect(result).toEqual({ url: "https://www.epicgames.com/id/TestPlayer", display: "TestPlayer" });
    });

    it("converts exophase username", () => {
      const result = preprocessSocialInput("exophase", "TestPlayer");
      expect(result).toEqual({ url: "https://www.exophase.com/user/TestPlayer/", display: "TestPlayer" });
    });

    it("converts backloggd username", () => {
      const result = preprocessSocialInput("backloggd", "TestPlayer");
      expect(result).toEqual({ url: "https://www.backloggd.com/u/TestPlayer/", display: "TestPlayer" });
    });

    it("converts myshows username", () => {
      const result = preprocessSocialInput("myshows", "testuser");
      expect(result).toEqual({ url: "https://myshows.me/m/testuser", display: "testuser" });
    });

    it("converts shikimori username", () => {
      const result = preprocessSocialInput("shikimori", "TestUser");
      expect(result).toEqual({ url: "https://shikimori.one/TestUser", display: "TestUser" });
    });

    it("strips +id from shikimori display", () => {
      const result = preprocessSocialInput("shikimori", "TestUser+12345");
      expect(result).toEqual({ url: "https://shikimori.one/TestUser+12345", display: "TestUser" });
    });

    it("returns null for platforms without preprocessInput", () => {
      expect(preprocessSocialInput("xbox", "TestGamer")).toBeNull();
    });
  });

  describe("resolveSocialDisplay", () => {
    it("resolves steam /id/ URL via XML API", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`<?xml version="1.0" encoding="UTF-8"?>
          <profile>
            <steamID><![CDATA[FlamePlayer]]></steamID>
          </profile>`),
      });
      try {
        const result = await resolveSocialDisplay("steam", "https://steamcommunity.com/id/FlameInTheDark");
        expect(result).toBe("FlamePlayer");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("falls back to platform label for steam /profiles/ when API is unreachable", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));
      try {
        const result = await resolveSocialDisplay("steam", "https://steamcommunity.com/profiles/76561199520238573");
        expect(result).toBe("Steam");
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

    it("resolves youtube channel name from RSS feed", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`<?xml version="1.0" encoding="UTF-8"?>
          <feed><author><name>My Cool Channel</name><uri>https://www.youtube.com/channel/UC12345abc</uri></author></feed>`),
      });
      try {
        const result = await resolveSocialDisplay("youtube", "https://www.youtube.com/channel/UC12345abc");
        expect(result).toBe("My Cool Channel");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns handle without @ for youtube handle URL", async () => {
      const result = await resolveSocialDisplay("youtube", "https://www.youtube.com/@coolname");
      expect(result).toBe("coolname");
    });

    it("falls back to URL extraction for telegram (no API resolution)", async () => {
      const result = await resolveSocialDisplay("telegram", "https://t.me/testuser");
      expect(result).toBe("testuser");
    });

    it("falls back to URL extraction for x (no API resolution)", async () => {
      const result = await resolveSocialDisplay("x", "https://x.com/elonmusk");
      expect(result).toBe("elonmusk");
    });

    it("falls back to URL extraction for new platforms", async () => {
      expect(await resolveSocialDisplay("exophase", "https://www.exophase.com/user/TestPlayer/")).toBe("TestPlayer");
      expect(await resolveSocialDisplay("backloggd", "https://www.backloggd.com/u/TestPlayer/")).toBe("TestPlayer");
      expect(await resolveSocialDisplay("myshows", "https://myshows.me/m/testuser")).toBe("testuser");
      expect(await resolveSocialDisplay("shikimori", "https://shikimori.one/TestUser")).toBe("TestUser");
    });
  });

  describe("ensureProtocol", () => {
    it("leaves https:// URLs unchanged", () => {
      expect(ensureProtocol("https://youtube.com/@test")).toBe("https://youtube.com/@test");
    });

    it("leaves http:// URLs unchanged", () => {
      expect(ensureProtocol("http://youtube.com/@test")).toBe("http://youtube.com/@test");
    });

    it("prepends https:// to bare domain", () => {
      expect(ensureProtocol("youtube.com/@MadHighlights")).toBe("https://youtube.com/@MadHighlights");
    });

    it("prepends https:// to www domain", () => {
      expect(ensureProtocol("www.youtube.com/@MadHighlights")).toBe("https://www.youtube.com/@MadHighlights");
    });

    it("prepends https:// to steamcommunity.com", () => {
      expect(ensureProtocol("steamcommunity.com/id/test")).toBe("https://steamcommunity.com/id/test");
    });

    it("does not prepend to plain text without dots", () => {
      expect(ensureProtocol("hardo#1234")).toBe("hardo#1234");
    });

    it("trims whitespace", () => {
      expect(ensureProtocol("  youtube.com/@test  ")).toBe("https://youtube.com/@test");
    });
  });
});
