import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  extractYouTubeId,
  buildMedia,
  stripJpegMetadata,
  stripPngMetadata,
} from "../../src/helpers/media.js";

/** True if a JPEG buffer contains the given APPn marker (0xFFEn). */
function hasJpegMarker(buf, marker) {
  for (let i = 0; i + 1 < buf.length - 1; i++) {
    if (buf[i] === 0xff && buf[i + 1] === marker) return true;
    if (buf[i] === 0xff && buf[i + 1] === 0xda) break; // stop at SOS (scan data)
  }
  return false;
}

/** True if a PNG buffer contains a chunk of the given type. */
function hasPngChunk(buf, type) {
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    if (buf.toString("latin1", i + 4, i + 8) === type) return true;
    i += 12 + len;
  }
  return false;
}

describe("extractYouTubeId", () => {
  it("extracts ID from standard youtube.com/watch URL", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from youtube.com/watch with extra params", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from youtu.be short URL", () => {
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from youtube.com/shorts URL", () => {
    expect(extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID without https://", () => {
    expect(extractYouTubeId("youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID without www.", () => {
    expect(extractYouTubeId("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for non-YouTube URL", () => {
    expect(extractYouTubeId("https://vimeo.com/12345")).toBe(null);
  });

  it("returns null for plain text", () => {
    expect(extractYouTubeId("no video here")).toBe(null);
  });

  it("returns null for empty string", () => {
    expect(extractYouTubeId("")).toBe(null);
  });
});

describe("buildMedia", () => {
  it("returns undefined for null input", () => {
    expect(buildMedia(null)).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(buildMedia(undefined)).toBeUndefined();
  });

  it("builds image DTO with correct URLs", () => {
    const media = {
      media_type: "image",
      media_url: "abc-123",
      media_meta: JSON.stringify({ w: 1920, h: 1080 }),
    };
    expect(buildMedia(media)).toEqual({
      type: "image",
      url: "/media/abc-123/960.webp",
      thumb: "/media/abc-123/320.webp",
      full: "/media/abc-123/1600.webp",
      width: 1920,
      height: 1080,
    });
  });

  it("defaults width/height to 0 when meta is empty", () => {
    const media = {
      media_type: "image",
      media_url: "abc-123",
      media_meta: null,
    };
    const result = buildMedia(media);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it("includes animated GIF fields when meta.animated is true", () => {
    const media = {
      media_type: "image",
      media_url: "gif-456",
      media_meta: JSON.stringify({ w: 320, h: 240, animated: true }),
    };
    const result = buildMedia(media);
    expect(result.animated).toBe(true);
    expect(result.gif).toBe("/media/gif-456/original.gif");
  });

  it("does not include animated fields for static images", () => {
    const media = {
      media_type: "image",
      media_url: "img-789",
      media_meta: JSON.stringify({ w: 800, h: 600 }),
    };
    const result = buildMedia(media);
    expect(result).not.toHaveProperty("animated");
    expect(result).not.toHaveProperty("gif");
  });

  it("builds YouTube DTO", () => {
    const media = {
      media_type: "youtube",
      media_url: "dQw4w9WgXcQ",
      media_meta: JSON.stringify({ title: "Test Video", channel: "Test Channel" }),
    };
    expect(buildMedia(media)).toEqual({
      type: "youtube",
      videoId: "dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      title: "Test Video",
      channel: "Test Channel",
    });
  });

  it("handles YouTube with null meta", () => {
    const media = {
      media_type: "youtube",
      media_url: "dQw4w9WgXcQ",
      media_meta: null,
    };
    const result = buildMedia(media);
    expect(result.title).toBe(null);
    expect(result.channel).toBe(null);
  });

  it("returns undefined for unknown media type", () => {
    const media = { media_type: "audio", media_url: "x", media_meta: "{}" };
    expect(buildMedia(media)).toBeUndefined();
  });

  it("serves the original as `full` during the original-quality window", () => {
    const media = {
      media_type: "image",
      media_url: "orig-1",
      media_meta: JSON.stringify({ w: 4000, h: 3000, orig: "original.jpg", converted: false }),
    };
    const result = buildMedia(media);
    expect(result.full).toBe("/media/orig-1/original.jpg");
    expect(result.url).toBe("/media/orig-1/960.webp");
    expect(result.thumb).toBe("/media/orig-1/320.webp");
  });

  it("includes orientation only while serving the pending original", () => {
    const pending = {
      media_type: "image",
      media_url: "orig-2",
      media_meta: JSON.stringify({ w: 4000, h: 3000, orig: "original.jpg", converted: false, orientation: 6 }),
    };
    expect(buildMedia(pending).orientation).toBe(6);

    const converted = {
      media_type: "image",
      media_url: "orig-2",
      media_meta: JSON.stringify({ w: 4000, h: 3000, converted: true, orientation: 6 }),
    };
    const result = buildMedia(converted);
    expect(result.full).toBe("/media/orig-2/1600.webp");
    expect(result).not.toHaveProperty("orientation");
  });

  it("reverts `full` to the WebP variant after downgrade (orig removed)", () => {
    const media = {
      media_type: "image",
      media_url: "orig-3",
      media_meta: JSON.stringify({ w: 4000, h: 3000, converted: true }),
    };
    expect(buildMedia(media).full).toBe("/media/orig-3/1600.webp");
  });
});

describe("stripJpegMetadata", () => {
  it("removes APP1/EXIF while keeping pixel data byte-lossless", async () => {
    const base = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 12, g: 34, b: 56 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
    const withExif = await sharp(base)
      .withExif({ IFD0: { Copyright: "ACME", Software: "SecretCam 9000" } })
      .toBuffer();

    expect(hasJpegMarker(withExif, 0xe1)).toBe(true); // APP1 present before

    const stripped = stripJpegMetadata(withExif);
    expect(hasJpegMarker(stripped, 0xe1)).toBe(false); // APP1 gone

    // Pixel data identical (no re-encode): decoded raw pixels match.
    const rawWith = await sharp(withExif).raw().toBuffer();
    const rawStripped = await sharp(stripped).raw().toBuffer();
    expect(Buffer.compare(rawWith, rawStripped)).toBe(0);

    const meta = await sharp(stripped).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("returns non-JPEG input unchanged", () => {
    const notJpeg = Buffer.from([0x00, 0x11, 0x22, 0x33]);
    expect(Buffer.compare(stripJpegMetadata(notJpeg), notJpeg)).toBe(0);
  });
});

describe("stripPngMetadata", () => {
  it("removes text/eXIf chunks while keeping IDAT/pixel data", async () => {
    const base = await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .png()
      .withExif({ IFD0: { Copyright: "ACME" } })
      .toBuffer();

    // Ensure there is a metadata chunk to strip (eXIf or a text chunk).
    const hadMeta = hasPngChunk(base, "eXIf") || hasPngChunk(base, "tEXt") || hasPngChunk(base, "iTXt");
    const stripped = stripPngMetadata(base);

    expect(hasPngChunk(stripped, "IDAT")).toBe(true);
    expect(hasPngChunk(stripped, "IEND")).toBe(true);
    for (const t of ["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]) {
      expect(hasPngChunk(stripped, t)).toBe(false);
    }

    // Pixel data intact.
    const rawBase = await sharp(base).raw().toBuffer();
    const rawStripped = await sharp(stripped).raw().toBuffer();
    expect(Buffer.compare(rawBase, rawStripped)).toBe(0);
    // Sanity: the fixture actually contained metadata to remove (else test is vacuous).
    expect(hadMeta).toBe(true);
  });

  it("returns non-PNG input unchanged", () => {
    const notPng = Buffer.from([0x01, 0x02, 0x03]);
    expect(Buffer.compare(stripPngMetadata(notPng), notPng)).toBe(0);
  });
});
