import { describe, it, expect } from "vitest";
import { extractYouTubeId, buildMedia } from "../../src/helpers/media.js";

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
});
