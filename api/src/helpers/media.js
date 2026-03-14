import fs from "fs";
import path from "path";
import multer from "multer";

/* ---------- Avatar constants ---------- */

export const AVATAR_DIR = path.join(
  path.dirname(process.env.DATABASE_URL.replace(/^file:/, "")),
  "avatars"
);
export const AVATAR_SIZES = [64, 128, 256];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const AVATAR_MIN_DIM = 256;
const AVATAR_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!AVATAR_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Допустимые форматы: JPG, PNG, WebP"));
    }
    cb(null, true);
  },
});

/* ---------- Media upload constants ---------- */

export const MEDIA_DIR = process.env.MEDIA_PATH;
export const MEDIA_TMP_DIR = path.join(MEDIA_DIR, ".tmp");
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const MEDIA_MAX_DIM = 4096;
export const MEDIA_MAX_PIXELS = 16_000_000; // 16 MP
export const MEDIA_VARIANTS = [320, 960, 1600];
export const MEDIA_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4"]);

export const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!MEDIA_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Допустимые форматы: JPG, PNG, WebP, GIF, MP4"));
    }
    cb(null, true);
  },
});

try {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.mkdirSync(MEDIA_TMP_DIR, { recursive: true });
} catch (e) {
  console.error("[Media] Could not create media directories:", e.message);
}

/* ---------- YouTube helpers ---------- */

const YOUTUBE_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
];

export function extractYouTubeId(text) {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function fetchYouTubeMeta(videoId) {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { videoId };
    const data = await res.json();
    return { videoId, title: data.title || null, channel: data.author_name || null };
  } catch (e) {
    console.error("[YouTube] oEmbed fetch failed:", e.message);
    return { videoId };
  }
}

/* ---------- Media DTO helper ---------- */

export function buildMedia(mediaObj) {
  if (!mediaObj) return undefined;
  if (mediaObj.media_type === "image") {
    const meta = JSON.parse(mediaObj.media_meta || "{}");
    return {
      type: "image",
      url: `/media/${mediaObj.media_url}/960.webp`,
      thumb: `/media/${mediaObj.media_url}/320.webp`,
      full: `/media/${mediaObj.media_url}/1600.webp`,
      width: meta.w || 0,
      height: meta.h || 0,
      ...(meta.animated && { animated: true, gif: `/media/${mediaObj.media_url}/original.gif` }),
    };
  }
  if (mediaObj.media_type === "video") {
    const meta = JSON.parse(mediaObj.media_meta || "{}");
    return {
      type: "video",
      url: `/media/${mediaObj.media_url}/original.mp4`,
      thumb: `/media/${mediaObj.media_url}/320.webp`,
      width: meta.w || 0,
      height: meta.h || 0,
    };
  }
  if (mediaObj.media_type === "youtube") {
    const meta = JSON.parse(mediaObj.media_meta || "{}");
    return {
      type: "youtube",
      videoId: mediaObj.media_url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${mediaObj.media_url}`,
      title: meta.title || null,
      channel: meta.channel || null,
    };
  }
  return undefined;
}
