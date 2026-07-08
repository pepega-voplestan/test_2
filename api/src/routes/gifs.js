import { Router } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { asyncHandler } from "../helpers/common.js";
import {
  giphySearchSchema, giphyTrendingSchema, gifReferenceSchema,
  gifFavoriteSchema, giphyIdParamSchema, GIF_FAVORITES_MAX, USER_GIFS_MAX,
} from "../helpers/validation.js";
import {
  MEDIA_DIR, MEDIA_TMP_DIR, MEDIA_VARIANTS, gifOnlyUpload,
} from "../helpers/media.js";

const router = Router();

const GIPHY_BASE = "https://api.giphy.com/v1/gifs";
const GIF_SERVICE_UNAVAILABLE = { error: "GIF-сервис недоступен" };

const TRENDING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SEARCH_CACHE_TTL = 60 * 1000; // 1 minute
const trendingCache = new Map();
const searchCache = new Map();

function mapGiphyGif(g) {
  const fh = g.images?.fixed_height || {};
  const fhStill = g.images?.fixed_height_still || {};
  return {
    id: g.id,
    title: g.title || "",
    url: fh.url,
    still: fhStill.url || fh.url,
    width: parseInt(fh.width, 10) || 0,
    height: parseInt(fh.height, 10) || 0,
  };
}

async function fetchGiphy(path, params) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) throw new Error("GIPHY_API_KEY not configured");

  const url = new URL(`${GIPHY_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("lang", "ru");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Giphy API returned ${res.status}`);
  return res.json();
}

