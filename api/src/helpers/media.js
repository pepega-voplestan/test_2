import fs from "fs";
import path from "path";
import multer from "multer";

/* ---------- Avatar constants ---------- */

export const AVATAR_DIR = path.join(
  process.env.AVATAR_PATH || "/data/avatars"
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

// Max size for original-quality JPG/PNG uploads (env-configurable — FR-011).
// Also used as the media upload multer limit. Default 10 MB.
export const ORIGINAL_QUALITY_MAX_BYTES = Number(process.env.ORIGINAL_QUALITY_MAX_BYTES) || 10 * 1024 * 1024;
// Hours an original-quality image is retained/served before automatic WebP downgrade.
export const ORIGINAL_QUALITY_WINDOW_HOURS = Number(process.env.ORIGINAL_QUALITY_WINDOW_HOURS) || 24;
// Formats eligible for the original-quality path (JPG/PNG only).
export const ORIGINAL_QUALITY_FORMATS = new Set(["jpeg", "png"]);

export const MEDIA_MAX_BYTES = ORIGINAL_QUALITY_MAX_BYTES;
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

/* ---------- Personal GIF library upload (GIF-only) ---------- */

export const gifOnlyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "image/gif") {
      return cb(new Error("Допустимый формат: GIF"));
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

/* ---------- Size-limit message (Russian, MB) ---------- */

// Russian error message for an oversized upload, reflecting the configured limit.
export function oversizedMessage(maxBytes = ORIGINAL_QUALITY_MAX_BYTES) {
  const mb = Math.round(maxBytes / (1024 * 1024));
  return `Файл слишком большой (макс. ${mb} МБ)`;
}

/* ---------- Lossless privacy-metadata stripping ---------- */

/**
 * Remove privacy-sensitive metadata from a JPEG at the marker level WITHOUT
 * re-encoding the image. Drops APP1 (EXIF/GPS + XMP) and APP13 (IPTC/Photoshop)
 * segments; the entropy-coded scan (SOS…EOI) is copied byte-for-byte, so pixel
 * data stays lossless. Returns the input unchanged if it is not a JPEG.
 */
export function stripJpegMetadata(buf) {
  if (buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf; // not a JPEG (SOI)
  const out = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) { out.push(buf.subarray(i)); break; } // desync — copy remainder
    let marker = buf[i + 1];
    while (marker === 0xff && i + 2 < buf.length) { i++; marker = buf[i + 1]; } // skip fill bytes
    if (marker === 0xda || marker === 0xd9) { out.push(buf.subarray(i)); break; } // SOS/EOI — copy scan+tail
    if (marker >= 0xd0 && marker <= 0xd7) { out.push(buf.subarray(i, i + 2)); i += 2; continue; } // RSTn — no length
    if (i + 4 > buf.length) { out.push(buf.subarray(i)); break; }
    const len = buf.readUInt16BE(i + 2); // length field includes its own 2 bytes
    const segEnd = i + 2 + len;
    if (segEnd > buf.length) { out.push(buf.subarray(i)); break; }
    const isPrivacy = marker === 0xe1 || marker === 0xed; // APP1 (EXIF/XMP), APP13 (IPTC)
    if (!isPrivacy) out.push(buf.subarray(i, segEnd));
    i = segEnd;
  }
  return Buffer.concat(out);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_STRIP_CHUNKS = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);

/**
 * Remove privacy/identity ancillary chunks from a PNG (eXIf, tEXt, iTXt, zTXt,
 * tIME) while preserving all critical chunks (IHDR/PLTE/IDAT/IEND). Lossless by
 * construction. Returns the input unchanged if it is not a PNG.
 */
export function stripPngMetadata(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return buf;
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const chunkEnd = i + 12 + len; // length(4) + type(4) + data(len) + crc(4)
    if (chunkEnd > buf.length) { out.push(buf.subarray(i)); break; }
    if (!PNG_STRIP_CHUNKS.has(type)) out.push(buf.subarray(i, chunkEnd));
    i = chunkEnd;
    if (type === "IEND") break;
  }
  return Buffer.concat(out);
}

/**
 * Strip privacy metadata from a JPG/PNG buffer by sharp format name, losslessly.
 * Unknown formats are returned unchanged.
 */
export function stripImageMetadata(buf, format) {
  if (format === "jpeg") return stripJpegMetadata(buf);
  if (format === "png") return stripPngMetadata(buf);
  return buf;
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
    // During the original-quality window (orig present, not yet downgraded) the
    // full-size view serves the lossless original; otherwise the WebP variant.
    const pendingOriginal = Boolean(meta.orig) && meta.converted !== true;
    return {
      type: "image",
      url: `/media/${mediaObj.media_url}/960.webp`,
      thumb: `/media/${mediaObj.media_url}/320.webp`,
      full: pendingOriginal
        ? `/media/${mediaObj.media_url}/${meta.orig}`
        : `/media/${mediaObj.media_url}/1600.webp`,
      width: meta.w || 0,
      height: meta.h || 0,
      // EXIF orientation only matters while serving the metadata-stripped original;
      // the WebP variants are already auto-rotated upright.
      ...(pendingOriginal && meta.orientation ? { orientation: meta.orientation } : {}),
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
  if (mediaObj.media_type === "giphy") {
    const meta = JSON.parse(mediaObj.media_meta || "{}");
    return {
      type: "giphy",
      giphyId: mediaObj.media_url,
      url: meta.url,
      still: meta.still,
      width: meta.width || 0,
      height: meta.height || 0,
    };
  }
  return undefined;
}
