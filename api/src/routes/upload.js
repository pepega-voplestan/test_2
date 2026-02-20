import { Router } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import {
  AVATAR_DIR, AVATAR_SIZES, AVATAR_MIN_DIM, avatarUpload,
  MEDIA_DIR, MEDIA_TMP_DIR, MEDIA_MAX_DIM, MEDIA_MAX_PIXELS,
  MEDIA_VARIANTS, MEDIA_ALLOWED_MIME, mediaUpload,
} from "../helpers/media.js";

const router = Router();

/* serve avatar */
router.get("/avatars/:userId/:file", (req, res) => {
  const { userId, file } = req.params;
  const filePath = path.join(AVATAR_DIR, userId, file);
  if (!fs.existsSync(filePath)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).json({ error: "Avatar not found" });
  }
  res.setHeader("Content-Type", "image/webp");
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  fs.createReadStream(filePath).pipe(res);
});

/* media upload */
router.post("/upload/media", requireAuth, (req, res) => {
  mediaUpload.single("file")(req, res, async (multerErr) => {
    if (multerErr) {
      const msg = multerErr.code === "LIMIT_FILE_SIZE"
        ? "Файл слишком большой (макс. 5 МБ)"
        : multerErr.message || "Ошибка загрузки";
      console.log(`[Media] Upload rejected: ${msg}`);
      return res.status(400).json({ error: msg });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Файл не выбран" });
    }

    const userId = req.session.user.id;
    console.log(`[Media] Processing upload for ${userId}, ${req.file.size} bytes, ${req.file.mimetype}`);

    try {
      const image = sharp(req.file.buffer);
      const meta = await image.metadata();

      // Validate via sharp metadata (magic bytes check — sharp rejects invalid images)
      if (!MEDIA_ALLOWED_MIME.has(`image/${meta.format === "jpeg" ? "jpeg" : meta.format}`)) {
        return res.status(400).json({ error: "Недопустимый формат изображения" });
      }

      const isAnimatedGif = meta.format === "gif" && meta.pages && meta.pages > 1;

      if (!meta.width || !meta.height) {
        return res.status(400).json({ error: "Не удалось определить размер изображения" });
      }

      if (meta.width > MEDIA_MAX_DIM || meta.height > MEDIA_MAX_DIM) {
        return res.status(400).json({ error: `Максимальный размер: ${MEDIA_MAX_DIM}×${MEDIA_MAX_DIM} пикселей` });
      }

      if (meta.width * meta.height > MEDIA_MAX_PIXELS) {
        return res.status(400).json({ error: "Изображение слишком большое (макс. 16 МП)" });
      }

      const mediaId = crypto.randomUUID();
      const tmpDir = path.join(MEDIA_TMP_DIR, mediaId);
      fs.mkdirSync(tmpDir, { recursive: true });

      const urls = {};

      if (isAnimatedGif) {
        // Store original GIF for animated playback
        fs.writeFileSync(path.join(tmpDir, "original.gif"), req.file.buffer);
        urls.gif = `/media/${mediaId}/original.gif`;

        // Generate static WebP thumbnails from the first frame
        const firstFrame = sharp(req.file.buffer, { pages: 1 });
        for (const w of MEDIA_VARIANTS) {
          const outPath = path.join(tmpDir, `${w}.webp`);
          await firstFrame.clone().resize(w, null, { withoutEnlargement: true }).webp({ quality: 82 }).toFile(outPath);
          urls[w] = `/media/${mediaId}/${w}.webp`;
        }
      } else {
        // Strip EXIF by re-encoding, generate width-capped variants
        const rotated = image.rotate(); // auto-rotate by EXIF, then EXIF is stripped
        for (const w of MEDIA_VARIANTS) {
          const resized = rotated.clone().resize(w, null, { withoutEnlargement: true });
          const outPath = path.join(tmpDir, `${w}.webp`);
          await resized.webp({ quality: 82 }).toFile(outPath);
          urls[w] = `/media/${mediaId}/${w}.webp`;
        }
      }

      // Write meta.json as on-disk backup
      const metaJson = JSON.stringify({ w: meta.width, h: meta.height, size: req.file.size, mime: req.file.mimetype, animated: isAnimatedGif });
      fs.writeFileSync(path.join(tmpDir, "meta.json"), metaJson);

      // Atomic move: tmp → permanent
      const permanentDir = path.join(MEDIA_DIR, mediaId);
      fs.renameSync(tmpDir, permanentDir);

      // Create media record in DB
      await prisma.media.create({
        data: {
          id: mediaId,
          user_id: userId,
          media_type: "image",
          media_url: mediaId,
          media_meta: metaJson,
        },
      });

      console.log(`[Media] Upload complete: ${mediaId}, ${MEDIA_VARIANTS.join("/")}w${isAnimatedGif ? " (animated GIF)" : ""}`);
      res.json({
        ok: true,
        mediaId,
        urls: {
          thumb: urls[320],
          medium: urls[960],
          full: urls[1600],
          ...(isAnimatedGif && { gif: urls.gif }),
        },
      });
    } catch (err) {
      console.error("[Media] Processing error:", err);
      res.status(500).json({ error: "Ошибка обработки изображения" });
    }
  });
});

