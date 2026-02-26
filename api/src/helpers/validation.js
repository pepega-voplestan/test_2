import { z } from "zod";
import crypto from "crypto";

export const SHOUT_MAX_LENGTH = 400;

// Allowed: English, Russian letters, digits, dash, underscore, space (no leading/trailing spaces)
const USERNAME_RE = /^[A-Za-zА-Яа-яЁё0-9\-_ ]+$/;
const usernameField = z.string().trim()
  .min(3, { message: "Имя пользователя: от 3 до 32 символов" })
  .max(32, { message: "Имя пользователя: от 3 до 32 символов" })
  .regex(USERNAME_RE, {
    message: "Имя может содержать только буквы, цифры, дефис, подчёркивание и пробел",
  });
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

export const shoutSchema = z.object({
  content: z.string().default("").refine(
    (val) => effectiveCharCount(val) <= SHOUT_MAX_LENGTH,
    { message: `Текст слишком длинный (макс. ${SHOUT_MAX_LENGTH} символов)` }
  ),
  mediaId: z.string().uuid().optional(),
  youtubeUrl: z.string().max(500).optional(),
  isSpoiler: z.boolean().optional(),
  isNsfw: z.boolean().optional(),
  isPolitics: z.boolean().optional(),
});

export const commentSchema = z.object({
  content: z.string().default("").refine(
    (val) => effectiveCharCount(val) <= SHOUT_MAX_LENGTH,
    { message: `Текст слишком длинный (макс. ${SHOUT_MAX_LENGTH} символов)` }
  ),
  mediaId: z.string().uuid().optional(),
  youtubeUrl: z.string().max(500).optional(),
});

export const announcementSchema = z.object({
  content: z.string().min(1).max(5000),
  secret_key: z.string().min(1),
});

export const profileUpdateSchema = z.object({
  username: usernameField.optional(),
  avatar: z.string().max(500).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6).max(200).optional(),
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

export const CODE_EXPIRY_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;

export function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}
