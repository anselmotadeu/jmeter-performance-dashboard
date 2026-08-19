import nodemailer from "nodemailer";

type AuthEmail = {
  to: string;
  subject: string;
  title: string;
  description: string;
  action: string;
  url: string;
  secondaryAction?: string;
  secondaryUrl?: string;
  footer?: string;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

export async function sendAuthEmail({
  to,
  subject,
  title,
  description,
  action,
  url,
  secondaryAction,
  secondaryUrl,
  footer = "Este link é pessoal e temporário. Se você não solicitou esta ação, ignore este e-mail.",
}: AuthEmail) {
  const user = process.env.ZOHO_SMTP_USER;
  const password = process.env.ZOHO_SMTP_PASS;
  if (!user || !password) {
    if (process.env.NODE_ENV === "production")
      throw new Error("Credenciais SMTP não configuradas.");
    console.warn(`[auth-email] ${subject}: ${url}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST ?? "smtppro.zoho.com",
    port: Number(process.env.ZOHO_SMTP_PORT ?? 465),
    secure: process.env.ZOHO_SMTP_SECURE !== "false",
    auth: { user, pass: password },
  });
  const secondaryText =
    secondaryAction && secondaryUrl
      ? `\n${secondaryAction}: ${secondaryUrl}`
      : "";
  const secondaryButton =
    secondaryAction && secondaryUrl
      ? `<a href="${escapeHtml(secondaryUrl)}" style="display:inline-block;padding:12px 18px;border:1px solid #cbd5e1;border-radius:12px;color:#334155;text-decoration:none;font-weight:700">${escapeHtml(secondaryAction)}</a>`
      : "";
  await transporter.sendMail({
    from: {
      name: process.env.ZOHO_SMTP_FROM_NAME ?? "Performance Dashboard",
      address: process.env.ZOHO_SMTP_FROM_EMAIL ?? user,
    },
    to,
    subject,
    text: `${description}\n\n${action}: ${url}${secondaryText}\n\n${footer}`,
    html: `<div style="background:#f1f5f9;padding:40px 16px;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:32px"><div style="font-size:13px;font-weight:700;letter-spacing:.15em;color:#2563eb;text-transform:uppercase">Performance Dashboard</div><h1 style="font-size:26px;margin:20px 0 12px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.6;color:#475569">${escapeHtml(description)}</p><div style="display:flex;flex-wrap:wrap;gap:10px;margin:18px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 20px;border-radius:12px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(action)}</a>${secondaryButton}</div><p style="font-size:13px;line-height:1.5;color:#64748b">${escapeHtml(footer)}</p></div></div>`,
  });
}
