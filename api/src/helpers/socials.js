/**
 * Social platform configuration: validation, normalization, and display extraction.
 *
 * Each platform defines:
 * - label: Russian display name
 * - hostnames: allowed hostnames for URL validation
 * - validate(url): returns true if the URL is a valid profile link for this platform
 * - normalize(url): returns a canonical URL string
 * - extractDisplay(url): returns a human-readable identifier from the URL
 *
 * Sort order: gaming → entertainment → socials → other
 */

/** @type {string[]} */
export const SOCIAL_TYPES = [
  "steam", "playstation", "xbox", "battlenet", "epicgames",
  "retroachievements", "exophase", "backloggd",
  "youtube", "myshows",
  "telegram", "x", "discord",
  "boosty",
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
    preprocessInput(raw) {
      const trimmed = raw.trim();
      // Accept bare username (alphanumeric, underscore, hyphen, 2-32 chars)
      const match = trimmed.match(/^([A-Za-z0-9_-]{2,32})$/);
      if (match) {
        return { url: `https://steamcommunity.com/id/${match[1]}`, display: match[1] };
      }
      return null;
    },
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

  playstation: {
    label: "PlayStation",
    hostnames: ["psnprofiles.com", "www.psnprofiles.com", "library.playstation.com"],
    preprocessInput(raw) {
      const trimmed = raw.trim();
      const match = trimmed.match(/^([A-Za-z0-9_-]{3,16})$/);
      if (match) {
        return { url: `https://psnprofiles.com/${match[1]}`, display: match[1] };
      }
      return null;
    },
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

  battlenet: {
    label: "Battle.net",
    hostnames: [],
    /** Accept BattleTag#1234 plain text — Battle.net has no public profile URLs */
    preprocessInput(raw) {
      const trimmed = raw.trim();
      // BattleTag#1234 format
      const match = trimmed.match(/^([A-Za-z0-9\u0430-\u044f\u0410-\u042f\u0451\u0401]{2,12})#(\d{4,6})$/u);
      if (match) {
        return { url: null, display: trimmed };
      }
      return null;
    },
    validate() { return false; },
    normalize() { return ""; },
    extractDisplay() { return ""; },
  },

  epicgames: {
    // Epic Games public profiles are at: epicgames.com/id/<displayName>
    label: "Epic Games",
    hostnames: ["www.epicgames.com", "epicgames.com"],
    preprocessInput(raw) {
      const trimmed = raw.trim();
      const match = trimmed.match(/^([A-Za-z0-9_.-]{3,32})$/);
      if (match) {
        return { url: `https://www.epicgames.com/id/${match[1]}`, display: match[1] };
      }
      return null;
    },
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

  retroachievements: {
    label: "RetroAchievements",
    hostnames: ["retroachievements.org", "www.retroachievements.org"],
    preprocessInput(raw) {
      const trimmed = raw.trim();
      const match = trimmed.match(/^([A-Za-z0-9_.-]{2,20})$/);
      if (match) {
        return { url: `https://retroachievements.org/user/${match[1]}`, display: match[1] };
      }
      return null;
    },
    validate(url) {
      // /user/<username>
      const match = url.pathname.match(/^\/user\/([A-Za-z0-9_.-]+)\/?$/);
      return !!match && match[1].length > 0;
    },
    normalize(url) {
      const match = url.pathname.match(/^\/user\/([A-Za-z0-9_.-]+)\/?$/);
      return `https://retroachievements.org/user/${match[1]}`;
    },
    extractDisplay(url) {
      const match = url.pathname.match(/^\/user\/([A-Za-z0-9_.-]+)\/?$/);
      return match[1];
    },
  },

  exophase: {
    label: "Exophase",
    hostnames: ["www.exophase.com", "exophase.com"],
    validate(url) {
      // Accept /user/<name> and any sub-paths (e.g. /user/name/xbox/, /user/name/achievements/)
      const match = url.pathname.match(/^\/user\/([A-Za-z0-9_-]+)(\/|$)/);
      return !!match && match[1].length > 0;
    },
    normalize(url) {
      const match = url.pathname.match(/^\/user\/([A-Za-z0-9_-]+)(\/|$)/);
      return `https://www.exophase.com/user/${match[1]}/`;
    },
    extractDisplay(url) {
      const match = url.pathname.match(/^\/user\/([A-Za-z0-9_-]+)(\/|$)/);
      return match[1];
    },
  },

  backloggd: {
    label: "Backloggd",
    hostnames: ["www.backloggd.com", "backloggd.com"],
    preprocessInput(raw) {
      const trimmed = raw.trim();
      const match = trimmed.match(/^([A-Za-z0-9_]{2,32})$/);
      if (match) {
        return { url: `https://www.backloggd.com/u/${match[1]}/`, display: match[1] };
      }
      return null;
    },
    validate(url) {
      const match = url.pathname.match(/^\/u\/([A-Za-z0-9_]+)\/?$/);
      return !!match && match[1].length > 0;
    },
    normalize(url) {
      const match = url.pathname.match(/^\/u\/([A-Za-z0-9_]+)\/?$/);
      return `https://www.backloggd.com/u/${match[1]}/`;
    },
    extractDisplay(url) {
      const match = url.pathname.match(/^\/u\/([A-Za-z0-9_]+)\/?$/);
      return match[1];
    },
  },

  youtube: {
    label: "YouTube",
    hostnames: ["www.youtube.com", "youtube.com"],
    preprocessInput(raw) {
      const trimmed = raw.trim();
      // Accept @handle or bare handle
      const match = trimmed.match(/^@?([A-Za-z0-9_.-]{3,30})$/);
      if (match) {
        return { url: `https://www.youtube.com/@${match[1]}`, display: match[1] };
      }
      return null;
    },
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
      if (handleMatch) return handleMatch[1];
      const pathMatch = url.pathname.match(/^\/(channel|c|user)\/([^/]+)\/?$/);
      if (pathMatch) return pathMatch[2];
      return url.pathname.replace(/^\//, "").replace(/\/$/, "");
    },
  },

  myshows: {
    label: "MyShows",
    hostnames: ["myshows.me", "en.myshows.me"],
    preprocessInput(raw) {
      const trimmed = raw.trim();
      const match = trimmed.match(/^([A-Za-z0-9_-]{2,32})$/);
      if (match) {
        return { url: `https://myshows.me/m/${match[1]}`, display: match[1] };
      }
      return null;
    },
    validate(url) {
      // Accept /m/<username> or /<username> (direct profile URL)
      const mMatch = url.pathname.match(/^\/m\/([A-Za-z0-9_-]+)\/?$/);
      if (mMatch && mMatch[1].length > 0) return true;
      const directMatch = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
      if (!directMatch) return false;
      const reserved = ["m", "search", "login", "signup", "api", "about", "news", "profile"];
      return !reserved.includes(directMatch[1].toLowerCase());
    },
    normalize(url) {
      const mMatch = url.pathname.match(/^\/m\/([A-Za-z0-9_-]+)\/?$/);
      if (mMatch) return `https://myshows.me/m/${mMatch[1]}`;
      // Direct /<username> → normalize to /m/<username>
      const directMatch = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
      return `https://myshows.me/m/${directMatch[1]}`;
    },
    extractDisplay(url) {
      const mMatch = url.pathname.match(/^\/m\/([A-Za-z0-9_-]+)\/?$/);
      if (mMatch) return mMatch[1];
      const directMatch = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
      return directMatch[1];
    },
  },

  telegram: {
    label: "Telegram",
    hostnames: ["t.me"],
    /** Accept @username plain text — auto-converts to t.me URL */
    preprocessInput(raw) {
      const trimmed = raw.trim();
      const match = trimmed.match(/^@?([A-Za-z0-9_]{5,32})$/);
      if (match) {
        return { url: `https://t.me/${match[1]}`, display: match[1] };
      }
      return null;
    },
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
      return match[1];
    },
  },

  x: {
    label: "X",
    hostnames: ["x.com", "twitter.com"],
    preprocessInput(raw) {
      const trimmed = raw.trim();
      const match = trimmed.match(/^@?([A-Za-z0-9_]{1,15})$/);
      if (match) {
        const reserved = ["home", "explore", "search", "notifications", "messages", "settings", "i", "intent", "hashtag", "share", "compose"];
        if (reserved.includes(match[1].toLowerCase())) return null;
        return { url: `https://x.com/${match[1]}`, display: match[1] };
      }
      return null;
    },
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
      return match[1];
    },
  },

  discord: {
    label: "Discord",
    hostnames: [],
    /** Accept username#1234 plain text — Discord has no public profile URLs */
    preprocessInput(raw) {
      const trimmed = raw.trim();
      // username#1234 (legacy discriminator) or just username (new format)
      const match = trimmed.match(/^([A-Za-z0-9_.]{2,32})(#\d{1,4})?$/);
      if (match) {
        return { url: null, display: trimmed };
      }
      return null;
    },
    validate() { return false; },
    normalize() { return ""; },
    extractDisplay() { return ""; },
  },

  boosty: {
    label: "Boosty",
    hostnames: ["boosty.to"],
    preprocessInput(raw) {
      const trimmed = raw.trim();
      const match = trimmed.match(/^([A-Za-z0-9_.-]{2,32})$/);
      if (match) {
        const reserved = ["app", "about", "legal", "login", "signup", "search", "explore"];
        if (reserved.includes(match[1].toLowerCase())) return null;
        return { url: `https://boosty.to/${match[1]}`, display: match[1] };
      }
      return null;
    },
    validate(url) {
      // boosty.to/<username>
      const match = url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/?$/);
      if (!match) return false;
      const reserved = ["app", "about", "legal", "login", "signup", "search", "explore"];
      return !reserved.includes(match[1].toLowerCase());
    },
    normalize(url) {
      const match = url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/?$/);
      return `https://boosty.to/${match[1]}`;
    },
    extractDisplay(url) {
      const match = url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/?$/);
      return match[1];
    },
  },
};

