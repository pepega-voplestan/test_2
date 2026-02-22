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
