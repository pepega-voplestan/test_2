/**
 * Social platform configuration: validation, normalization, and display extraction.
 *
 * Each platform defines:
 * - label: Russian display name
 * - hostnames: allowed hostnames for URL validation
 * - validate(url): returns true if the URL is a valid profile link for this platform
 * - normalize(url): returns a canonical URL string
 * - extractDisplay(url): returns a human-readable identifier from the URL
 */

/** @type {string[]} */
export const SOCIAL_TYPES = [
  "steam", "telegram", "x", "battlenet", "playstation",
  "xbox", "epicgames", "youtube", "spotify",
];

/**
 * @typedef {Object} PlatformConfig
 * @property {string} label
 * @property {string[]} hostnames
 * @property {(url: URL) => boolean} validate
 * @property {(url: URL) => string} normalize
 * @property {(url: URL) => string} extractDisplay
 */

/** @type {Record<string, PlatformConfig>} */
export const SOCIAL_PLATFORMS = {
  steam: {
    label: "Steam",
    hostnames: ["steamcommunity.com"],
    validate(url) {
      // /id/<customUrl> or /profiles/<steamId64>
      const match = url.pathname.match(/^\/(id|profiles)\/([^/]+)\/?$/);
      return !!match && match[2].length > 0;
    },
    normalize(url) {
      const match = url.pathname.match(/^\/(id|profiles)\/([^/]+)\/?$/);
      return `https://steamcommunity.com/${match[1]}/${match[2]}`;
    },
    extractDisplay(url) {
      const match = url.pathname.match(/^\/(id|profiles)\/([^/]+)\/?$/);
      return match[2];
    },
  },

  telegram: {
    label: "Telegram",
    hostnames: ["t.me"],
    validate(url) {
      // /username only — reject /joinchat, /+, /s/, /share, /addstickers, etc.
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{5,32})\/?$/);
      if (!match) return false;
      const reserved = ["joinchat", "share", "addstickers", "addtheme", "proxy", "socks", "setlanguage", "iv"];
      return !reserved.includes(match[1].toLowerCase());
    },
    normalize(url) {
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{5,32})\/?$/);
      return `https://t.me/${match[1]}`;
    },
    extractDisplay(url) {
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{5,32})\/?$/);
      return `@${match[1]}`;
    },
  },

  x: {
    label: "X",
    hostnames: ["x.com", "twitter.com"],
    validate(url) {
      // /<username> — reject status, intent, share, hashtag, search, i/, settings, etc.
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      if (!match) return false;
      const reserved = ["home", "explore", "search", "notifications", "messages", "settings", "i", "intent", "hashtag", "share", "compose"];
      return !reserved.includes(match[1].toLowerCase());
    },
    normalize(url) {
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      return `https://x.com/${match[1]}`;
    },
    extractDisplay(url) {
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      return `@${match[1]}`;
    },
  },

  battlenet: {
    // Battle.net does not have a universal public profile URL.
    // The most common pattern is the Blizzard career profile for games like Overwatch/Diablo.
    // MVP: accept battle.net or blizzard.com profile-like URLs.
    label: "Battle.net",
    hostnames: ["battle.net", "www.battle.net"],
    validate(url) {
      // Accept: /en-us/profile/... or similar locale+profile paths
      // Also accept short paths like /<locale>/... that look profile-ish
      // Intentionally narrow for MVP — we require at least a path segment beyond locale
      const match = url.pathname.match(/^\/[a-z]{2}(-[a-z]{2})?\/profile\/([^/]+)\/?/i);
      if (match) return true;
      // Also accept direct paths like /account or broader profile patterns
      // Fallback: any non-trivial path on battle.net
      return url.pathname.length > 1 && url.pathname !== "/";
    },
    normalize(url) {
      const path = url.pathname.replace(/\/+$/, "");
      return `https://battle.net${path}`;
    },
    extractDisplay(url) {
      // Try to extract a meaningful identifier from the path
      const segments = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
      // Return the last meaningful segment
      return segments[segments.length - 1] || "Battle.net";
    },
  },

  playstation: {
    label: "PlayStation",
    hostnames: ["psnprofiles.com", "www.psnprofiles.com", "library.playstation.com"],
    validate(url) {
      if (url.hostname.includes("psnprofiles.com")) {
        // psnprofiles.com/<username>
        const match = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
        return !!match && match[1].length > 0;
      }
      if (url.hostname === "library.playstation.com") {
        // library.playstation.com (no standard public profile path, accept root or /recently-played)
        return true;
      }
      return false;
    },
    normalize(url) {
      if (url.hostname.includes("psnprofiles.com")) {
        const match = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
        return `https://psnprofiles.com/${match[1]}`;
      }
      return `https://${url.hostname}${url.pathname.replace(/\/+$/, "") || "/"}`;
    },
    extractDisplay(url) {
      if (url.hostname.includes("psnprofiles.com")) {
        const match = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
        return match[1];
      }
      const segments = url.pathname.split("/").filter(Boolean);
      return segments[segments.length - 1] || url.hostname;
    },
  },

  xbox: {
    label: "Xbox",
    hostnames: ["www.xbox.com", "xbox.com", "account.xbox.com"],
    validate(url) {
      // xbox.com/play/user/<gamertag> or /profile/<gamertag> or /en-US/profile/<gamertag>
      const match = url.pathname.match(/\/profile\/([^/]+)\/?$/i);
      if (match) return true;
      // Also accept xbox.com with any meaningful path
      return url.pathname.length > 1 && url.pathname !== "/";
    },
    normalize(url) {
      const match = url.pathname.match(/\/profile\/([^/]+)\/?$/i);
      if (match) {
        return `https://www.xbox.com/profile/${match[1]}`;
      }
      const path = url.pathname.replace(/\/+$/, "");
      return `https://www.xbox.com${path}`;
    },
    extractDisplay(url) {
      const match = url.pathname.match(/\/profile\/([^/]+)\/?$/i);
      if (match) return decodeURIComponent(match[1]);
      const segments = url.pathname.split("/").filter(Boolean);
      return segments[segments.length - 1] || "Xbox";
    },
  },

  epicgames: {
    // Epic Games public profiles are at: epicgames.com/id/<displayName>
    label: "Epic Games",
    hostnames: ["www.epicgames.com", "epicgames.com"],
    validate(url) {
      // /id/<name>
      const match = url.pathname.match(/^\/id\/([^/]+)\/?$/);
      if (match) return true;
      // Also accept /u/<hexId>
      const uMatch = url.pathname.match(/^\/u\/([a-f0-9]+)\/?$/i);
      return !!uMatch;
    },
    normalize(url) {
      const idMatch = url.pathname.match(/^\/id\/([^/]+)\/?$/);
      if (idMatch) return `https://www.epicgames.com/id/${idMatch[1]}`;
      const uMatch = url.pathname.match(/^\/u\/([a-f0-9]+)\/?$/i);
      if (uMatch) return `https://www.epicgames.com/u/${uMatch[1]}`;
      return `https://www.epicgames.com${url.pathname.replace(/\/+$/, "")}`;
    },
    extractDisplay(url) {
      const idMatch = url.pathname.match(/^\/id\/([^/]+)\/?$/);
      if (idMatch) return decodeURIComponent(idMatch[1]);
      const uMatch = url.pathname.match(/^\/u\/([a-f0-9]+)\/?$/i);
      if (uMatch) return uMatch[1];
      const segments = url.pathname.split("/").filter(Boolean);
      return segments[segments.length - 1] || "Epic Games";
    },
  },

  youtube: {
    label: "YouTube",
    hostnames: ["www.youtube.com", "youtube.com"],
    validate(url) {
      // /@handle, /channel/<id>, /c/<name>, /user/<name>
      if (url.pathname.match(/^\/@([A-Za-z0-9_.-]+)\/?$/)) return true;
      if (url.pathname.match(/^\/(channel|c|user)\/([^/]+)\/?$/)) return true;
      return false;
    },
    normalize(url) {
      const handleMatch = url.pathname.match(/^\/@([A-Za-z0-9_.-]+)\/?$/);
      if (handleMatch) return `https://www.youtube.com/@${handleMatch[1]}`;
      const pathMatch = url.pathname.match(/^\/(channel|c|user)\/([^/]+)\/?$/);
      if (pathMatch) return `https://www.youtube.com/${pathMatch[1]}/${pathMatch[2]}`;
      return `https://www.youtube.com${url.pathname.replace(/\/+$/, "")}`;
    },
    extractDisplay(url) {
      const handleMatch = url.pathname.match(/^\/@([A-Za-z0-9_.-]+)\/?$/);
      if (handleMatch) return `@${handleMatch[1]}`;
      const pathMatch = url.pathname.match(/^\/(channel|c|user)\/([^/]+)\/?$/);
      if (pathMatch) return pathMatch[2];
      return url.pathname.replace(/^\//, "").replace(/\/$/, "");
    },
  },

  spotify: {
    label: "Spotify",
    hostnames: ["open.spotify.com"],
    validate(url) {
      // /user/<id> or /artist/<id>
      const match = url.pathname.match(/^\/(user|artist)\/([^/]+)\/?$/);
      return !!match && match[2].length > 0;
    },
    normalize(url) {
      const match = url.pathname.match(/^\/(user|artist)\/([^/]+)\/?$/);
      return `https://open.spotify.com/${match[1]}/${match[2]}`;
    },
    extractDisplay(url) {
      const match = url.pathname.match(/^\/(user|artist)\/([^/]+)\/?$/);
      return decodeURIComponent(match[2]);
    },
  },
};

