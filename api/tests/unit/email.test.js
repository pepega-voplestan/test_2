import { describe, it, expect, vi, beforeAll } from "vitest";

// vi.hoisted ensures mockEmailsSend is available inside the vi.mock factory,
// which is hoisted above regular variable declarations.
const mockEmailsSend = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: { send: mockEmailsSend },
  })),
}));

// ── No-client path (RESEND_API_KEY unset) ─────────────────────────────────────

describe("sendVerificationEmail — no API key configured", () => {
  let sendVerificationEmail;

  beforeAll(async () => {
    delete process.env.RESEND_API_KEY;
    vi.resetModules();
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

  it("logs the code to console when no API key", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendVerificationEmail("bob@test.local", "999999", "register");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("999999"));
    spy.mockRestore();
  });
});

// ── With-client path (RESEND_API_KEY set) ─────────────────────────────────────

describe("sendVerificationEmail — with API key configured", () => {
  let sendVerificationEmail;

  beforeAll(async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.EMAIL_FROM = "noreply@vopley.net";

    vi.resetModules();
    mockEmailsSend.mockResolvedValue({ data: { id: "mock-id" }, error: null });

    const mod = await import("../../src/email.js");
    sendVerificationEmail = mod.sendVerificationEmail;
  });

  it("calls emails.send with correct recipient and subject for register", async () => {
    await sendVerificationEmail("alice@test.local", "123456", "register");
    expect(mockEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@test.local",
        subject: expect.stringContaining("регистрации"),
      })
    );
  });

  it("calls emails.send with correct subject for reset", async () => {
    await sendVerificationEmail("alice@test.local", "654321", "reset");
    expect(mockEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("пароля") })
    );
  });

  it("calls emails.send with correct subject for email_change", async () => {
    await sendVerificationEmail("alice@test.local", "111111", "email_change");
    expect(mockEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("email") })
    );
  });

  it("includes the code in both text and html body", async () => {
    await sendVerificationEmail("alice@test.local", "777777", "register");
    const call = mockEmailsSend.mock.calls.at(-1)[0];
    expect(call.text).toContain("777777");
    expect(call.html).toContain("777777");
  });

  it("throws a user-friendly error when send returns an error", async () => {
    mockEmailsSend.mockResolvedValueOnce({ data: null, error: { message: "API error" } });
    await expect(
      sendVerificationEmail("alice@test.local", "000000", "register")
    ).rejects.toThrow("Не удалось отправить письмо");
  });
});
