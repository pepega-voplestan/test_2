import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { asyncHandler, toSqliteDatetime } from "../helpers/common.js";
import { createSocialSchema, updateSocialSchema, socialTypeSchema } from "../helpers/validation.js";
import { validateSocialUrl, normalizeSocialUrl, resolveSocialDisplay, preprocessSocialInput, ensureProtocol } from "../helpers/socials.js";

const router = Router();

/** Build a social DTO from a DB row (display is pre-resolved and stored) */
function toSocialDto(row) {
  return {
    type: row.type,
    url: row.url,
    display: row.display,
  };
}

/* GET /users/:id/socials — list user's socials */
router.get("/users/:id/socials", asyncHandler(async (req, res) => {
  const rows = await prisma.social.findMany({
    where: { user_id: req.params.id },
    orderBy: { created_at: "asc" },
  });
  res.json({ socials: rows.map(toSocialDto) });
}));

/* POST /users/:id/socials — add a social */
router.post("/users/:id/socials", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.params.id;
  if (userId !== req.session.user.id) {
    return res.status(403).json({ error: "Нельзя редактировать чужой профиль" });
  }

  const parsed = createSocialSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Некорректные данные" });
  }

  const { type, url: rawInput } = parsed.data;

  // Check if already exists
  const existing = await prisma.social.findUnique({
    where: { user_id_type: { user_id: userId, type } },
  });
  if (existing) {
    return res.status(409).json({ error: "Эта социальная сеть уже добавлена" });
  }

  // Try plain-text preprocessing first (Telegram @handle, Discord tag, BattleTag)
  const preprocessed = preprocessSocialInput(type, rawInput);

  let finalUrl, display;
  if (preprocessed) {
    finalUrl = preprocessed.url || "";
    display = preprocessed.display;
  } else {
    // Normal URL-based flow — auto-prepend https:// if missing
    const urlInput = ensureProtocol(rawInput);
    const validation = validateSocialUrl(type, urlInput);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    finalUrl = normalizeSocialUrl(type, urlInput);
    display = await resolveSocialDisplay(type, finalUrl);
  }

  const now = toSqliteDatetime();
  await prisma.social.create({
    data: {
      id: crypto.randomUUID(),
      user_id: userId,
      type,
      url: finalUrl,
      display,
      created_at: now,
      updated_at: now,
    },
  });

  console.log(`[Socials] Added ${type} for user ${userId} (display: ${display})`);
  res.status(201).json({ social: { type, url: finalUrl, display } });
}));

/* PUT /users/:id/socials/:type — update a social */
router.put("/users/:id/socials/:type", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.params.id;
  if (userId !== req.session.user.id) {
    return res.status(403).json({ error: "Нельзя редактировать чужой профиль" });
  }

  const typeResult = socialTypeSchema.safeParse(req.params.type);
  if (!typeResult.success) {
    return res.status(400).json({ error: "Неизвестная платформа" });
  }
  const type = typeResult.data;

  const parsed = updateSocialSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Некорректные данные" });
  }

  const { url: rawInput } = parsed.data;

  const existing = await prisma.social.findUnique({
    where: { user_id_type: { user_id: userId, type } },
  });
  if (!existing) {
    return res.status(404).json({ error: "Социальная сеть не найдена" });
  }

  // Try plain-text preprocessing first
  const preprocessed = preprocessSocialInput(type, rawInput);

  let finalUrl, display;
  if (preprocessed) {
    finalUrl = preprocessed.url || "";
    display = preprocessed.display;
  } else {
    // Normal URL-based flow — auto-prepend https:// if missing
    const urlInput = ensureProtocol(rawInput);
    const validation = validateSocialUrl(type, urlInput);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    finalUrl = normalizeSocialUrl(type, urlInput);
    display = await resolveSocialDisplay(type, finalUrl);
  }

  await prisma.social.update({
    where: { id: existing.id },
    data: { url: finalUrl, display, updated_at: toSqliteDatetime() },
  });

  console.log(`[Socials] Updated ${type} for user ${userId} (display: ${display})`);
  res.json({ social: { type, url: finalUrl, display } });
}));

/* DELETE /users/:id/socials/:type — remove a social */
router.delete("/users/:id/socials/:type", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.params.id;
  if (userId !== req.session.user.id) {
    return res.status(403).json({ error: "Нельзя редактировать чужой профиль" });
  }

  const typeResult = socialTypeSchema.safeParse(req.params.type);
  if (!typeResult.success) {
    return res.status(400).json({ error: "Неизвестная платформа" });
  }
  const type = typeResult.data;

  const existing = await prisma.social.findUnique({
    where: { user_id_type: { user_id: userId, type } },
  });
  if (!existing) {
    return res.status(404).json({ error: "Социальная сеть не найдена" });
  }

  await prisma.social.delete({ where: { id: existing.id } });

  console.log(`[Socials] Deleted ${type} for user ${userId}`);
  res.json({ ok: true });
}));

export default router;
