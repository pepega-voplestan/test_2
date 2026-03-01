import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock nodemailer before the email module is imported so we can control the
// transporter in both the "no API key" and "with API key" scenarios.
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: "mock-msg-id" }),
    })),
  },
}));

// ── No-transporter path (RESEND_API_KEY unset) ────────────────────────────────
// The default test env does not set RESEND_API_KEY, so the module-level
// `transporter` is null and sendVerificationEmail just logs and returns.

describe("sendVerificationEmail — no SMTP configured", () => {
  let sendVerificationEmail;

  beforeAll(async () => {
    delete process.env.RESEND_API_KEY;
    // Dynamic import so it picks up the env state at load time
    const mod = await import("../../src/email.js");
    sendVerificationEmail = mod.sendVerificationEmail;
  });

  it("resolves without throwing for purpose='register'", async () => {
    await expect(
      sendVerificationEmail("alice@test.local", "123456", "register")
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing for purpose='reset'", async () => {
    await expect(
      sendVerificationEmail("alice@test.local", "654321", "reset")
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing for purpose='email_change'", async () => {
    await expect(
      sendVerificationEmail("alice@test.local", "111111", "email_change")
    ).resolves.toBeUndefined();
  });

  it("logs the code to console when no transporter", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendVerificationEmail("bob@test.local", "999999", "register");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("999999"));
    spy.mockRestore();
  });
});

// ── With-transporter path (RESEND_API_KEY set) ────────────────────────────────
// Re-import the module with RESEND_API_KEY set so the transporter is created.

describe("sendVerificationEmail — with SMTP configured", () => {
  let sendVerificationEmail;
  let mockSendMail;

  beforeAll(async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.EMAIL_FROM = "noreply@vopley.net";

    // Clear module cache so it re-reads RESEND_API_KEY
    vi.resetModules();
    const nodemailer = await import("nodemailer");
    mockSendMail = vi.fn().mockResolvedValue({ messageId: "mock-id" });
    nodemailer.default.createTransport.mockReturnValue({ sendMail: mockSendMail });

    const mod = await import("../../src/email.js");
    sendVerificationEmail = mod.sendVerificationEmail;
  });

  it("calls sendMail with correct recipient and subject for register", async () => {
    await sendVerificationEmail("alice@test.local", "123456", "register");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@test.local",
        subject: expect.stringContaining("регистрации"),
      })
    );
  });

  it("calls sendMail with correct subject for reset", async () => {
    await sendVerificationEmail("alice@test.local", "654321", "reset");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("пароля") })
    );
  });

  it("calls sendMail with correct subject for email_change", async () => {
    await sendVerificationEmail("alice@test.local", "111111", "email_change");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("email") })
    );
  });

  it("includes the code in both text and html body", async () => {
    await sendVerificationEmail("alice@test.local", "777777", "register");
    const call = mockSendMail.mock.calls.at(-1)[0];
    expect(call.text).toContain("777777");
    expect(call.html).toContain("777777");
  });

  it("throws a user-friendly error when sendMail rejects", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("SMTP timeout"));
    await expect(
      sendVerificationEmail("alice@test.local", "000000", "register")
    ).rejects.toThrow("Не удалось отправить письмо");
  });
});