/* avatar upload */
router.post("/upload/avatar", requireAuth, (req, res) => {
  avatarUpload.single("avatar")(req, res, async (multerErr) => {
    if (multerErr) {
      const msg = multerErr.code === "LIMIT_FILE_SIZE"
        ? "Файл слишком большой (макс. 2 МБ)"
        : multerErr.message || "Ошибка загрузки";
      console.log(`[Avatar] Upload rejected: ${msg}`);
      return res.status(400).json({ error: msg });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Файл не выбран" });
    }

    const userId = req.session.user.id;
    console.log(`[Avatar] Processing upload for ${userId}, ${req.file.size} bytes, ${req.file.mimetype}`);

    try {
      const image = sharp(req.file.buffer);
      const meta = await image.metadata();

      if (meta.pages && meta.pages > 1) {
        return res.status(400).json({ error: "Анимированные изображения не поддерживаются" });
      }

      if (!meta.width || !meta.height || meta.width < AVATAR_MIN_DIM || meta.height < AVATAR_MIN_DIM) {
        return res.status(400).json({ error: `Минимальное разрешение: ${AVATAR_MIN_DIM}×${AVATAR_MIN_DIM}` });
      }

      const size = Math.min(meta.width, meta.height);
      const cropped = image
        .extract({
          left: Math.floor((meta.width - size) / 2),
          top: Math.floor((meta.height - size) / 2),
          width: size,
          height: size,
        })
        .rotate();

      const userDir = path.join(AVATAR_DIR, userId);
      fs.mkdirSync(userDir, { recursive: true });

      const version = Date.now();
      for (const s of AVATAR_SIZES) {
        await cropped
          .clone()
          .resize(s, s)
          .webp({ quality: 85 })
          .toFile(path.join(userDir, `${s}.webp`));
      }

      const avatarUrl = `/api/v1/avatars/${userId}/256.webp?v=${version}`;
      await prisma.user.update({
        where: { id: userId },
        data: { avatar: avatarUrl },
      });
      req.session.user.avatar = avatarUrl;

      console.log(`[Avatar] Upload complete for ${userId}: ${AVATAR_SIZES.join(", ")}px`);
      res.json({
        ok: true,
        avatar: avatarUrl,
        sizes: Object.fromEntries(
          AVATAR_SIZES.map((s) => [s, `/api/v1/avatars/${userId}/${s}.webp?v=${version}`])
        ),
      });
    } catch (err) {
      console.error("[Avatar] Processing error:", err);
      res.status(500).json({ error: "Ошибка обработки изображения" });
    }
  });
});

export default router;
