/**
 * NFS-e — Prefeitura de São Paulo
 * Adaptado do EstilOS (server/nfse.ts) para o Performance Dashboard.
 * CNPJ e Inscrição Municipal são da ANSTECH — mesmos em todos os projetos.
 *
 * Deps: node-forge, xml-crypto
 * Vars de env: NFSE_CERT_BASE64, NFSE_CERT_PASSWORD, NFSE_HOMOLOGACAO
 */

import crypto from 'crypto';
import https from 'https';
import { db } from '@/lib/db';

// Lazy imports (node-specific — não executar no browser)
let forge: typeof import('node-forge');
let SignedXml: typeof import('xml-crypto').SignedXml;

async function loadNodeDeps() {
  if (!forge) {
    forge = (await import('node-forge')).default;
    SignedXml = (await import('xml-crypto')).SignedXml;
  }
}

// ─── Prestador (ANSTECH) — mesmo CNPJ em todos os projetos ───────────────────
const PRESTADOR_CNPJ = '48847227000101';
const PRESTADOR_IM = '75388359';
const SERIE_RPS = 'S1';
const CODIGO_SERVICO = '02660'; // Análise e desenvolvimento de sistemas
const ALIQUOTA = '0.0200';
const VERSAO_SCHEMA = 1;

/**
 * Retorna a data atual no fuso de Brasília (UTC-3) no formato YYYY-MM-DD.
 * A prefeitura de SP rejeita datas "futuras" — o servidor Vercel opera em UTC,
 * então usar toISOString() pode retornar amanhã quando são 21h-23h59 em SP.
 */
function todayBrasilia(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
}

const SOAP_METHODS = {
  emitir: {
    requestElement: 'EnvioLoteRPSRequest',
    soapAction: 'http://www.prefeitura.sp.gov.br/nfe/EnvioLoteRPSRequest',
  },
  testar: {
    requestElement: 'TesteEnvioLoteRPSRequest',
    soapAction: 'http://www.prefeitura.sp.gov.br/nfe/TesteEnvioLoteRPSRequest',
  },
} as const;

const WS_PROD = 'https://nfews.prefeitura.sp.gov.br/lotenfe.asmx';
const WS_HOMO = 'https://nfews.prefeitura.sp.gov.br/lotenfe.asmx';

// ─── Certificate loader ───────────────────────────────────────────────────────

type CertData = { keyPem: string; certPem: string; certB64: string };

async function loadCertificate(): Promise<CertData | null> {
  await loadNodeDeps();
  const base64 = process.env.NFSE_CERT_BASE64;
  const password = process.env.NFSE_CERT_PASSWORD;
  if (!base64 || !password) return null;

  try {
    const pfxDer = forge.util.decode64(base64);
    const pfxAsn1 = forge.asn1.fromDer(pfxDer);
    const p12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password);

    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    if (!keyBag?.key) throw new Error('Private key not found in PFX');

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag?.cert) throw new Error('Certificate not found in PFX');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keyPem = forge.pki.privateKeyToPem(keyBag.key as any);
    const certPem = forge.pki.certificateToPem(certBag.cert);
    const certB64 = certPem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\r?\n/g, '');

    return { keyPem, certPem, certB64 };
  } catch (err) {
    console.error('[NFS-e] Certificate loading failed:', err);
    return null;
  }
}

// ─── XML helpers ──────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function computeRpsAssinatura(params: {
  rpsNumero: number; dataEmissao: string; valorFinalCobrado: number;
  cnpjDigits: string; tipoPessoa: 'CNPJ' | 'CPF'; keyPem: string;
}): string {
  const im = PRESTADOR_IM.padStart(8, '0');
  const serie = SERIE_RPS.padEnd(5, ' ');
  const numero = params.rpsNumero.toString().padStart(12, '0');
  const data = params.dataEmissao.replace(/-/g, '');
  const centavos = Math.round(params.valorFinalCobrado * 100);
  const valor = centavos.toString().padStart(15, '0');
  const codigo = CODIGO_SERVICO.padStart(5, '0');
  const indicador = params.tipoPessoa === 'CPF' ? '1' : '2';
  const documento = params.cnpjDigits.padStart(14, '0');
  const payload = im + serie + numero + data + 'T' + 'N' + 'N' + valor + '000000000000000' + codigo + indicador + documento;

  const sign = crypto.createSign('RSA-SHA1');
  sign.update(payload, 'utf8');
  return sign.sign(params.keyPem, 'base64');
}

