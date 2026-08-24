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

// ─── Funções de billing (padrão TestDiff/EstilOS) ────────────────────────────

function getTransporter() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodemailer = require('nodemailer') as typeof import('nodemailer');
  return nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST ?? 'smtppro.zoho.com',
    port: Number(process.env.ZOHO_SMTP_PORT ?? 465),
    secure: process.env.ZOHO_SMTP_SECURE !== 'false',
    auth: { user: process.env.ZOHO_SMTP_USER, pass: process.env.ZOHO_SMTP_PASS },
  });
}

const FROM_NAME  = process.env.ZOHO_SMTP_FROM_NAME  ?? 'Performance Dashboard';
const FROM_EMAIL = process.env.ZOHO_SMTP_FROM_EMAIL ?? '';

function canSendEmail() {
  if (!process.env.ZOHO_SMTP_USER || !process.env.ZOHO_SMTP_PASS) {
    console.warn('[Email] SMTP não configurado');
    return false;
  }
  return true;
}

function billingLayout(body: string, previewText = '') {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Performance Dashboard</title>
  ${previewText ? `<span style="display:none;max-height:0;overflow:hidden;">${previewText}</span>` : ''}
  </head><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="100%" style="max-width:580px;">
        <tr><td style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8,#0ea5e9);border-radius:16px 16px 0 0;padding:28px 40px;">
          <span style="color:#fff;font-size:22px;font-weight:800;">📊 Performance Dashboard</span>
        </td></tr>
        <tr><td style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:40px;">${body}</td></tr>
        <tr><td style="background:#f1f5f9;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">Você recebeu este email por ter uma conta no Performance Dashboard.</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export async function sendSubscriptionConfirmationEmail(opts: {
  to: string; userName: string; planName: string;
  priceBRL: string; renewalDate: string; appUrl: string;
}): Promise<void> {
  if (!canSendEmail()) return;
  const firstName = opts.userName.split(' ')[0] || 'Cliente';

  const body = `
    <p style="margin:0 0 4px;color:#94a3b8;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Assinatura confirmada</p>
    <h1 style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:800;">Parabéns, ${firstName}! 🎉</h1>
    <p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.8;">
      Seu plano <strong style="color:#1d4ed8;">${opts.planName}</strong> foi ativado com sucesso.
    </p>
    <table style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1d4ed8;border-radius:0 12px 12px 0;margin-bottom:28px;padding:16px 24px;width:100%;">
      <tr><td><strong>Plano:</strong> ${opts.planName}</td></tr>
      <tr><td><strong>Valor:</strong> ${opts.priceBRL}/mês</td></tr>
      <tr><td><strong>Próxima renovação:</strong> ${opts.renewalDate}</td></tr>
    </table>
    <a href="${opts.appUrl}" style="display:inline-block;padding:16px 36px;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;border-radius:12px;">Acessar meu dashboard →</a>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `Plano ${opts.planName} ativado — Performance Dashboard 🎉`,
    html: billingLayout(body, `Seu plano ${opts.planName} foi ativado.`),
  });
}

export async function sendCancellationEmail(opts: {
  to: string; userName: string; planName: string;
  accessUntil: string; appUrl: string;
}): Promise<void> {
  if (!canSendEmail()) return;
  const firstName = opts.userName.split(' ')[0] || 'Cliente';

  const body = `
    <h1 style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:800;">Sentimos sua falta, ${firstName} 😔</h1>
    <p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.8;">
      Sua assinatura do plano <strong>${opts.planName}</strong> foi cancelada. Acesso mantido até ${opts.accessUntil}.
    </p>
    <a href="${opts.appUrl}/pricing" style="display:inline-block;padding:16px 36px;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;border-radius:12px;">Reativar assinatura →</a>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `Assinatura cancelada — acesso até ${opts.accessUntil}`,
    html: billingLayout(body),
  });
}

export async function sendNFSeEmail(opts: {
  to: string;
  userName: string;
  nfseNumero: string;
  codigoVerificacao: string | null;
  verificacaoUrl: string;
  valorServicos: number;
  planName: string;
  mesReferencia: string;
}): Promise<void> {
  if (!canSendEmail()) throw new Error('SMTP Zoho não configurado para envio da NFS-e');

  const body = `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#0f172a">
      <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px;border-radius:16px 16px 0 0;text-align:center">
        <h1 style="color:#fff;font-size:28px;margin:0">NFS-e Emitida</h1>
        <p style="color:#dbeafe;font-size:14px;margin-top:8px">Sua nota fiscal foi gerada com sucesso</p>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:0">
        <p style="font-size:16px;line-height:1.6;margin:0 0 24px">
          Olá ${escapeHtml(opts.userName)},
        </p>
        <p style="font-size:16px;line-height:1.6;margin:0 0 24px">
          Sua NFS-e referente ao plano <strong>${escapeHtml(opts.planName)}</strong> (${escapeHtml(opts.mesReferencia)}) foi emitida com sucesso pela Prefeitura de São Paulo.
        </p>
        <div style="background:#f1f5f9;padding:20px;border-radius:12px;margin:0 0 24px">
          <div style="display:grid;gap:12px">
            <div>
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;margin-bottom:4px">Número da NFS-e</div>
              <div style="font-size:18px;font-weight:700;color:#0f172a;font-family:monospace">${escapeHtml(opts.nfseNumero)}</div>
            </div>
            ${opts.codigoVerificacao ? `
            <div>
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;margin-bottom:4px">Código de Verificação</div>
              <div style="font-size:14px;font-weight:600;color:#0f172a;font-family:monospace">${escapeHtml(opts.codigoVerificacao)}</div>
            </div>
            ` : ''}
            <div>
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;margin-bottom:4px">Valor</div>
              <div style="font-size:18px;font-weight:700;color:#059669">R$ ${opts.valorServicos.toFixed(2).replace('.', ',')}</div>
            </div>
          </div>
        </div>
        <p style="font-size:16px;line-height:1.6;margin:0 0 24px">
          Para consultar ou descargar a nota, acesse o portal da Prefeitura:
        </p>
        <div style="text-align:center;margin:0 0 24px">
          <a href="${escapeHtml(opts.verificacaoUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px">
            Consultar NFS-e →
          </a>
        </div>
        <p style="font-size:14px;line-height:1.6;margin:0;color:#64748b">
          Esta nota fiscal é válida em todo o território nacional e comprova o pagamento do serviço de análise de performance contratado.
        </p>
      </div>
      <div style="background:#f8fafc;padding:24px;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:0;text-align:center">
        <p style="font-size:13px;color:#64748b;margin:0">
          Dúvidas? Responda este email ou acesse nossa <a href="${escapeHtml(process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app')}/ajuda" style="color:#2563eb">central de ajuda</a>
        </p>
      </div>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `NFS-e #${opts.nfseNumero} - ${opts.planName} (${opts.mesReferencia})`,
    html: billingLayout(body, `Sua NFS-e #${opts.nfseNumero} foi emitida.`),
  });
}

