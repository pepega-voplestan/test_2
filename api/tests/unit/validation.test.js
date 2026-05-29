import { describe, it, expect } from "vitest";
import {
  effectiveCharCount,
  generateCode,
  SHOUT_MAX_LENGTH,
  registerSchema,
  loginSchema,
  shoutSchema,
  commentSchema,
  announcementSchema,
  profileUpdateSchema,
  verifyCodeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../../src/helpers/validation.js";

describe("effectiveCharCount", () => {
  it("counts plain text literally", () => {
    expect(effectiveCharCount("hello")).toBe(5);
  });

  it("normalizes @[name:id] mentions to @name", () => {
    // @[alice:abc-123] → @alice (6 chars)
    expect(effectiveCharCount("hi @[alice:abc-123]")).toBe("hi @alice".length);
  });

  it("handles multiple mentions", () => {
    const text = "@[a:1] @[bb:22]";
    // normalized: "@a @bb" = 6 chars
    expect(effectiveCharCount(text)).toBe(6);
  });

  it("adds 39 extra chars per newline", () => {
    // "a\nb" = 3 chars + 1 newline * 39 = 42
    expect(effectiveCharCount("a\nb")).toBe(42);
  });

  it("counts multiple newlines", () => {
    // "a\n\nb" = 4 chars + 2 newlines * 39 = 82
    expect(effectiveCharCount("a\n\nb")).toBe(82);
  });

  it("handles empty string", () => {
    expect(effectiveCharCount("")).toBe(0);
  });
});

describe("generateCode", () => {
  it("returns a 6-digit string", () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("returns a value between 100000 and 999999", () => {
    for (let i = 0; i < 50; i++) {
      const num = Number(generateCode());
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThanOrEqual(999999);
    }
  });
});

describe("SHOUT_MAX_LENGTH", () => {
  it("is 1000", () => {
    expect(SHOUT_MAX_LENGTH).toBe(1000);
  });
});

describe("registerSchema", () => {
  it("accepts valid input", () => {
    const result = registerSchema.safeParse({
      username: "testuser",
      password: "password123",
      email: "test@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects username shorter than 3 chars", () => {
    const result = registerSchema.safeParse({
      username: "ab",
      password: "password123",
      email: "test@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects username longer than 32 chars", () => {
    const result = registerSchema.safeParse({
      username: "a".repeat(33),
      password: "password123",
      email: "test@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects username with forbidden characters", () => {
    const result = registerSchema.safeParse({
      username: "user@name!",
      password: "password123",
      email: "test@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("accepts Russian characters in username", () => {
    const result = registerSchema.safeParse({
      username: "Пользователь",
      password: "password123",
      email: "test@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects password shorter than 6 chars", () => {
    const result = registerSchema.safeParse({
      username: "testuser",
      password: "12345",
      email: "test@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      username: "testuser",
      password: "password123",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid login", () => {
    const result = loginSchema.safeParse({ login: "user", password: "pass" });
    expect(result.success).toBe(true);
  });

  it("rejects empty login", () => {
    const result = loginSchema.safeParse({ login: "", password: "pass" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ login: "user", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("shoutSchema", () => {
  it("accepts valid shout with content", () => {
    const result = shoutSchema.safeParse({ content: "Hello world" });
    expect(result.success).toBe(true);
  });

  it("accepts empty content (defaults to empty string)", () => {
    const result = shoutSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.content).toBe("");
  });

  it("rejects content exceeding effective char limit", () => {
    const result = shoutSchema.safeParse({ content: "a".repeat(1001) });
    expect(result.success).toBe(false);
  });

  it("accepts content up to 1000 chars", () => {
    const result = shoutSchema.safeParse({ content: "a".repeat(1000) });
    expect(result.success).toBe(true);
  });

  it("accepts optional mediaId as valid UUID", () => {
    const result = shoutSchema.safeParse({
      content: "test",
      mediaId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid mediaId", () => {
    const result = shoutSchema.safeParse({ content: "test", mediaId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});

describe("commentSchema", () => {
  it("accepts valid comment", () => {
    const result = commentSchema.safeParse({ content: "Nice post!" });
    expect(result.success).toBe(true);
  });

  it("rejects content exceeding effective char limit", () => {
    const result = commentSchema.safeParse({ content: "a".repeat(401) });
    expect(result.success).toBe(false);
  });
});

describe("announcementSchema", () => {
  it("accepts valid announcement", () => {
    const result = announcementSchema.safeParse({
      title: "v1.2 release",
      content: "System maintenance",
      secret_key: "secret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty content", () => {
    const result = announcementSchema.safeParse({ title: "Title", content: "", secret_key: "s" });
    expect(result.success).toBe(false);
  });

  it("rejects missing secret_key", () => {
    const result = announcementSchema.safeParse({ title: "Title", content: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const result = announcementSchema.safeParse({ content: "test", secret_key: "s" });
    expect(result.success).toBe(false);
  });
});

describe("profileUpdateSchema", () => {
  it("accepts valid profile update", () => {
    const result = profileUpdateSchema.safeParse({ username: "newname" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all fields optional)", () => {
    const result = profileUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects new password shorter than 6 chars", () => {
    const result = profileUpdateSchema.safeParse({ newPassword: "12345" });
    expect(result.success).toBe(false);
  });
});

describe("verifyCodeSchema", () => {
  it("accepts valid email and 6-digit code", () => {
    const result = verifyCodeSchema.safeParse({ email: "a@b.com", code: "123456" });
    expect(result.success).toBe(true);
  });

  it("rejects code that is not exactly 6 characters", () => {
    expect(verifyCodeSchema.safeParse({ email: "a@b.com", code: "12345" }).success).toBe(false);
    expect(verifyCodeSchema.safeParse({ email: "a@b.com", code: "1234567" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts valid email", () => {
    const result = forgotPasswordSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = forgotPasswordSchema.safeParse({ email: "bad" });
    expect(result.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts valid reset data", () => {
    const result = resetPasswordSchema.safeParse({
      email: "user@example.com",
      code: "123456",
      newPassword: "newpass123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short new password", () => {
    const result = resetPasswordSchema.safeParse({
      email: "user@example.com",
      code: "123456",
      newPassword: "short",
    });
    expect(result.success).toBe(false);
  });
});