function buildRpsXml(params: {
  rpsNumero: number; dataEmissao: string; valorServicos: number;
  cnpjDigits: string; tipoPessoa: 'CNPJ' | 'CPF'; razaoSocial: string;
  email?: string; endereco?: EmitirNFSeInput['endereco'];
  discriminacao: string; keyPem: string;
}): string {
  const valor = params.valorServicos.toFixed(2);
  const docEl = params.tipoPessoa === 'CNPJ'
    ? `<CNPJ>${params.cnpjDigits}</CNPJ>`
    : `<CPF>${params.cnpjDigits}</CPF>`;
  const assinatura = computeRpsAssinatura({
    rpsNumero: params.rpsNumero, dataEmissao: params.dataEmissao,
    valorFinalCobrado: params.valorServicos, cnpjDigits: params.cnpjDigits,
    tipoPessoa: params.tipoPessoa, keyPem: params.keyPem,
  });

  return (
    `<PedidoEnvioLoteRPS xmlns="http://www.prefeitura.sp.gov.br/nfe" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<Cabecalho Versao="${VERSAO_SCHEMA}" xmlns=""><CPFCNPJRemetente><CNPJ>${PRESTADOR_CNPJ}</CNPJ></CPFCNPJRemetente><transacao>true</transacao><dtInicio>${params.dataEmissao}</dtInicio><dtFim>${params.dataEmissao}</dtFim><QtdRPS>1</QtdRPS><ValorTotalServicos>${valor}</ValorTotalServicos><ValorTotalDeducoes>0.00</ValorTotalDeducoes></Cabecalho>` +
    `<RPS xmlns="">` +
    `<Assinatura>${assinatura}</Assinatura>` +
    `<ChaveRPS><InscricaoPrestador>${PRESTADOR_IM}</InscricaoPrestador><SerieRPS>${SERIE_RPS}</SerieRPS><NumeroRPS>${params.rpsNumero}</NumeroRPS></ChaveRPS>` +
    `<TipoRPS>RPS</TipoRPS><DataEmissao>${params.dataEmissao}</DataEmissao><StatusRPS>N</StatusRPS><TributacaoRPS>T</TributacaoRPS>` +
    `<ValorServicos>${valor}</ValorServicos><ValorDeducoes>0.00</ValorDeducoes>` +
    `<ValorPIS>0.00</ValorPIS><ValorCOFINS>0.00</ValorCOFINS><ValorINSS>0.00</ValorINSS><ValorIR>0.00</ValorIR><ValorCSLL>0.00</ValorCSLL>` +
    `<CodigoServico>${CODIGO_SERVICO}</CodigoServico><AliquotaServicos>${ALIQUOTA}</AliquotaServicos><ISSRetido>false</ISSRetido>` +
    `<CPFCNPJTomador>${docEl}</CPFCNPJTomador>` +
    `<RazaoSocialTomador>${esc(params.razaoSocial)}</RazaoSocialTomador>` +
    (params.endereco
      ? `<EnderecoTomador><Logradouro>${esc(params.endereco.logradouro)}</Logradouro><NumeroEndereco>${esc(params.endereco.numero)}</NumeroEndereco>${params.endereco.complemento ? `<ComplementoEndereco>${esc(params.endereco.complemento)}</ComplementoEndereco>` : ''}<Bairro>${esc(params.endereco.bairro)}</Bairro><Cidade>${params.endereco.cidadeIbge}</Cidade><UF>${params.endereco.uf}</UF><CEP>${params.endereco.cep}</CEP></EnderecoTomador>`
      : '') +
    (params.email ? `<EmailTomador>${esc(params.email)}</EmailTomador>` : '') +
    `<Discriminacao>${esc(params.discriminacao)}</Discriminacao>` +
    `</RPS></PedidoEnvioLoteRPS>`
  );
}

