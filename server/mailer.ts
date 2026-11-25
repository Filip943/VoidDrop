import nodemailer from 'nodemailer';

export interface ActivationEmailResult {
  smtpConfigured: boolean;
  devMailPreview?: {
    to: string;
    subject: string;
    code: string;
  };
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

export async function sendActivationCodeEmail(params: {
  to: string;
  nickname: string;
  code: string;
}): Promise<ActivationEmailResult> {
  const subject = `VoidDrop — Twój kod aktywacyjny: ${params.code}`;
  const from = process.env.SMTP_FROM?.trim() || 'VoidDrop <noreply@voiddrop.app>';

  const html = `
    <div style="background:#06070B;color:#F1F5F9;font-family:Arial,sans-serif;padding:32px;border-radius:12px;max-width:520px;margin:0 auto;border:1px solid rgba(255,255,255,0.1);">
      <h1 style="margin:0 0 12px;font-size:22px;color:#22D3EE;">VoidDrop</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#CBD5E1;">
        Cześć <strong>${escapeHtml(params.nickname)}</strong>,<br/>
        aby aktywować swoje konto w przestrzeni VoidDrop, wpisz poniższy 6-cyfrowy kod weryfikacyjny:
      </p>
      <div style="background:#0E121D;border:1px solid rgba(34,211,238,0.35);border-radius:8px;padding:18px;text-align:center;margin:20px 0;">
        <span style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#67E8F9;">${escapeHtml(params.code)}</span>
      </div>
      <p style="margin:0;font-size:13px;color:#94A3B8;">
        Kod jest ważny przez 15 minut. Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.
      </p>
    </div>
  `;

  if (!isSmtpConfigured()) {
    return {
      smtpConfigured: false,
      devMailPreview: {
        to: params.to,
        subject,
        code: params.code,
      },
    };
  }

  const port = Number(process.env.SMTP_PORT || '587');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port: Number.isFinite(port) ? port : 587,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!.trim(),
    },
  });

  await transporter.sendMail({
    from,
    to: params.to,
    subject,
    text: `Cześć ${params.nickname}, Twój 6-cyfrowy kod aktywacyjny VoidDrop to: ${params.code} (ważny 15 minut).`,
    html,
  });

  return { smtpConfigured: true };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
