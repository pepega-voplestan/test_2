import nodemailer from "nodemailer";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

let transporter = null;

if (RESEND_API_KEY) {
  transporter = nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: {
      user: "resend",
      pass: RESEND_API_KEY,
    },
  });
  console.log("[Email] SMTP transporter configured (Resend)");
} else {
  console.warn("[Email] RESEND_API_KEY not set — emails will be logged to console only");
}

/**
 * Send a 6-digit verification code to the given email address.
 * @param {string} to - recipient email
 * @param {string} code - 6-digit code
 * @param {"register"|"reset"|"email_change"} purpose
 */
export async function sendVerificationEmail(to, code, purpose) {
  const subjects = {
    register: "Код подтверждения регистрации — Вопли",
    reset: "Код для сброса пароля — Вопли",
    email_change: "Код подтверждения нового email — Вопли",
  };
  const headings = {
    register: "Подтверждение регистрации",
    reset: "Сброс пароля",
    email_change: "Смена email",
  };
  const texts = {
    register: `Ваш код подтверждения: ${code}\n\nВведите этот код в форме регистрации. Код действителен 10 минут.\n\nЕсли вы не регистрировались на Вопли, просто проигнорируйте это письмо.`,
    reset: `Ваш код для сброса пароля: ${code}\n\nВведите этот код в форме восстановления пароля. Код действителен 10 минут.\n\nЕсли вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`,
    email_change: `Ваш код подтверждения: ${code}\n\nВведите этот код для подтверждения нового email. Код действителен 10 минут.\n\nЕсли вы не меняли email на Вопли, просто проигнорируйте это письмо.`,
  };
  const prompts = {
    register: "Введите этот код в форме регистрации:",
    reset: "Введите этот код в форме восстановления пароля:",
    email_change: "Введите этот код для подтверждения нового email:",
  };

  const subject = subjects[purpose];
  const heading = headings[purpose];
  const text = texts[purpose];

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #18181b; color: #e4e4e7; border-radius: 16px;">
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #fff;">${heading}</h2>
      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #a1a1aa;">
        ${prompts[purpose]}
      </p>
      <div style="background: #27272a; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #fff;">${code}</span>
      </div>
      <p style="margin: 0; font-size: 12px; color: #71717a;">
        Код действителен 10 минут. Если вы не запрашивали этот код, просто проигнорируйте это письмо.
      </p>
    </div>
  `;

  if (!transporter) {
    console.log(`[Email] (no SMTP) Would send to ${to}: [${purpose}] code=${code}`);
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      text,
      html,
    });
    console.log(`[Email] Sent ${purpose} code to ${to}, messageId=${info.messageId}`);
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err.message);
    throw new Error("Не удалось отправить письмо. Попробуйте позже.", { cause: err });
  }
}
