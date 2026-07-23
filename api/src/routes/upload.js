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
  ORIGINAL_QUALITY_FORMATS, stripImageMetadata, oversizedMessage,
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
        ? oversizedMessage()
        : multerErr.message || "Ошибка загрузки";
      console.log(`[Media] Upload rejected: ${msg}`);
      return res.status(400).json({ error: msg });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Файл не выбран" });
    }

    const userId = req.session.user.id;
    const authCheck = await prisma.user.findUnique({ where: { id: userId }, select: { is_banned: true, is_media_allowed: true } });
    if (authCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });
    if (!authCheck?.is_media_allowed) return res.status(403).json({ error: "Вам запрещено прикреплять медиафайлы" });
    console.log(`[Media] Processing upload for ${userId}, ${req.file.size} bytes, ${req.file.mimetype}`);

    // Track the tmp dir so a mid-processing failure never leaves a partial/corrupt file.
    let cleanupDir = null;

    try {
      const isVideo = req.file.mimetype === "video/mp4";

      if (isVideo) {
        // Video: store original mp4, generate a thumbnail via first-frame extraction is not feasible without ffmpeg,
        // so we store the video as-is and create a placeholder thumbnail
        const mediaId = crypto.randomUUID();
        const tmpDir = path.join(MEDIA_TMP_DIR, mediaId);
        fs.mkdirSync(tmpDir, { recursive: true });

        // Store original video
        fs.writeFileSync(path.join(tmpDir, "original.mp4"), req.file.buffer);

        const metaJson = JSON.stringify({ size: req.file.size, mime: req.file.mimetype });
        fs.writeFileSync(path.join(tmpDir, "meta.json"), metaJson);

        const permanentDir = path.join(MEDIA_DIR, mediaId);
        fs.renameSync(tmpDir, permanentDir);

        await prisma.media.create({
          data: {
            id: mediaId,
            user_id: userId,
            media_type: "video",
            media_url: mediaId,
            media_meta: metaJson,
          },
        });

        console.log(`[Media] Video upload complete: ${mediaId}`);
        return res.json({
          ok: true,
          mediaId,
          urls: { video: `/media/${mediaId}/original.mp4` },
        });
      }

      const image = sharp(req.file.buffer);
      let meta;
      try {
        meta = await image.metadata();
      } catch {
        // Corrupt/undecodable image — reject before storing anything.
        return res.status(400).json({ error: "Не удалось обработать изображение. Файл может быть повреждён" });
      }

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
      cleanupDir = tmpDir;

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

      // Original-quality path (JPG/PNG only): keep a lossless, metadata-stripped
      // copy of the original for the first 24h. The full-size view serves it until
      // the scheduled downgrade reclaims it (see workers/original-downgrade).
      let origFile = null;
      let orientation;
      if (!isAnimatedGif && ORIGINAL_QUALITY_FORMATS.has(meta.format)) {
        const ext = meta.format === "jpeg" ? "jpg" : "png";
        const stripped = stripImageMetadata(req.file.buffer, meta.format);
        fs.writeFileSync(path.join(tmpDir, `original.${ext}`), stripped);
        origFile = `original.${ext}`;
        // Preserve orientation so the full-size view can render the stripped
        // original upright (WebP variants are already auto-rotated).
        if (meta.orientation && meta.orientation !== 1) orientation = meta.orientation;
      }

      // Write meta.json as on-disk backup
      const metaJson = JSON.stringify({
        w: meta.width,
        h: meta.height,
        size: req.file.size,
        mime: req.file.mimetype,
        animated: isAnimatedGif,
        ...(origFile && { orig: origFile, uploaded_at: new Date().toISOString(), converted: false }),
        ...(orientation && { orientation }),
      });
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
          full: origFile ? `/media/${mediaId}/${origFile}` : urls[1600],
          ...(isAnimatedGif && { gif: urls.gif }),
        },
      });
    } catch (err) {
      // Discard any partially-written tmp dir so nothing corrupt is persisted (FR-003).
      if (cleanupDir) {
        try { fs.rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
      console.error("[Media] Processing error:", err);
      res.status(500).json({ error: "Ошибка обработки файла" });
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

    const banCheck = await prisma.user.findUnique({ where: { id: req.session.user.id }, select: { is_banned: true } });
    if (banCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });

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