/* GET /gifs/search */
router.get("/gifs/search", asyncHandler(async (req, res) => {
  const parsed = giphySearchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { q, limit, offset } = parsed.data;

  const cacheKey = `${q}:${limit}:${offset}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const data = await fetchGiphy("/search", { q, limit, offset });
    const result = {
      gifs: (data.data || []).map(mapGiphyGif),
      total: data.pagination?.total_count ?? 0,
      offset,
    };
    searchCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (err) {
    console.error("[Gifs] Search proxy error:", err.message);
    res.status(503).json(GIF_SERVICE_UNAVAILABLE);
  }
}));

/* GET /gifs/trending */
router.get("/gifs/trending", asyncHandler(async (req, res) => {
  const parsed = giphyTrendingSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { limit, offset } = parsed.data;

  const cacheKey = `${limit}:${offset}`;
  const cached = trendingCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TRENDING_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const data = await fetchGiphy("/trending", { limit, offset });
    const result = { gifs: (data.data || []).map(mapGiphyGif) };
    trendingCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (err) {
    console.error("[Gifs] Trending proxy error:", err.message);
    res.status(503).json(GIF_SERVICE_UNAVAILABLE);
  }
}));

/* POST /gifs/reference */
router.post("/gifs/reference", requireAuth, asyncHandler(async (req, res) => {
  const parsed = gifReferenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const userId = req.session.user.id;
  const banCheck = await prisma.user.findUnique({ where: { id: userId }, select: { is_banned: true } });
  if (banCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });

  const { giphyId, giphyUrl, giphyStill, width, height } = parsed.data;
  const media = await prisma.media.create({
    data: {
      id: crypto.randomUUID(),
      user_id: userId,
      media_type: "giphy",
      media_url: giphyId,
      media_meta: JSON.stringify({ url: giphyUrl, still: giphyStill, width, height }),
    },
  });

  console.log(`[Gifs] Reference created for ${userId}: ${giphyId} -> media ${media.id}`);
  res.json({ ok: true, mediaId: media.id });
}));

/* GET /gifs/favorites */
router.get("/gifs/favorites", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  const rows = await prisma.gifFavorite.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
  });
  res.json({
    favorites: rows.map((f) => ({
      id: f.id,
      giphyId: f.giphy_id,
      giphyUrl: f.giphy_url,
      giphyStill: f.giphy_still,
      width: f.width,
      height: f.height,
      createdAt: f.created_at.toISOString(),
    })),
  });
}));

/* POST /gifs/favorites */
router.post("/gifs/favorites", requireAuth, asyncHandler(async (req, res) => {
  const parsed = gifFavoriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const userId = req.session.user.id;
  const banCheck = await prisma.user.findUnique({ where: { id: userId }, select: { is_banned: true } });
  if (banCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });

  const { giphyId, giphyUrl, giphyStill, width, height } = parsed.data;

  const existing = await prisma.gifFavorite.findUnique({
    where: { user_id_giphy_id: { user_id: userId, giphy_id: giphyId } },
  });
  if (existing) return res.json({ ok: true });

  const count = await prisma.gifFavorite.count({ where: { user_id: userId } });
  if (count >= GIF_FAVORITES_MAX) {
    return res.status(400).json({ error: `Достигнут лимит избранного (${GIF_FAVORITES_MAX})` });
  }

  await prisma.gifFavorite.create({
    data: { user_id: userId, giphy_id: giphyId, giphy_url: giphyUrl, giphy_still: giphyStill, width, height },
  });

  console.log(`[Gifs] Favorite added for ${userId}: ${giphyId}`);
  res.json({ ok: true });
}));

/* DELETE /gifs/favorites/:giphyId */
router.delete("/gifs/favorites/:giphyId", requireAuth, asyncHandler(async (req, res) => {
  const parsed = giphyIdParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const userId = req.session.user.id;
  const { giphyId } = parsed.data;

  const existing = await prisma.gifFavorite.findUnique({
    where: { user_id_giphy_id: { user_id: userId, giphy_id: giphyId } },
  });
  if (!existing) return res.status(404).json({ error: "Не найдено" });

  await prisma.gifFavorite.delete({
    where: { user_id_giphy_id: { user_id: userId, giphy_id: giphyId } },
  });

  console.log(`[Gifs] Favorite removed for ${userId}: ${giphyId}`);
  res.json({ ok: true });
}));

/* ---------- Personal GIF library ---------- */

function buildMyGifItem(userGif) {
  const mediaId = userGif.media.media_url;
  return {
    id: userGif.id,
    mediaId: userGif.media_id,
    thumb: `/media/${mediaId}/320.webp`,
    gif: `/media/${mediaId}/original.gif`,
    createdAt: userGif.created_at.toISOString(),
  };
}

/* GET /gifs/my */
router.get("/gifs/my", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  const rows = await prisma.userGif.findMany({
    where: { user_id: userId, is_deleted: 0 },
    orderBy: { created_at: "desc" },
    include: { media: true },
  });
  res.json({ gifs: rows.map(buildMyGifItem) });
}));

/* POST /gifs/upload */
router.post("/gifs/upload", requireAuth, (req, res) => {
  gifOnlyUpload.single("file")(req, res, async (multerErr) => {
    if (multerErr) {
      const msg = multerErr.code === "LIMIT_FILE_SIZE"
        ? "Файл слишком большой (макс. 10 МБ)"
        : multerErr.message || "Ошибка загрузки";
      console.log(`[Gifs] Upload rejected: ${msg}`);
      return res.status(400).json({ error: msg });
    }

    if (!req.file) return res.status(400).json({ error: "Файл не выбран" });

    const userId = req.session.user.id;
    const banCheck = await prisma.user.findUnique({ where: { id: userId }, select: { is_banned: true } });
    if (banCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });

    try {
      const activeCount = await prisma.userGif.count({ where: { user_id: userId, is_deleted: 0 } });
      if (activeCount >= USER_GIFS_MAX) {
        return res.status(400).json({ error: `Достигнут лимит личных GIF (${USER_GIFS_MAX})` });
      }

      const image = sharp(req.file.buffer);
      const meta = await image.metadata();

      if (meta.format !== "gif" || !meta.width || !meta.height) {
        return res.status(400).json({ error: "Допустимый формат: GIF" });
      }

      const mediaId = crypto.randomUUID();
      const tmpDir = path.join(MEDIA_TMP_DIR, mediaId);
      fs.mkdirSync(tmpDir, { recursive: true });

      fs.writeFileSync(path.join(tmpDir, "original.gif"), req.file.buffer);
      const urls = { gif: `/media/${mediaId}/original.gif` };

      const firstFrame = sharp(req.file.buffer, { pages: 1 });
      for (const w of MEDIA_VARIANTS) {
        const outPath = path.join(tmpDir, `${w}.webp`);
        await firstFrame.clone().resize(w, null, { withoutEnlargement: true }).webp({ quality: 82 }).toFile(outPath);
        urls[w] = `/media/${mediaId}/${w}.webp`;
      }

      const isAnimated = !!(meta.pages && meta.pages > 1);
      const metaJson = JSON.stringify({ w: meta.width, h: meta.height, size: req.file.size, mime: req.file.mimetype, animated: isAnimated });
      fs.writeFileSync(path.join(tmpDir, "meta.json"), metaJson);

      const permanentDir = path.join(MEDIA_DIR, mediaId);
      fs.renameSync(tmpDir, permanentDir);

      const userGif = await prisma.$transaction(async (tx) => {
        const media = await tx.media.create({
          data: {
            id: mediaId,
            user_id: userId,
            media_type: "image",
            media_url: mediaId,
            media_meta: metaJson,
          },
        });
        return tx.userGif.create({
          data: { user_id: userId, media_id: media.id },
        });
      });

      console.log(`[Gifs] Personal GIF uploaded for ${userId}: ${userGif.id} -> media ${mediaId}`);
      res.json({
        ok: true,
        id: userGif.id,
        mediaId,
        thumb: urls[320],
        gif: urls.gif,
      });
    } catch (err) {
      console.error("[Gifs] Upload processing error:", err);
      res.status(500).json({ error: "Ошибка обработки файла" });
    }
  });
});

/* DELETE /gifs/my/:id */
router.delete("/gifs/my/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;

  const userGif = await prisma.userGif.findUnique({ where: { id } });
  if (!userGif) return res.status(404).json({ error: "Не найдено" });
  if (userGif.user_id !== userId) return res.status(403).json({ error: "Forbidden" });

  await prisma.userGif.update({ where: { id }, data: { is_deleted: 1 } });

  console.log(`[Gifs] Personal GIF soft-deleted for ${userId}: ${id}`);
  res.json({ ok: true });
}));

export default router;