/**
 * Pre-process raw user input for platforms that accept non-URL values.
 * Returns { url, display } if the input was handled, or null to fall through to URL validation.
 * @param {string} type - Platform type key
 * @param {string} rawInput - Raw user input (may be a URL or plain text)
 * @returns {{ url: string|null, display: string } | null}
 */
export function preprocessSocialInput(type, rawInput) {
  const platform = SOCIAL_PLATFORMS[type];
  if (!platform || !platform.preprocessInput) return null;
  return platform.preprocessInput(rawInput);
}

/**
 * Auto-prepend https:// if the input looks like a URL without a protocol.
 * E.g. "youtube.com/@handle" -> "https://youtube.com/@handle"
 * @param {string} raw
 * @returns {string}
 */
export function ensureProtocol(raw) {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Looks like a domain (contains a dot, starts with a word char)
  if (/^\w[^\s]*\.[^\s]+/.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

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

  if (url.protocol !== "https:") {
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
 * Extract a display name/handle from a validated social URL (synchronous, URL-based only).
 * @param {string} type
 * @param {string} urlStr
 * @returns {string}
 */
export function extractSocialDisplay(type, urlStr) {
  const platform = SOCIAL_PLATFORMS[type];
  const url = new URL(urlStr);
  return platform.extractDisplay(url);
}

/* ────────────────────── Async display resolution ────────────────────── */
/* For platforms where the URL contains an opaque ID instead of a human-readable
   name, we try to resolve the actual username/persona via public APIs.
   Falls back to synchronous URL-based extraction on any failure. */

const RESOLVE_TIMEOUT = 3000;

/**
 * Steam: fetch persona name from the public XML profile.
 * Works for both /id/<customUrl> and /profiles/<steamId64>.
 * The vanity URL is NOT necessarily the display name, so always fetch.
 */
async function resolveSteamDisplay(urlStr) {
  const url = new URL(urlStr);
  const match = url.pathname.match(/^\/(id|profiles)\/([^/]+)\/?$/);
  if (!match) return null;

  // Always fetch the XML profile to get the actual persona name
  try {
    const xmlUrl = `${urlStr.replace(/\/+$/, "")}/?xml=1`;
    const res = await fetch(xmlUrl, { signal: AbortSignal.timeout(RESOLVE_TIMEOUT) });
    if (!res.ok) return null;
    const text = await res.text();
    // Parse <steamID> tag (persona name) from the XML
    const nameMatch = text.match(/<steamID><!\[CDATA\[(.+?)\]\]><\/steamID>/);
    if (nameMatch && nameMatch[1]) return nameMatch[1];
  } catch {
    // network error or timeout — fall back
  }
  return null;
}

/**
 * YouTube: /channel/<id> -> fetch channel name from the public RSS feed.
 * /@handle, /c/<name>, /user/<name> already contain readable names.
 */
async function resolveYouTubeDisplay(urlStr) {
  const url = new URL(urlStr);

  // /@handle — already readable (return without @)
  const handleMatch = url.pathname.match(/^\/@([A-Za-z0-9_.-]+)\/?$/);
  if (handleMatch) return handleMatch[1];

  const pathMatch = url.pathname.match(/^\/(channel|c|user)\/([^/]+)\/?$/);
  if (!pathMatch) return null;

  // /c/<name> and /user/<name> are already readable
  if (pathMatch[1] !== "channel") return pathMatch[2];

  // /channel/<id> — try RSS feed (public, no API key needed)
  const channelId = pathMatch[2];
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const res = await fetch(rssUrl, { signal: AbortSignal.timeout(RESOLVE_TIMEOUT) });
    if (!res.ok) return null;
    const text = await res.text();
    // Parse <author><name>Channel Name</name></author> from RSS
    const nameMatch = text.match(/<author>\s*<name>(.+?)<\/name>/);
    if (nameMatch && nameMatch[1]) return nameMatch[1];
  } catch {
    // fall back
  }
  return null;
}

/**
 * Resolve a human-readable display name for a social URL.
 * Tries platform-specific APIs where URL contains opaque IDs,
 * then falls back to URL-based extraction, and finally to the platform label.
 *
 * @param {string} type - Platform type key
 * @param {string} urlStr - Normalized URL
 * @returns {Promise<string>} Resolved display name
 */
export async function resolveSocialDisplay(type, urlStr) {
  const platform = SOCIAL_PLATFORMS[type];
  let resolved = null;

  try {
    if (type === "steam") resolved = await resolveSteamDisplay(urlStr);
    else if (type === "youtube") resolved = await resolveYouTubeDisplay(urlStr);
  } catch {
    // any unexpected error — fall back silently
  }

  if (resolved) return resolved;

  // Fall back to synchronous URL-based extraction
  const fromUrl = extractSocialDisplay(type, urlStr);

  // If the extracted value looks like an opaque ID (not human-readable),
  // use the platform label instead
  if (fromUrl && !looksOpaque(fromUrl)) return fromUrl;

  return platform ? platform.label : fromUrl;
}

/**
 * Heuristic: returns true if a string looks like an opaque/machine ID
 * rather than a human-readable name.
 */
function looksOpaque(value) {
  if (!value) return true;
  // Long hex strings (YouTube channel IDs like UCxxxxxxx)
  if (/^[a-f0-9]{16,}$/i.test(value)) return true;
  // YouTube channel IDs: UC + 22 base64 chars
  if (/^UC[A-Za-z0-9_-]{20,}$/.test(value)) return true;
  // Very long alphanumeric strings (>20 chars with no spaces/readable pattern)
  if (value.length > 20 && /^[A-Za-z0-9_-]+$/.test(value)) return true;
  return false;
}
