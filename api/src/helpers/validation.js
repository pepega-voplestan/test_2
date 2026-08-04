import { z } from "zod";
import crypto from "crypto";

export const SHOUT_MAX_LENGTH = 1000;
export const COMMENT_MAX_LENGTH = 400;

// Allowed: English, Russian letters, digits, dash, underscore, space (no leading/trailing spaces)
const USERNAME_RE = /^[A-Za-zА-Яа-яЁё0-9\-_ ]+$/;
const HAS_LATIN = /[A-Za-z]/;
const HAS_CYRILLIC = /[А-Яа-яЁё]/;
const usernameField = z.string().trim()
  .min(3, { message: "Имя пользователя: от 3 до 32 символов" })
  .max(32, { message: "Имя пользователя: от 3 до 32 символов" })
  .regex(USERNAME_RE, {
    message: "Имя может содержать только буквы, цифры, дефис, подчёркивание и пробел",
  })
  .refine(
    (val) => !(HAS_LATIN.test(val) && HAS_CYRILLIC.test(val)),
    { message: "Имя не может содержать одновременно латинские и кириллические буквы" }
  );
const NEWLINE_CHAR_COST = 40;

export function effectiveCharCount(text) {
  const normalized = text.replace(/@\[([^\]]+):[^\]]+\]/g, "@$1");
  const newlines = (normalized.match(/\n/g) || []).length;
  return normalized.length + newlines * (NEWLINE_CHAR_COST - 1);
}

export const registerSchema = z.object({
  username: usernameField,
  password: z.string().min(6).max(200),
  email: z.string().email().max(200),
});

export const loginSchema = z.object({
  login: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

export const POLL_MAX_OPTIONS = 7;
export const POLL_OPTION_MAX_LENGTH = 144;

export const pollSchema = z.object({
  multi: z.boolean().default(false),
  options: z.array(z.string().min(1).max(POLL_OPTION_MAX_LENGTH))
    .min(2, { message: "Нужно хотя бы 2 варианта" })
    .max(POLL_MAX_OPTIONS, { message: `Максимум ${POLL_MAX_OPTIONS} вариантов` }),
});

export const shoutSchema = z.object({
  content: z.string().default("").refine(
    (val) => effectiveCharCount(val) <= SHOUT_MAX_LENGTH,
    { message: `Текст слишком длинный (макс. ${SHOUT_MAX_LENGTH} символов)` }
  ),
  mediaId: z.string().uuid().optional(),
  // Ordered gallery, max 5 (feature 006). Equivalent to `mediaId` when length 1.
  mediaIds: z.array(z.string().uuid()).min(1).max(5).optional(),
  youtubeUrl: z.string().max(500).optional(),
  visibilityTag: z.enum(["", "spoiler", "nsfw", "politics"]).optional(),
  poll: pollSchema.optional(),
});

export const commentSchema = z.object({
  content: z.string().default("").refine(
    (val) => effectiveCharCount(val) <= COMMENT_MAX_LENGTH,
    { message: `Текст слишком длинный (макс. ${COMMENT_MAX_LENGTH} символов)` }
  ),
  mediaId: z.string().uuid().optional(),
  // Ordered gallery, max 5 (feature 006). Equivalent to `mediaId` when length 1.
  mediaIds: z.array(z.string().uuid()).min(1).max(5).optional(),
  youtubeUrl: z.string().max(500).optional(),
  replyToId: z.string().uuid().nullable().optional(),
});

export const announcementSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  content: z.string().min(1).max(10000),
  secret_key: z.string().min(1),
});

export const profileUpdateSchema = z.object({
  username: usernameField.optional(),
  avatar: z.string().max(500).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6).max(200).optional(),
  showNsfw: z.boolean().optional(),
  showPolitics: z.boolean().optional(),
});

export const emailChangeSchema = z.object({
  email: z.string().email().max(200),
});