async function signXml(xml: string, keyPem: string, certPem: string, certB64: string): Promise<string> {
  await loadNodeDeps();
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- xml-crypto type compat
  } as any);
  sig.addReference({
    xpath: '/*',
    isEmptyUri: true,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
  sig.computeSignature(xml);
  return sig.getSignedXml();
}

function buildSoapEnvelope(signedXml: string, requestElement: string): string {
  const xmlContent = signedXml.replace(/^<\?xml[^?]*\?>\s*/, '');
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
    `<soap12:Body>` +
    `<${requestElement} xmlns="http://www.prefeitura.sp.gov.br/nfe">` +
    `<VersaoSchema>${VERSAO_SCHEMA}</VersaoSchema>` +
    `<MensagemXML><![CDATA[${xmlContent}]]></MensagemXML>` +
    `</${requestElement}>` +
    `</soap12:Body></soap12:Envelope>`
  );
}

function makeMTLSAgent(cert: CertData): https.Agent {
  return new https.Agent({ key: cert.keyPem, cert: cert.certPem, keepAlive: false });
}

function httpsPost(url: string, body: string, agent: https.Agent | null, soapAction: string): Promise<string> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body, 'utf8');
    const options: https.RequestOptions = {
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': `application/soap+xml; charset=utf-8; action="${soapAction}"`,
        'Content-Length': bodyBuf.length,
      },
    };
    if (agent) options.agent = agent;
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.setTimeout(30_000, () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

function decodeRetornoXml(soap: string): string {
  const match = soap.match(/<RetornoXML>([\s\S]*?)<\/RetornoXML>/);
  if (!match) return soap;
  return match[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function parseNfseNumero(xml: string): string | null {
  return decodeRetornoXml(xml).match(/<NumeroNFe>(\d+)<\/NumeroNFe>/)?.[1] ?? null;
}
function parseCodigoVerificacao(xml: string): string | null {
  return decodeRetornoXml(xml).match(/<CodigoVerificacao>([^<]+)<\/CodigoVerificacao>/)?.[1] ?? null;
}
function parseSuccess(xml: string): boolean {
  return /<Sucesso>true<\/Sucesso>/i.test(decodeRetornoXml(xml));
}
function parseError(xml: string): string {
  const inner = decodeRetornoXml(xml);
  const code = inner.match(/<Codigo>([^<]+)<\/Codigo>/)?.[1] ?? '';
  const desc = inner.match(/<Descricao>([^<]+)<\/Descricao>/)?.[1];
  if (desc) return code ? `${code}: ${desc}` : desc;
  const faultString = xml.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/)?.[1];
  const faultCode = xml.match(/<faultcode[^>]*>([^<]+)<\/faultcode>/)?.[1];
  if (faultString) return faultCode ? `${faultCode}: ${faultString}` : faultString;
  const faultReason12 = xml.match(/<(?:\w+:)?Text\b[^>]*>([^<]+)<\/(?:\w+:)?Text>/i)?.[1];
  const faultCode12 = xml.match(/<(?:\w+:)?Value\b[^>]*>([^<]+)<\/(?:\w+:)?Value>/i)?.[1];
  if (faultReason12) return faultCode12 ? `${faultCode12}: ${faultReason12}` : faultReason12;
  return `Resposta inesperada da Prefeitura: ${xml.slice(0, 300)}`;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type EmitirNFSeInput = {
  stripeInvoiceId: string;
  userId: string;
  valorServicos: number;
  cnpjOuCpf: string;
  tipoPessoa: 'CNPJ' | 'CPF';
  razaoSocial: string;
  email?: string;
  endereco?: {
    logradouro: string; numero: string; complemento?: string;
    bairro: string; cidadeIbge: string; uf: string; cep: string;
  };
  plano: string;
  mesReferencia: string;
};

// ─── Public API ───────────────────────────────────────────────────────────────

export async function testNFSeConnection(): Promise<{
  success: boolean; nfseNumero?: string; error?: string; raw?: string;
  debug?: { signedXmlLength: number; hasSignature: boolean; soapAction: string };
}> {
  const cert = await loadCertificate();
  if (!cert) return { success: false, error: 'Certificado não configurado (NFSE_CERT_BASE64 / NFSE_CERT_PASSWORD)' };

  const rpsNumero = Math.floor(Math.random() * 900_000) + 100_000;
  const today = todayBrasilia(); // UTC-3 Brasília

  try {
    const rpsXml = buildRpsXml({
      rpsNumero, dataEmissao: today, valorServicos: 1.0,
      cnpjDigits: '52998224725', tipoPessoa: 'CPF', razaoSocial: 'CLIENTE DE TESTE',
      email: 'suporte@anstech.com.br',
      discriminacao: 'NOTA DE TESTE - HOMOLOGACAO - Performance Dashboard NFS-e. Nao gera obrigacao fiscal.',
      keyPem: cert.keyPem,
    });
    const signedXml = await signXml(rpsXml, cert.keyPem, cert.certPem, cert.certB64);
    const method = SOAP_METHODS.testar;
    const soapBody = buildSoapEnvelope(signedXml, method.requestElement);
    const raw = await httpsPost(WS_HOMO, soapBody, makeMTLSAgent(cert), method.soapAction);
    const nfseNumero = parseNfseNumero(raw);
    const debug = { signedXmlLength: signedXml.length, hasSignature: signedXml.includes('<Signature'), soapAction: method.soapAction };
    if (nfseNumero || parseSuccess(raw)) return { success: true, ...(nfseNumero ? { nfseNumero } : {}), raw, debug };
    return { success: false, error: parseError(raw), raw, debug };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function probeNFSeEndpoints(): Promise<{ homo: string; prod: string }> {
  const probe = async (url: string): Promise<string> => {
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10_000) });
      return `HTTP ${res.status}`;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };
  const [homo, prod] = await Promise.all([probe(WS_HOMO), probe(WS_PROD)]);
  return { homo, prod };
}

export async function emitirNFSe(input: EmitirNFSeInput): Promise<void> {
  if (process.env.NFSE_HOMOLOGACAO === 'true') {
    throw new Error('Emissão automática desabilitada em homologação. Use o teste de conexão NFS-e.');
  }
  const cert = await loadCertificate();
  if (!cert) throw new Error('Certificado NFS-e não configurado');

  const cnpjDigits = input.cnpjOuCpf.replace(/\D/g, '');
  if (!cnpjDigits) throw new Error(`CPF/CNPJ ausente para invoice ${input.stripeInvoiceId}`);

  const inserted = await db.query<{ id: number }>(
    `INSERT INTO nfse_emission (stripe_invoice_id, user_id, status, processing_started_at)
     VALUES ($1, $2, 'pending', NOW())
     ON CONFLICT (stripe_invoice_id) DO NOTHING RETURNING id`,
    [input.stripeInvoiceId, input.userId],
  );
  let emissionId = inserted.rows[0]?.id;
  if (!emissionId) {
    const claimed = await db.query<{ id: number }>(
      `UPDATE nfse_emission
       SET status = 'pending', error_message = NULL, processing_started_at = NOW(), updated_at = NOW()
       WHERE stripe_invoice_id = $1
         AND (status = 'error' OR (status = 'pending' AND processing_started_at < NOW() - interval '2 minutes'))
       RETURNING id`,
      [input.stripeInvoiceId],
    );
    emissionId = claimed.rows[0]?.id;
  }
  // emitted, canceled or another worker currently processing: never issue again.
  if (!emissionId) return;

  try {
    const today = todayBrasilia(); // UTC-3 Brasília — prefeitura SP rejeita datas futuras
    const discriminacao =
      `Licença Performance Dashboard - Plano ${input.plano} - ${input.mesReferencia}. ` +
      `Serviço de acesso a software de análise de performance de testes via internet (SaaS). ` +
      `ANSTECH - QUALITY ASSURANCE LTDA - CNPJ 48.847.227/0001-01.`;

    const rpsXml = buildRpsXml({
      rpsNumero: emissionId, dataEmissao: today,
      valorServicos: input.valorServicos, cnpjDigits,
      tipoPessoa: input.tipoPessoa, razaoSocial: input.razaoSocial,
      email: input.email, endereco: input.endereco,
      discriminacao, keyPem: cert.keyPem,
    });

    const signedXml = await signXml(rpsXml, cert.keyPem, cert.certPem, cert.certB64);
    const method = SOAP_METHODS.emitir;
    const soapBody = buildSoapEnvelope(signedXml, method.requestElement);
    const response = await httpsPost(
      WS_PROD,
      soapBody, makeMTLSAgent(cert), method.soapAction
    );

    const nfseNumero = parseNfseNumero(response);
    if (nfseNumero) {
      const codigoVerificacao = parseCodigoVerificacao(response);
      const verificacaoUrl = 'https://nfe.prefeitura.sp.gov.br/publico/verificacao.aspx';
      await db.query(
        `UPDATE nfse_emission SET status='emitted', nfse_numero=$1, codigo_verificacao=$2, verificacao_url=$3, updated_at=NOW() WHERE id=$4`,
        [nfseNumero, codigoVerificacao, verificacaoUrl, emissionId]
      );
      console.log(`[NFS-e] NFS-e #${nfseNumero} emitida para invoice ${input.stripeInvoiceId}`);
    } else {
      const errorMessage = parseError(response);
      await db.query(`UPDATE nfse_emission SET status='error', error_message=$1, updated_at=NOW() WHERE id=$2`, [errorMessage, emissionId]);
      throw new Error(errorMessage);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.query(`UPDATE nfse_emission SET status='error', error_message=$1, updated_at=NOW() WHERE id=$2`, [errorMessage, emissionId]);
    throw err;
  }
}

export async function getNFSeEmission(stripeInvoiceId: string) {
  const r = await db.query<{
    id: number; status: string; nfse_numero: string | null;
    codigo_verificacao: string | null; verificacao_url: string | null;
    email_sent_at: Date | null; error_message: string | null;
  }>(`SELECT * FROM nfse_emission WHERE stripe_invoice_id = $1 LIMIT 1`, [stripeInvoiceId]);
  return r.rows[0] ?? null;
}

export async function markNFSeEmailSent(id: number, recipient: string): Promise<void> {
  await db.query(
    `UPDATE nfse_emission SET email_sent_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [id]
  );
  console.log(`[NFS-e] Email enviado para ${recipient} (emission id=${id})`);
}

export async function markNFSeEmailError(id: number, recipient: string, error: string): Promise<void> {
  await db.query(
    `UPDATE nfse_emission SET email_error=$1, updated_at=NOW() WHERE id=$2`,
    [error, id]
  );
  console.error(`[NFS-e] Falha ao enviar email para ${recipient}: ${error}`);
}

export async function listRecentNFSeEmissions() {
  const r = await db.query<{
    id: number; stripe_invoice_id: string; user_id: string | null;
    status: string; nfse_numero: string | null; created_at: Date;
    email_sent_at: Date | null; error_message: string | null;
  }>(
    // Excluir registros de controle de e-mail (confirm_email_*) — são artefatos internos
    `SELECT * FROM nfse_emission
     WHERE stripe_invoice_id NOT LIKE 'confirm_email_%'
     ORDER BY id DESC LIMIT 50`
  );
  return r.rows;
}

/**
 * Reconcilia invoices pagas recentes e emite NFS-e para as que ainda não foram processadas.
 * Padrão EstilOS (server/billing.ts → reconcileRecentPaidInvoices).
 */
export async function reconcileRecentNFSeEmissions(): Promise<{
  checked: number; processed: number; skipped: number; failed: number; errors: Array<{ invoiceId: string; error: string }>;
}> {
  const { stripe } = await import('@/lib/stripe');
  const { emitirNFSeForInvoice, emitirNFSeForUpgradeSession, getUserByCustomer } = await import('@/lib/nfse-webhook');

  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ invoiceId: string; error: string }> = [];

  const invoices = await stripe.invoices.list({
    status: 'paid',
    created: { gte: since },
    limit: 25,
  });

  for (const invoice of invoices.data) {
    const raw = invoice as unknown as Record<string, number>;
    if ((raw.amount_paid ?? 0) <= 0) continue;
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    // Invoices de customers sem usuário vinculado (testes/ruído no Stripe) não são nossas.
    if (customerId && !(await getUserByCustomer(customerId))) {
      skipped++;
      continue;
    }
    try {
      const before = await getNFSeEmission(invoice.id);
      if (before?.status === 'canceled') continue;
      await emitirNFSeForInvoice(invoice);
      const after = await getNFSeEmission(invoice.id);
      if (before?.status !== 'emitted' && after?.status === 'emitted') processed++;
    } catch (err) {
      failed++;
      errors.push({ invoiceId: invoice.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Checkouts pagos de upgrade (mode=payment) que ainda não geraram NFS-e.
  // Recovery de notas perdidas por evento fora de ordem no webhook ou falha
  // silenciosa — o pagamento proporcional do upgrade sempre exige nota.
  const sessions = await stripe.checkout.sessions.list({
    created: { gte: since },
    limit: 100,
  });

  for (const session of sessions.data) {
    const meta = (session.metadata ?? {}) as Record<string, string>;
    if (meta.type !== 'upgrade' || session.payment_status !== 'paid') continue;
    const sourceId = `checkout_${session.id}`;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (customerId && !(await getUserByCustomer(customerId))) {
      skipped++;
      continue;
    }
    try {
      const before = await getNFSeEmission(sourceId);
      if (before?.status === 'canceled') continue;
      await emitirNFSeForUpgradeSession(session);
      const after = await getNFSeEmission(sourceId);
      if (before?.status !== 'emitted' && after?.status === 'emitted') processed++;
    } catch (err) {
      failed++;
      errors.push({ invoiceId: sourceId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { checked: invoices.data.length + sessions.data.length, processed, skipped, failed, errors };
}

export async function reconcileNFSePayment(stripeInvoiceId: string): Promise<{ emitted: boolean; message: string }> {
  const existing = await getNFSeEmission(stripeInvoiceId);
  if (existing?.status === 'canceled') {
    throw new Error('A NFS-e deste pagamento foi cancelada e não pode ser emitida novamente.');
  }
  const { stripe } = await import('@/lib/stripe');
  const { emitirNFSeForInvoice, emitirNFSeForUpgradeSession } = await import('@/lib/nfse-webhook');
  if (stripeInvoiceId.startsWith('checkout_')) {
    const session = await stripe.checkout.sessions.retrieve(stripeInvoiceId.slice('checkout_'.length));
    if (session.payment_status !== 'paid') throw new Error('O checkout de upgrade não está pago.');
    await emitirNFSeForUpgradeSession(session);
    const emission = await getNFSeEmission(stripeInvoiceId);
    if (emission?.status !== 'emitted') throw new Error(emission?.error_message || 'A nota fiscal não foi emitida.');
    return {
      emitted: existing?.status !== 'emitted',
      message: existing?.status === 'emitted'
        ? 'Pagamento já estava conciliado. Nenhuma nova nota ou e-mail foi gerado.'
        : 'Pagamento reconciliado e NFS-e emitida com sucesso.',
    };
  }
  const invoice = await stripe.invoices.retrieve(stripeInvoiceId);
  const amountPaid = (invoice as unknown as Record<string, number>).amount_paid ?? 0;
  if (invoice.status !== 'paid' || amountPaid <= 0) throw new Error('A invoice não está paga ou não possui valor faturável.');

  await emitirNFSeForInvoice(invoice);
  const emission = await getNFSeEmission(stripeInvoiceId);
  if (emission?.status !== 'emitted') {
    throw new Error(emission?.error_message || 'A nota fiscal não foi emitida. Verifique os dados fiscais do cliente.');
  }
  return {
    emitted: existing?.status !== 'emitted',
    message: existing?.status === 'emitted'
      ? 'Pagamento já estava conciliado. Nenhuma nova nota ou e-mail foi gerado.'
      : 'Pagamento reconciliado e NFS-e emitida com sucesso.',
  };
}

// ─── Cancelamento de NFS-e ────────────────────────────────────────────────────

const SOAP_CANCEL = {
  requestElement: 'CancelamentoNFeRequest',
  soapAction: 'http://www.prefeitura.sp.gov.br/nfe/ws/cancelamentoNFe',
} as const;

const WS_CANCEL = 'https://nfews.prefeitura.sp.gov.br/lotenfe.asmx';

function buildCancelAssinatura(nfseNumero: string, keyPem: string): string {
  const im = PRESTADOR_IM.padStart(8, '0');
  const numero = nfseNumero.padStart(12, '0');
  const payload = im + numero;
  const sign = crypto.createSign('RSA-SHA1');
  sign.update(payload, 'utf8');
  return sign.sign(keyPem, 'base64');
}

function buildCancelXml(params: {
  nfseNumero: string;
  codigoVerificacao: string;
  keyPem: string;
}): string {
  const assinatura = buildCancelAssinatura(params.nfseNumero, params.keyPem);

  return (
    `<PedidoCancelamentoNFe xmlns="http://www.prefeitura.sp.gov.br/nfe" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<Cabecalho Versao="1" xmlns=""><CPFCNPJRemetente><CNPJ>${PRESTADOR_CNPJ}</CNPJ></CPFCNPJRemetente><transacao>true</transacao></Cabecalho>` +
    `<Detalhe xmlns="">` +
    `<ChaveNFe>` +
    `<InscricaoPrestador>${PRESTADOR_IM}</InscricaoPrestador>` +
    `<NumeroNFe>${params.nfseNumero}</NumeroNFe>` +
    `<CodigoVerificacao>${params.codigoVerificacao}</CodigoVerificacao>` +
    `</ChaveNFe>` +
    `<AssinaturaCancelamento>${assinatura}</AssinaturaCancelamento>` +
    `</Detalhe>` +
    `</PedidoCancelamentoNFe>`
  );
}

export type CancelarNFSeResult = {
  success: boolean;
  error?: string;
  raw?: string;
};

export async function cancelarNFSe(stripeInvoiceId: string): Promise<CancelarNFSeResult> {
  const emission = await getNFSeEmission(stripeInvoiceId);
  if (!emission) {
    return { success: false, error: 'NFS-e não encontrada no banco de dados.' };
  }
  if (emission.status !== 'emitted' || !emission.nfse_numero) {
    return { success: false, error: `NFS-e não está emitida (status: ${emission.status}).` };
  }
  if (!emission.codigo_verificacao) {
    return { success: false, error: 'Código de verificação não encontrado. Cancelamento requer o código.' };
  }

  const claimed = await db.query(
    `UPDATE nfse_emission SET status = 'canceling', updated_at = NOW()
     WHERE stripe_invoice_id = $1 AND status = 'emitted' RETURNING id`,
    [stripeInvoiceId],
  );
  if (claimed.rowCount === 0) return { success: false, error: 'A NFS-e já está sendo cancelada ou mudou de status.' };

  const cert = await loadCertificate();
  if (!cert) {
    await db.query(`UPDATE nfse_emission SET status = 'emitted' WHERE stripe_invoice_id = $1`, [stripeInvoiceId]);
    return { success: false, error: 'Certificado digital não configurado (NFSE_CERT_BASE64 / NFSE_CERT_PASSWORD).' };
  }

  try {
    const cancelXml = buildCancelXml({
      nfseNumero: emission.nfse_numero,
      codigoVerificacao: emission.codigo_verificacao,
      keyPem: cert.keyPem,
    });

    const signedXml = await signXml(cancelXml, cert.keyPem, cert.certPem, cert.certB64);
    const soapBody = buildSoapEnvelope(signedXml, SOAP_CANCEL.requestElement);
    const raw = await httpsPost(
      WS_CANCEL,
      soapBody,
      makeMTLSAgent(cert),
      SOAP_CANCEL.soapAction
    );

    if (parseSuccess(raw)) {
      await db.query(
        `UPDATE nfse_emission SET status = 'canceled', updated_at = NOW() WHERE stripe_invoice_id = $1`,
        [stripeInvoiceId]
      );
      console.log(`[NFS-e] Nota ${emission.nfse_numero} cancelada com sucesso.`);
      return { success: true, raw };
    }

    const errorMsg = parseError(raw);
    await db.query(`UPDATE nfse_emission SET status = 'emitted', error_message = $2 WHERE stripe_invoice_id = $1`, [stripeInvoiceId, errorMsg]);
    console.error(`[NFS-e] Cancelamento falhou: ${errorMsg}`);
    return { success: false, error: errorMsg, raw };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[NFS-e] Cancelamento exception:', err);
    await db.query(`UPDATE nfse_emission SET status = 'emitted', error_message = $2 WHERE stripe_invoice_id = $1`, [stripeInvoiceId, message]);
    return { success: false, error: message };
  }
}
