/** Extract unique user IDs from @[username:userId] mention tokens in content. */

const MENTION_PATTERN = /@\[([^\]]+):([a-f0-9-]+)\]/g;

/**
 * Parse mention tokens from shout/comment content and return a deduplicated
 * list of mentioned user IDs. Excludes the actor so self-mentions don't
 * generate notifications.
 *
 * @param {string} content
 * @param {string|null} actorId - user ID to exclude (the author)
 * @returns {string[]}
 */
export function extractMentionedUserIds(content, actorId = null) {
  const seen = new Set();
  const re = new RegExp(MENTION_PATTERN.source, "g");
  let match;
  while ((match = re.exec(content)) !== null) {
    const userId = match[2];
    if (userId !== actorId) seen.add(userId);
  }
  return [...seen];
}

/**
 * Check whether content contains inline spoiler markers (||text||).
 * @param {string} content
 * @returns {boolean}
 */
export function hasInlineSpoiler(content) {
  if (!content) return false;
  // Match at least one pair of || ... || with content between them
  return /\|\|.+?\|\|/s.test(content);
}

/**
 * Build a short text snippet from shout/comment content for notification previews.
 * Strips @[name:id] mention tokens to @name, collapses whitespace, and truncates.
 *
 * If `spoiler` is `"politics"` or `true`, the entire snippet is replaced with
 * "СПОЙЛЕР" (these tags hide all content). For `"nsfw"` / `"spoiler"` tags the
 * text is visible so the snippet is built normally. Inline `||spoiler||` markers
 * are always replaced with asterisks of matching length.
 *
 * @param {string} content
 * @param {{ spoiler?: string|boolean, maxLen?: number }} options
 * @returns {string}
 */
export function buildSnippet(content, options = {}) {
  // Support legacy positional call: buildSnippet(content, 60)
  if (typeof options === "number") options = { maxLen: options };
  const { spoiler = false, maxLen = 60 } = options;

  if (!content) return "";
  if (spoiler === "politics" || spoiler === true) return "СПОЙЛЕР";

  // Replace inline spoiler ||text|| with asterisks matching the hidden text length
  const withMaskedSpoilers = content.replace(/\|\|(.+?)\|\|/gs, (_, inner) =>
    "*".repeat(inner.replace(/@\[([^\]:]+):[^\]]+\]/g, "@$1").length)
  );

  const stripped = withMaskedSpoilers.replace(/@\[([^\]:]+):[^\]]+\]/g, "@$1");
  const clean = stripped.replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + "…" : clean;
}