/**
 * Validate a URL string against a specific platform's rules.
 * @param {string} type - Platform type key
 * @param {string} urlStr - Raw URL string
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSocialUrl(type, urlStr) {
  const platform = SOCIAL_PLATFORMS[type];
  if (!platform) return { valid: false, error: "Неизвестная платформа" };

  let url;
  try {
    url = new URL(urlStr);
  } catch {
    return { valid: false, error: "Неверный формат ссылки" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { valid: false, error: "Ссылка должна начинаться с https://" };
  }

  const hostname = url.hostname.toLowerCase();
  if (!platform.hostnames.includes(hostname)) {
    return { valid: false, error: `Неверная ссылка для ${platform.label}` };
  }

  if (!platform.validate(url)) {
    return { valid: false, error: `Неверная ссылка для ${platform.label}` };
  }

  return { valid: true };
}

/**
 * Normalize a validated social URL.
 * @param {string} type
 * @param {string} urlStr
 * @returns {string}
 */
export function normalizeSocialUrl(type, urlStr) {
  const platform = SOCIAL_PLATFORMS[type];
  const url = new URL(urlStr);
  return platform.normalize(url);
}

/**
 * Extract a display name/handle from a validated social URL.
 * @param {string} type
 * @param {string} urlStr
 * @returns {string}
 */
export function extractSocialDisplay(type, urlStr) {
  const platform = SOCIAL_PLATFORMS[type];
  const url = new URL(urlStr);
  return platform.extractDisplay(url);
}