export async function sendTrialExpiringEmail(opts: {
  to: string; userName: string; daysLeft: number; appUrl: string;
}): Promise<void> {
  if (!canSendEmail()) return;
  const firstName = opts.userName.split(' ')[0] || 'Cliente';

  const body = `
    <p style="margin:0 0 4px;color:#94a3b8;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Trial expirando em ${opts.daysLeft} dia${opts.daysLeft > 1 ? 's' : ''}</p>
    <h1 style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:800;">Olá, ${firstName}! 👋</h1>
    <p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.8;">
      Seu período de teste gratuito termina em <strong>${opts.daysLeft} dia${opts.daysLeft > 1 ? 's' : ''}</strong>. Para continuar acessando todos os recursos do Performance Dashboard, escolha um plano que se encaixe nas suas necessidades.
    </p>
    <table style="background:#fef3c7;border:1px solid #fbbf24;border-left:4px solid #f59e0b;border-radius:0 12px 12px 0;margin-bottom:28px;padding:16px 24px;width:100%;">
      <tr><td><strong>⚠️ Ação necessária:</strong> Assine um plano antes que seu trial expire</td></tr>
    </table>
    <a href="${opts.appUrl}/pricing" style="display:inline-block;padding:16px 36px;background:#f59e0b;color:#fff;text-decoration:none;font-weight:700;border-radius:12px;">Ver planos disponíveis →</a>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `Seu trial expira em ${opts.daysLeft} dia${opts.daysLeft > 1 ? 's' : ''} ⏰`,
    html: billingLayout(body, `Seu período de teste termina em ${opts.daysLeft} dia${opts.daysLeft > 1 ? 's' : ''}.`),
  });
}

export async function sendTrialExpiredEmail(opts: {
  to: string; userName: string; appUrl: string;
}): Promise<void> {
  if (!canSendEmail()) return;
  const firstName = opts.userName.split(' ')[0] || 'Cliente';

  const body = `
    <p style="margin:0 0 4px;color:#94a3b8;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Trial expirado</p>
    <h1 style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:800;">Olá, ${firstName}</h1>
    <p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.8;">
      Seu período de teste gratuito <strong>expirou</strong>. Para continuar usando o Performance Dashboard com todos os recursos, escolha um plano agora.
    </p>
    <table style="background:#fee2e2;border:1px solid #f87171;border-left:4px solid #ef4444;border-radius:0 12px 12px 0;margin-bottom:28px;padding:16px 24px;width:100%;">
      <tr><td><strong>🔒 Acesso bloqueado:</strong> Assine um plano para continuar</td></tr>
    </table>
    <a href="${opts.appUrl}/pricing" style="display:inline-block;padding:16px 36px;background:#ef4444;color:#fff;text-decoration:none;font-weight:700;border-radius:12px;">Assinar agora →</a>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `Seu trial expirou — Assine para continuar 🔒`,
    html: billingLayout(body, `Seu período de teste gratuito expirou.`),
  });
}

export async function sendPaymentFailedEmail(opts: {
  to: string; userName: string; planName: string; appUrl: string;
}): Promise<void> {
  if (!canSendEmail()) return;
  const firstName = opts.userName.split(' ')[0] || 'Cliente';

  const body = `
    <p style="margin:0 0 4px;color:#94a3b8;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Falha no pagamento</p>
    <h1 style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:800;">Olá, ${firstName} 😟</h1>
    <p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.8;">
      Não conseguimos processar o pagamento da sua assinatura do plano <strong>${opts.planName}</strong>. Seu acesso continua ativo pelos próximos dias, mas atualize suas informações de pagamento para evitar interrupção.
    </p>
    <table style="background:#fee2e2;border:1px solid #f87171;border-left:4px solid #ef4444;border-radius:0 12px 12px 0;margin-bottom:28px;padding:16px 24px;width:100%;">
      <tr><td><strong>⚠️ Importante:</strong> Atualize seu método de pagamento para manter o acesso</td></tr>
    </table>
    <a href="${opts.appUrl}/minha-conta" style="display:inline-block;padding:16px 36px;background:#ef4444;color:#fff;text-decoration:none;font-weight:700;border-radius:12px;">Atualizar pagamento →</a>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `Falha no pagamento — Atualize suas informações 💳`,
    html: billingLayout(body, `Não conseguimos processar o pagamento da sua assinatura.`),
  });
}
