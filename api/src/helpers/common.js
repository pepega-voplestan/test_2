/** Convert a datetime value (Date object or legacy SQLite string) to ISO 8601 */
export function utcTimestamp(value) {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString();
  const s = value.replace(" ", "T");
  return s.endsWith("Z") ? s : s + "Z";
}

/** Convert a JS Date to SQLite datetime format "YYYY-MM-DD HH:MM:SS" */
export function toSqliteDatetime(date = new Date()) {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

export function avatarFor(username) {
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(
    username
  )}`;
}

/** Wrap async Express handler to forward rejections to error middleware */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const ANNOUNCEMENTS_SECRET = process.env.ANNOUNCEMENTS_SECRET || "";
