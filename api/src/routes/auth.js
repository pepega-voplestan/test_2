import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../auth.js";
import { sendVerificationEmail } from "../email.js";
import { asyncHandler, utcTimestamp, toSqliteDatetime, avatarFor } from "../helpers/common.js";
import {
  sendCodeSchema, verifyCodeSchema, loginSchema,
  forgotPasswordSchema, resetPasswordSchema,
  generateCode, CODE_EXPIRY_MINUTES, CODE_MAX_ATTEMPTS,
} from "../helpers/validation.js";

const router = Router();

/* register step 1: send verification code */
router.post("/auth/register/send-code", asyncHandler(async (req, res) => {
  const regSetting = await prisma.setting.findUnique({ where: { key: "registration_open" } });
  if (regSetting?.value === "false") {
    return res.status(403).json({ error: "Регистрация временно закрыта" });
  }

  const parsed = sendCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const field = firstIssue?.path[0];
    if (field === "email") return res.status(400).json({ error: "Введите корректный email" });
    if (field === "username") return res.status(400).json({ error: "Имя пользователя: от 3 до 32 символов" });
    if (field === "password") return res.status(400).json({ error: "Пароль: минимум 6 символов" });
    return res.status(400).json({ error: "Некорректные данные" });
  }

  const { username, password, email } = parsed.data;
  console.log(`[Auth] Register send-code attempt: ${username} (${email})`);

  const existsUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existsUser) {
    console.log(`[Auth] Register failed: username "${username}" taken`);
    return res.status(409).json({ error: "Это имя пользователя уже занято" });
  }

  const existsEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existsEmail) {
    console.log(`[Auth] Register failed: email "${email}" taken`);
    return res.status(409).json({ error: "Этот email уже используется" });
  }

  // Invalidate any existing unused codes for this email + purpose
  await prisma.verificationCode.updateMany({
    where: { email, purpose: "register", used: 0 },
    data: { used: 1 },
  });

  const code = generateCode();
  const id = crypto.randomUUID();
  const password_hash = await hashPassword(password);
  const avatar = avatarFor(username);
  const payload = JSON.stringify({ username, password_hash, avatar });
  const expires_at = toSqliteDatetime(new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000));

  await prisma.verificationCode.create({
    data: { id, email, code, purpose: "register", payload, expires_at },
  });

  try {
    await sendVerificationEmail(email, code, "register");
  } catch (err) {
    console.error(`[Auth] Failed to send registration code to ${email}:`, err.message);
    return res.status(500).json({ error: err.message });
  }

  console.log(`[Auth] Registration code sent to ${email} for user "${username}"`);
  res.json({ ok: true });
}));

/* register step 2: verify code and create account */
router.post("/auth/register/verify", asyncHandler(async (req, res) => {
  const regSetting = await prisma.setting.findUnique({ where: { key: "registration_open" } });
  if (regSetting?.value === "false") {
    return res.status(403).json({ error: "Регистрация временно закрыта" });
  }

  const parsed = verifyCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Введите 6-значный код из письма" });
  }

  const { email, code } = parsed.data;
  console.log(`[Auth] Register verify attempt for ${email}`);

  const record = await prisma.verificationCode.findFirst({
    where: { email, purpose: "register", used: 0 },
    orderBy: { created_at: "desc" },
  });

  if (!record) {
    return res.status(400).json({ error: "Код не найден. Запросите новый код" });
  }

  // Check expiry
  const now = new Date();
  const expiresAt = new Date(record.expires_at + "Z");
  if (now > expiresAt) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { used: 1 },
    });
    return res.status(400).json({ error: "Код истёк. Запросите новый код" });
  }

  // Check attempts
  if (record.attempts >= CODE_MAX_ATTEMPTS) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { used: 1 },
    });
    return res.status(400).json({ error: "Слишком много попыток. Запросите новый код" });
  }

  // Increment attempts
  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { attempts: { increment: 1 } },
  });

  if (record.code !== code) {
    const remaining = CODE_MAX_ATTEMPTS - record.attempts - 1;
    return res.status(400).json({
      error: remaining > 0
        ? `Неверный код. Осталось попыток: ${remaining}`
        : "Неверный код. Запросите новый код"
    });
  }

  // Mark code as used
  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { used: 1 },
  });

  // Create user from stored payload
  const { username, password_hash, avatar } = JSON.parse(record.payload);

  // Re-check uniqueness (race condition guard)
  const existsUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existsUser) {
    return res.status(409).json({ error: "Это имя пользователя уже занято" });
  }
  const existsEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existsEmail) {
    return res.status(409).json({ error: "Этот email уже используется" });
  }

  const userId = crypto.randomUUID();
  await prisma.user.create({
    data: { id: userId, username, password_hash, avatar, email },
  });

  req.session.user = { id: userId, name: username, avatar };
  console.log(`[Auth] Registered new user: ${username} (${userId})`);
  res.json({ ok: true, user: req.session.user });
}));

