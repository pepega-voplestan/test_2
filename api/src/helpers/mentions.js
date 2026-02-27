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
 * Build a short text snippet from shout/comment content for notification previews.
 * Strips @[name:id] mention tokens to @name, collapses whitespace, and truncates.
 *
 * @param {string} content
 * @param {number} maxLen
 * @returns {string}
 */
export function buildSnippet(content, maxLen = 60) {
  if (!content) return "";
  const stripped = content.replace(/@\[([^\]:]+):[^\]]+\]/g, "@$1").replace(/\|\|/g, "");
  const clean = stripped.replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + "…" : clean;
}
