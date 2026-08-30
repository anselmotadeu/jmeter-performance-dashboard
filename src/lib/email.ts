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

const APP_URL = process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app';

function canSendEmail() {
  if (!process.env.ZOHO_SMTP_USER || !process.env.ZOHO_SMTP_PASS) {
    console.warn('[Email] SMTP não configurado');
    return false;
  }
  return true;
}

/**
 * Layout base dos e-mails de billing — mesmo padrão visual do TestDiff.
 * Apenas a identidade visual (cores/brand) muda em relação ao TestDiff.
 * Dark mode completo: TODOS os textos usam classes (em-*) para que o
 * `prefers-color-scheme: dark` mantenha o conteúdo legível nos dois temas.
 */
function emailLayout(body: string, previewText = '') {
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="color-scheme" content="light dark"/>
  <meta name="supported-color-schemes" content="light dark"/>
  <title>Performance Dashboard</title>
  <style>
    :root { color-scheme: light dark; }
    @media (prefers-color-scheme: dark) {
      body, .em-outer         { background-color: #060b14 !important; }
      .em-card                { background-color: #0d1526 !important; border-color: #1e2d45 !important; }
      .em-inner               { background-color: #111c30 !important; border-color: #1e2d45 !important; }
      .em-footer              { background-color: #080f1e !important; border-color: #1e2d45 !important; }
      .em-footer-text         { color: #64748b !important; }
      .em-divider-td,
      .em-meta-sep            { border-top-color: #1e2d45 !important; }
      .em-h1                  { color: #f8fafc !important; }
      .em-h2                  { color: #e2e8f0 !important; }
      .em-overline            { color: #94a3b8 !important; }
      .em-body                { color: #cbd5e1 !important; }
      .em-strong              { color: #f1f5f9 !important; }
      .em-muted               { color: #64748b !important; }
      .em-meta-key            { color: #64748b !important; }
      .em-meta-val            { color: #e2e8f0 !important; }
      .em-box-title           { color: #e2e8f0 !important; }
      .em-box-text            { color: #94a3b8 !important; }
    }
  </style>
  ${previewText ? `<span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;</span>` : ''}
</head>
<body class="em-outer" style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" class="em-outer" style="background-color:#f8fafc;">
    <tr>
      <td align="center" style="padding:40px 16px 48px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">

          <!-- HEADER: indigo Performance Dashboard -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background:linear-gradient(135deg,#312e81 0%,#4338ca 50%,#4f46e5 100%);border-radius:16px 16px 0 0;overflow:hidden;">
                <tr>
                  <td style="padding:28px 40px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align:middle;padding-right:12px;">
                          <div style="width:42px;height:42px;background:rgba(255,255,255,0.25);border-radius:11px;text-align:center;line-height:42px;font-size:20px;">📊</div>
                        </td>
                        <td style="vertical-align:middle;">
                          <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Performance Dashboard</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY CARD -->
          <tr>
            <td class="em-card" style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding:40px;">${body}</td></tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="em-footer" style="background:#f1f5f9;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
              <p class="em-footer-text" style="margin:0 0 4px;color:#64748b;font-size:12px;line-height:1.7;">
                Você está recebendo este email por ter uma conta no Performance Dashboard.
              </p>
              <p class="em-footer-text" style="margin:0;color:#64748b;font-size:12px;line-height:1.7;">
                Dúvidas? Acesse <a href="${APP_URL}" style="color:#64748b;">jmeter-performance-dashboard.vercel.app</a> ou responda este email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function divider(): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
    <tr><td class="em-divider-td" style="border-top:1px solid #e2e8f0;font-size:0;line-height:0;">&nbsp;</td></tr>
  </table>`;
}

function ctaButton(label: string, url: string, color = '#4f46e5'): string {
  return `<table cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="border-radius:12px;background:${color};box-shadow:0 4px 14px rgba(79,70,229,0.25);">
        <a href="${url}" style="display:inline-block;padding:16px 36px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;letter-spacing:-0.3px;border-radius:12px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

const PLAN_INFO: Record<'grafico' | 'panorama', { color: string; features: string[] }> = {
  grafico: {
    color: '#4f46e5',
    features: [
      '50 análises de arquivos de resultados por mês',
      'Dashboard interativo (JMeter, K6, Locust e mais)',
      'Armazenamento seguro das análises',
      'Suporte por email',
    ],
  },
  panorama: {
    color: '#0ea5e9',
    features: [
      '250 análises de arquivos de resultados por mês',
      'Gráficos avançados e comparativo de execuções',
      'Exportação em PDF e PNG',
      'Histórico de análises',
      'Suporte prioritário por email',
    ],
  },
};

export async function sendSubscriptionConfirmationEmail(opts: {
  to: string; userName: string; planName: string;
  planSlug?: 'grafico' | 'panorama';
  priceBRL: string; renewalDate: string; appUrl: string;
}): Promise<void> {
  if (!canSendEmail()) return;
  const firstName = opts.userName.split(' ')[0] || 'Cliente';

  const plan = PLAN_INFO[opts.planSlug ?? 'grafico'] ?? PLAN_INFO['grafico'];

  const featureItems = plan.features.map(f =>
    `<tr>
      <td style="vertical-align:top;padding-right:10px;font-size:15px;">✅</td>
      <td style="padding:0 0 8px;"><p class="em-box-text" style="margin:0;color:#475569;font-size:14px;line-height:1.5;">${f}</p></td>
    </tr>`
  ).join('');

  const body = `
    <p class="em-overline" style="margin:0 0 4px;color:#475569;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Assinatura confirmada</p>
    <h1 class="em-h1" style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:800;line-height:1.2;letter-spacing:-0.5px;">
      Parabéns, ${firstName}! 🎉
    </h1>
    <p class="em-body" style="margin:0 0 28px;color:#334155;font-size:15px;line-height:1.8;">
      Seu plano <strong style="color:${plan.color};">${opts.planName}</strong> foi ativado com sucesso. Você já tem acesso completo a todas as funcionalidades.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" class="em-inner"
      style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid ${plan.color};border-radius:0 12px 12px 0;margin-bottom:28px;">
      <tr>
        <td style="padding:16px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="em-meta-key" style="padding:8px 0;color:#64748b;font-size:13px;width:120px;">Plano</td>
              <td class="em-meta-val" style="padding:8px 0 8px 12px;color:#0f172a;font-size:14px;font-weight:700;">${opts.planName}</td>
            </tr>
            <tr><td colspan="2" class="em-meta-sep" style="padding:0;border-top:1px solid #e2e8f0;font-size:0;">&nbsp;</td></tr>
            <tr>
              <td class="em-meta-key" style="padding:8px 0;color:#64748b;font-size:13px;">Valor mensal</td>
              <td class="em-meta-val" style="padding:8px 0 8px 12px;color:#0f172a;font-size:14px;font-weight:700;">${opts.priceBRL}/mês</td>
            </tr>
            <tr><td colspan="2" class="em-meta-sep" style="padding:0;border-top:1px solid #e2e8f0;font-size:0;">&nbsp;</td></tr>
            <tr>
              <td class="em-meta-key" style="padding:8px 0;color:#64748b;font-size:13px;">Próxima renovação</td>
              <td class="em-meta-val" style="padding:8px 0 8px 12px;color:#0f172a;font-size:14px;">${opts.renewalDate}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p class="em-overline" style="margin:0 0 8px;color:#475569;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Incluído no seu plano</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" class="em-inner"
      style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:32px;">
      <tr><td style="padding:20px 24px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">${featureItems}</table>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td>${ctaButton('Acessar meu dashboard →', opts.appUrl, plan.color)}</td></tr>
    </table>

    ${divider()}

    <table width="100%" cellpadding="0" cellspacing="0" border="0" class="em-inner"
      style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
      <tr><td style="padding:20px 24px;">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:top;padding-right:14px;font-size:20px;">💬</td>
            <td>
              <p class="em-box-title" style="margin:0 0 4px;color:#0f172a;font-size:14px;font-weight:700;">Precisa de ajuda?</p>
              <p class="em-box-text" style="margin:0;color:#475569;font-size:13px;line-height:1.6;">
                Acesse <strong style="color:#475569;">Minha Conta</strong> para gerenciar sua assinatura ou responda este email.
                Respondemos em até <strong style="color:#475569;">48 horas úteis</strong>.
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `Plano ${opts.planName} ativado — Performance Dashboard 🎉`,
    html: emailLayout(body, `Seu plano ${opts.planName} foi ativado com sucesso.`),
  });
}

export async function sendCancellationEmail(opts: {
  to: string; userName: string; planName: string;
  accessUntil: string; appUrl: string;
}): Promise<void> {
  if (!canSendEmail()) return;
  const firstName = opts.userName.split(' ')[0] || 'Cliente';

  const body = `
    <p class="em-overline" style="margin:0 0 4px;color:#475569;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Assinatura cancelada</p>
    <h1 class="em-h1" style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:800;line-height:1.2;">
      Sentimos sua falta, ${firstName} 😔
    </h1>
    <p class="em-body" style="margin:0 0 28px;color:#334155;font-size:15px;line-height:1.8;">
      Sua assinatura do plano <strong class="em-strong" style="color:#0f172a;">${opts.planName}</strong> foi cancelada.
      Você continua com acesso completo até o final do período pago.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:#fee2e2;border:1px solid #fecaca;border-left:4px solid #ef4444;border-radius:0 12px 12px 0;margin-bottom:28px;">
      <tr><td style="padding:16px 24px;">
        <p style="margin:0;color:#7f1d1d;font-size:14px;font-weight:700;">📅 Acesso encerra em ${opts.accessUntil}</p>
        <p style="margin:6px 0 0;color:#7f1d1d;font-size:13px;">Após essa data, o acesso às análises ficará suspenso.</p>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td>${ctaButton('Reativar minha assinatura →', opts.appUrl + '/pricing', '#1d4ed8')}</td></tr>
    </table>

    <p class="em-muted" style="margin:0;color:#64748b;font-size:13px;text-align:center;">
      Se mudar de ideia, basta reativar em /pricing antes de ${opts.accessUntil}.
    </p>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `Assinatura cancelada — acesso até ${opts.accessUntil}`,
    html: emailLayout(body, `Cancelamento confirmado. Acesso continua até ${opts.accessUntil}.`),
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

  const firstName = opts.userName.split(' ')[0] || 'Cliente';
  const valor = opts.valorServicos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const codeRow = opts.codigoVerificacao
    ? `<tr><td colspan="2" class="em-meta-sep" style="padding:0;border-top:1px solid #e2e8f0;font-size:0;">&nbsp;</td></tr>
       <tr>
         <td class="em-meta-key" style="padding:10px 0;color:#64748b;font-size:13px;">Código de verificação</td>
         <td class="em-meta-val" style="padding:10px 0 10px 12px;color:#0f172a;font-size:14px;font-family:monospace;font-weight:700;">${opts.codigoVerificacao}</td>
       </tr>`
    : '';

  const body = `
    <p class="em-overline" style="margin:0 0 4px;color:#475569;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Nota fiscal de serviço</p>
    <h1 class="em-h1" style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:800;line-height:1.2;">Sua NFS-e foi emitida</h1>
    <p class="em-body" style="margin:0 0 28px;color:#334155;font-size:15px;line-height:1.8;">
      Olá, ${firstName}. A nota fiscal referente ao pagamento do plano <strong class="em-strong" style="color:#0f172a;">${opts.planName}</strong>
      de <strong class="em-strong" style="color:#0f172a;">${opts.mesReferencia}</strong> está disponível para consulta.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" class="em-inner"
      style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:28px;">
      <tr><td style="padding:16px 24px;"><table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="em-meta-key" style="padding:10px 0;color:#64748b;font-size:13px;">Número da NFS-e</td>
          <td class="em-meta-val" style="padding:10px 0 10px 12px;color:#0f172a;font-size:14px;font-family:monospace;font-weight:700;">${opts.nfseNumero}</td>
        </tr>
        ${codeRow}
        <tr><td colspan="2" class="em-meta-sep" style="padding:0;border-top:1px solid #e2e8f0;font-size:0;">&nbsp;</td></tr>
        <tr>
          <td class="em-meta-key" style="padding:10px 0;color:#64748b;font-size:13px;">Valor</td>
          <td class="em-meta-val" style="padding:10px 0 10px 12px;color:#0f172a;font-size:14px;font-weight:700;">${valor}</td>
        </tr>
        <tr><td colspan="2" class="em-meta-sep" style="padding:0;border-top:1px solid #e2e8f0;font-size:0;">&nbsp;</td></tr>
        <tr>
          <td class="em-meta-key" style="padding:10px 0;color:#64748b;font-size:13px;">Prestador</td>
          <td class="em-meta-val" style="padding:10px 0 10px 12px;color:#0f172a;font-size:13px;">ANSTECH QUALITY ASSURANCE LTDA<br/>CNPJ: 48.847.227/0001-01</td>
        </tr>
      </table></td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td align="center">${ctaButton('Consultar NFS-e na Prefeitura →', opts.verificacaoUrl)}</td></tr>
    </table>

    <p class="em-muted" style="margin:0;color:#64748b;font-size:12px;line-height:1.7;">
      Na página da Prefeitura de São Paulo, informe o CNPJ da ANSTECH <strong>48.847.227/0001-01</strong>,
      o número da nota e o código de verificação apresentados acima.
    </p>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `NFS-e nº ${opts.nfseNumero} emitida — Performance Dashboard`,
    html: emailLayout(body, `Sua NFS-e nº ${opts.nfseNumero} foi emitida e está disponível para consulta.`),
  });
}

export async function sendTrialExpiringEmail(opts: {
  to: string; userName: string; daysLeft: number; appUrl: string;
}): Promise<void> {
  if (!canSendEmail()) return;
  const firstName = opts.userName.split(' ')[0] || 'Cliente';

  const body = `
    <p class="em-overline" style="margin:0 0 4px;color:#475569;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Trial expirando em ${opts.daysLeft} dia${opts.daysLeft > 1 ? 's' : ''}</p>
    <h1 class="em-h1" style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:800;line-height:1.2;">Olá, ${firstName}! 👋</h1>
    <p class="em-body" style="margin:0 0 28px;color:#334155;font-size:15px;line-height:1.8;">
      Seu período de teste gratuito termina em <strong class="em-strong" style="color:#0f172a;">${opts.daysLeft} dia${opts.daysLeft > 1 ? 's' : ''}</strong>. Para continuar acessando todos os recursos do Performance Dashboard, escolha um plano que se encaixe nas suas necessidades.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:#fef3c7;border:1px solid #fbbf24;border-left:4px solid #f59e0b;border-radius:0 12px 12px 0;margin-bottom:28px;">
      <tr><td style="padding:16px 24px;">
        <p style="margin:0;color:#92400e;font-size:14px;font-weight:700;">⚠️ Ação necessária: assine um plano antes que seu trial expire</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td>${ctaButton('Ver planos disponíveis →', opts.appUrl + '/pricing', '#f59e0b')}</td></tr>
    </table>
    <p class="em-muted" style="margin:0;color:#64748b;font-size:13px;text-align:center;">
      Seu acesso atual continua até o fim do período de teste.
    </p>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `Seu trial expira em ${opts.daysLeft} dia${opts.daysLeft > 1 ? 's' : ''} ⏰`,
    html: emailLayout(body, `Seu período de teste termina em ${opts.daysLeft} dia${opts.daysLeft > 1 ? 's' : ''}.`),
  });
}

export async function sendTrialExpiredEmail(opts: {
  to: string; userName: string; appUrl: string;
}): Promise<void> {
  if (!canSendEmail()) return;
  const firstName = opts.userName.split(' ')[0] || 'Cliente';

  const body = `
    <p class="em-overline" style="margin:0 0 4px;color:#475569;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Trial expirado</p>
    <h1 class="em-h1" style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:800;line-height:1.2;">Olá, ${firstName}</h1>
    <p class="em-body" style="margin:0 0 28px;color:#334155;font-size:15px;line-height:1.8;">
      Seu período de teste gratuito <strong class="em-strong" style="color:#0f172a;">expirou</strong>. Para continuar usando o Performance Dashboard com todos os recursos, escolha um plano agora.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:#fee2e2;border:1px solid #fecaca;border-left:4px solid #ef4444;border-radius:0 12px 12px 0;margin-bottom:28px;">
      <tr><td style="padding:16px 24px;">
        <p style="margin:0;color:#7f1d1d;font-size:14px;font-weight:700;">🔒 Acesso bloqueado: assine um plano para continuar</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td>${ctaButton('Assinar agora →', opts.appUrl + '/pricing', '#ef4444')}</td></tr>
    </table>
    <p class="em-muted" style="margin:0;color:#64748b;font-size:13px;text-align:center;">
      Assine um plano para recuperar o acesso imediatamente.
    </p>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `Seu trial expirou — Assine para continuar 🔒`,
    html: emailLayout(body, `Seu período de teste gratuito expirou.`),
  });
}

export async function sendPaymentFailedEmail(opts: {
  to: string; userName: string; planName: string; appUrl: string;
}): Promise<void> {
  if (!canSendEmail()) return;
  const firstName = opts.userName.split(' ')[0] || 'Cliente';

  const body = `
    <p class="em-overline" style="margin:0 0 4px;color:#475569;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Falha no pagamento</p>
    <h1 class="em-h1" style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:800;line-height:1.2;">Olá, ${firstName} 😟</h1>
    <p class="em-body" style="margin:0 0 28px;color:#334155;font-size:15px;line-height:1.8;">
      Não conseguimos processar o pagamento da sua assinatura do plano <strong class="em-strong" style="color:#0f172a;">${opts.planName}</strong>. Seu acesso continua ativo pelos próximos dias, mas atualize suas informações de pagamento para evitar interrupção.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:#fee2e2;border:1px solid #fecaca;border-left:4px solid #ef4444;border-radius:0 12px 12px 0;margin-bottom:28px;">
      <tr><td style="padding:16px 24px;">
        <p style="margin:0;color:#7f1d1d;font-size:14px;font-weight:700;">⚠️ Importante: atualize seu método de pagamento para manter o acesso</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td align="center">${ctaButton('Atualizar pagamento →', opts.appUrl + '/minha-conta', '#ef4444')}</td></tr>
    </table>
    <p class="em-muted" style="margin:0;color:#64748b;font-size:13px;text-align:center;">
      Se você já atualizou, ignore este email.
    </p>
  `;

  await getTransporter().sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: opts.to,
    subject: `Falha no pagamento — Atualize suas informações 💳`,
    html: emailLayout(body, `Não conseguimos processar o pagamento da sua assinatura.`),
  });
}