/* login — accepts username or email in the "login" field */
router.post("/auth/login", asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные" });

  const { login, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: login }, { email: login }] },
    select: { id: true, username: true, password_hash: true, avatar: true, is_banned: true },
  });

  if (!user) {
    console.log(`[Auth] Login failed: "${login}" not found`);
    return res.status(401).json({ error: "Неверное имя пользователя или пароль" });
  }
  if (user.is_banned) {
    console.log(`[Auth] Login blocked: user "${user.username}" is banned`);
    return res.status(403).json({ error: "Аккаунт заблокирован" });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    console.log(`[Auth] Login failed: wrong password for "${user.username}"`);
    return res.status(401).json({ error: "Неверное имя пользователя или пароль" });
  }

  req.session.user = {
    id: user.id,
    name: user.username,
    avatar: user.avatar,
  };

  console.log(`[Auth] Login success: ${user.username} (${user.id})`);
  res.json({ ok: true, user: req.session.user });
}));

/* logout */
router.post("/auth/logout", (req, res) => {
  const userName = req.session?.user?.name || "unknown";
  console.log(`[Auth] Logout: ${userName}`);
  req.session.destroy(() => res.json({ ok: true }));
});

/* forgot password step 1: send reset code */
router.post("/auth/forgot-password/send-code", asyncHandler(async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Введите корректный email" });
  }

  const { email } = parsed.data;
  console.log(`[Auth] Forgot-password send-code for ${email}`);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, username: true },
  });
  if (!user) {
    // Don't reveal whether email exists — still return ok
    console.log(`[Auth] Forgot-password: email "${email}" not found (silent ok)`);
    return res.json({ ok: true });
  }

  // Invalidate any existing unused codes for this email + purpose
  await prisma.verificationCode.updateMany({
    where: { email, purpose: "reset", used: 0 },
    data: { used: 1 },
  });

  const code = generateCode();
  const id = crypto.randomUUID();
  const expires_at = toSqliteDatetime(new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000));

  await prisma.verificationCode.create({
    data: {
      id, email, code, purpose: "reset",
      payload: JSON.stringify({ userId: user.id, username: user.username }),
      expires_at,
    },
  });

  try {
    await sendVerificationEmail(email, code, "reset");
  } catch (err) {
    console.error(`[Auth] Failed to send reset code to ${email}:`, err.message);
    return res.status(500).json({ error: err.message });
  }

  console.log(`[Auth] Reset code sent to ${email}`);
  res.json({ ok: true });
}));

/* forgot password step 2: verify code and set new password */
router.post("/auth/forgot-password/reset", asyncHandler(async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "newPassword") return res.status(400).json({ error: "Пароль: минимум 6 символов" });
    if (field === "code") return res.status(400).json({ error: "Введите 6-значный код из письма" });
    return res.status(400).json({ error: "Некорректные данные" });
  }

  const { email, code, newPassword } = parsed.data;
  console.log(`[Auth] Forgot-password reset attempt for ${email}`);

  const record = await prisma.verificationCode.findFirst({
    where: { email, purpose: "reset", used: 0 },
    orderBy: { created_at: "desc" },
  });

  if (!record) {
    return res.status(400).json({ error: "Код не найден. Запросите новый код" });
  }

  // Check expiry
  const now = new Date();
  const expiresAt = new Date(record.expires_at + "Z");
  if (now > expiresAt) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { used: 1 },
    });
    return res.status(400).json({ error: "Код истёк. Запросите новый код" });
  }

  // Check attempts
  if (record.attempts >= CODE_MAX_ATTEMPTS) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { used: 1 },
    });
    return res.status(400).json({ error: "Слишком много попыток. Запросите новый код" });
  }

  // Increment attempts
  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { attempts: { increment: 1 } },
  });

  if (record.code !== code) {
    const remaining = CODE_MAX_ATTEMPTS - record.attempts - 1;
    return res.status(400).json({
      error: remaining > 0
        ? `Неверный код. Осталось попыток: ${remaining}`
        : "Неверный код. Запросите новый код"
    });
  }

  // Mark code as used
  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { used: 1 },
  });

  // Get user and update password
  const { userId } = JSON.parse(record.payload);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, avatar: true, is_banned: true },
  });
  if (!user) {
    return res.status(400).json({ error: "Пользователь не найден" });
  }
  if (user.is_banned) {
    return res.status(403).json({ error: "Аккаунт заблокирован" });
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { password_hash: newHash },
  });

  // Auto-login
  req.session.user = { id: user.id, name: user.username, avatar: user.avatar };
  console.log(`[Auth] Password reset and auto-login: ${user.username} (${user.id})`);
  res.json({ ok: true, user: req.session.user });
}));

export default router;