export const sendCodeSchema = z.object({
  username: usernameField,
  password: z.string().min(6).max(200),
  email: z.string().email().max(200),
});

export const verifyCodeSchema = z.object({
  email: z.string().email().max(200),
  code: z.string().length(6),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(200),
});

export const resetPasswordSchema = z.object({
  email: z.string().email().max(200),
  code: z.string().length(6),
  newPassword: z.string().min(6).max(200),
});

// ── Email domain whitelist (feature 007) ─────────────────────────────────────
// New emails may only enter the system — at registration AND at email change —
// if their domain is on this static allow-list. This list is the single source
// of truth: to change the permitted domains, edit it here and redeploy.
// Backend-authoritative guard; see specs/007-email-whitelist. Not a Zod schema
// because the two flows return distinct Russian messages; runs after each flow's
// Zod `.email()` format validation.
export const ALLOWED_EMAIL_DOMAINS = new Set([
  "ya.ru", "ukr.net", "mail.ru", "bk.ru", "yandex.ru", "yandex.com",
  "rambler.ru", "gmail.com", "list.ru", "inbox.ru", "lenta.ru", "icloud.com",
  "outlook.com", "hotmail.com", "live.com", "i.ua", "meta.ua", "yahoo.com",
]);

/**
 * True iff `email`'s domain is on the approved allow-list. Case-insensitive,
 * exact full-domain match (no subdomain/superstring acceptance). Returns false
 * when no `@` is present. Assumes `email` already passed Zod `.email()` format
 * validation.
 * @param {string} email
 * @returns {boolean}
 */
export function isAllowedEmailDomain(email) {
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at === -1) return false;
  return ALLOWED_EMAIL_DOMAINS.has(normalized.slice(at + 1));
}

import { SOCIAL_TYPES } from "./socials.js";

export const socialTypeSchema = z.enum(SOCIAL_TYPES);

export const createSocialSchema = z.object({
  type: socialTypeSchema,
  url: z.string().min(1).max(500),
});

export const updateSocialSchema = z.object({
  url: z.string().min(1).max(500),
});

export const EDIT_WINDOW_MS = 60 * 1000; // 1 minute after creation

export const editContentSchema = z.object({
  content: z.string().min(1, { message: "Текст не может быть пустым" }).refine(
    (val) => effectiveCharCount(val) <= SHOUT_MAX_LENGTH,
    { message: `Текст слишком длинный (макс. ${SHOUT_MAX_LENGTH} символов)` }
  ),
});

export const editCommentSchema = z.object({
  content: z.string().min(1, { message: "Текст не может быть пустым" }).refine(
    (val) => effectiveCharCount(val) <= COMMENT_MAX_LENGTH,
    { message: `Текст слишком длинный (макс. ${COMMENT_MAX_LENGTH} символов)` }
  ),
});

export const CODE_EXPIRY_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;

export function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

const GIPHY_ID_RE = /^[A-Za-z0-9-]+$/;
const giphyIdField = z.string().min(1).max(100).regex(GIPHY_ID_RE, { message: "Некорректный ID GIF" });
const giphyUrlField = z.string().url().refine(
  (val) => { try { return new URL(val).hostname.endsWith(".giphy.com"); } catch { return false; } },
  { message: "Некорректный URL GIF" }
);

export const giphySearchSchema = z.object({
  q: z.string().min(1).max(100).trim(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const giphyTrendingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const gifReferenceSchema = z.object({
  giphyId: giphyIdField,
  giphyUrl: giphyUrlField,
  giphyStill: giphyUrlField,
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});

export const gifFavoriteSchema = z.object({
  giphyId: giphyIdField,
  giphyUrl: giphyUrlField,
  giphyStill: giphyUrlField,
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});

export const giphyIdParamSchema = z.object({
  giphyId: giphyIdField,
});

export const GIF_FAVORITES_MAX = 500;
export const USER_GIFS_MAX = 30;
