/**
 * nfse-webhook.ts — Performance Dashboard
 * Integração NFS-e com os eventos do Stripe.
 * Espelho fiel do TestDiff (src/lib/nfse-webhook.ts).
 * Adaptado: planos grafico/panorama.
 */

import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { emitirNFSe, getNFSeEmission, markNFSeEmailSent, markNFSeEmailError } from '@/lib/nfse';
import { sendNFSeEmail } from '@/lib/email';
import Stripe from 'stripe';
import { isValidFiscalDocument } from '@/lib/fiscal-document';

const FISCAL_DOCUMENT_KEY = 'cpf_cnpj';

/** Extrai subscription_id da invoice — compatível com Stripe SDK v14+ */
export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const raw = invoice as unknown as {
    subscription?: string | { id?: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
  };
  const subscription = raw.parent?.subscription_details?.subscription ?? raw.subscription;
  if (typeof subscription === 'string') return subscription;
  return subscription?.id ?? null;
}

/** Extrai CPF/CNPJ do custom_field do checkout ou dos tax_ids do customer */
async function syncCheckoutTaxId(customerId: string): Promise<string | null> {
  const sessions = await stripe.checkout.sessions.list({
    customer: customerId, status: 'complete', limit: 5,
  });
  for (const session of sessions.data) {
    const field = session.custom_fields?.find((f) => f.key === FISCAL_DOCUMENT_KEY);
    const value = field?.text?.value?.replace(/\D/g, '') ?? '';
    if (isValidFiscalDocument(value)) return value;
  }
  const taxIds = await stripe.customers.listTaxIds(customerId, { limit: 10 });
  const taxId = taxIds.data.find((t) => t.type === 'br_cpf' || t.type === 'br_cnpj');
  const value = taxId?.value?.replace(/\D/g, '') ?? '';
  return isValidFiscalDocument(value) ? value : null;
}

function checkoutTaxId(session: Stripe.Checkout.Session): string | null {
  const field = session.custom_fields?.find((item) => item.key === FISCAL_DOCUMENT_KEY);
  const value = field?.text?.value?.replace(/\D/g, '') ?? '';
  return isValidFiscalDocument(value) ? value : null;
}

/** Busca userId + email + nome pelo stripe_customer_id */
export async function getUserByCustomer(customerId: string): Promise<{ userId: string; email: string; name: string } | null> {
  const r = await db.query<{ user_id: string; user_email: string | null }>(
    `SELECT s.user_id, u.email as user_email
     FROM subscription s
     JOIN "user" u ON u.id = s.user_id
     WHERE s.stripe_customer_id = $1 LIMIT 1`,
    [customerId]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  const nameRow = await db.query<{ name: string | null }>(`SELECT name FROM "user" WHERE id = $1 LIMIT 1`, [row.user_id]);
  return {
    userId: row.user_id,
    email: row.user_email ?? '',
    name: nameRow.rows[0]?.name ?? '',
  };
}

/** Converte endereço Stripe → formato da prefeitura SP via ViaCEP */
async function buildAddress(address: Stripe.Address | null | undefined): Promise<Parameters<typeof emitirNFSe>[0]['endereco']> {
  if (address?.country !== 'BR' || !address.postal_code) return undefined;
  try {
    const cep = address.postal_code.replace(/\D/g, '');
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return undefined;
    const viaCep = await response.json() as Record<string, string>;
    if (viaCep.erro || !viaCep.ibge || !viaCep.logradouro) return undefined;
    const numero = address.line1?.match(/[,\s](\d+[A-Za-z-]*)$/)?.[1]
      ?? address.line2?.match(/^\s*(\d+[A-Za-z-]*)/)?.[1]
      ?? 'S/N';
    return {
      logradouro: String(viaCep.logradouro).slice(0, 50),
      numero: numero.slice(0, 10),
      ...(address.line2 ? { complemento: address.line2.slice(0, 30) } : {}),
      bairro: String(viaCep.bairro).slice(0, 30),
      cidadeIbge: viaCep.ibge,
      uf: address.state || viaCep.uf,
      cep,
    };
  } catch {
    return undefined;
  }
}

/**
 * Garante emissão e envio de e-mail da NFS-e (idempotente).
 * Evita emissão dupla via getNFSeEmission + status check.
 */
async function ensureIssuedAndEmailed(params: {
  sourceId: string;
  user: { userId: string; email: string; name: string };
  amountCents: number;
  cpfCnpj: string;
  customerName?: string | null;
  customerEmail?: string | null;
  address?: Stripe.Address | null;
  planSlug: string;
  mesReferencia: string;
}) {
  const tipoPessoa = params.cpfCnpj.length === 11 ? 'CPF' : 'CNPJ';
  const planoNome = params.planSlug === 'panorama' ? 'Panorama' : 'Gráfico';

  // Verificar se já foi emitida (idempotência)
  const existing = await getNFSeEmission(params.sourceId);
  if (existing?.status === 'canceled') return;
  if (existing?.status !== 'emitted') {
    await emitirNFSe({
      stripeInvoiceId: params.sourceId,
      userId: params.user.userId,
      valorServicos: params.amountCents / 100,
      cnpjOuCpf: params.cpfCnpj,
      tipoPessoa,
      razaoSocial: params.customerName || params.user.name || params.user.email || 'Cliente Performance Dashboard',
      email: params.customerEmail || params.user.email || undefined,
      endereco: await buildAddress(params.address),
      plano: planoNome,
      mesReferencia: params.mesReferencia,
    });
  }

  // Enviar e-mail se NFS-e emitida e e-mail ainda não enviado
  const emission = await getNFSeEmission(params.sourceId);
  if (emission?.status !== 'emitted' || !emission.nfse_numero || emission.email_sent_at) return;
  const recipient = params.customerEmail || params.user.email;
  if (!recipient) return;

  const deliveryKey = `nfse_${params.sourceId}`;
  const claimed = await db.query(
    `INSERT INTO email_delivery (delivery_key, recipient, email_type)
     VALUES ($1, $2, 'nfse')
     ON CONFLICT (delivery_key) DO UPDATE
       SET status = 'processing', processing_started_at = NOW()
     WHERE email_delivery.status = 'processing'
       AND email_delivery.processing_started_at < NOW() - interval '10 minutes'
     RETURNING delivery_key`,
    [deliveryKey, recipient],
  );
  if (claimed.rowCount === 0) return;
  try {
    await sendNFSeEmail({
      to: recipient,
      userName: params.user.name || params.user.email,
      nfseNumero: emission.nfse_numero,
      codigoVerificacao: emission.codigo_verificacao,
      verificacaoUrl: emission.verificacao_url || 'https://nfe.prefeitura.sp.gov.br/publico/verificacao.aspx',
      valorServicos: params.amountCents / 100,
      planName: planoNome,
      mesReferencia: params.mesReferencia,
    });
    await markNFSeEmailSent(emission.id, recipient);
    await db.query(`UPDATE email_delivery SET status = 'sent', sent_at = NOW() WHERE delivery_key = $1`, [deliveryKey]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markNFSeEmailError(emission.id, recipient, message);
    await db.query(
      `UPDATE email_delivery SET processing_started_at = NOW() - interval '11 minutes' WHERE delivery_key = $1`,
      [deliveryKey],
    );
    throw error;
  }
}

/**
 * Emite NFS-e para uma invoice paga (assinatura nova ou renovação).
 * Idempotente: não emite se já existe registro 'emitted' para este invoiceId.
 */
export async function emitirNFSeForInvoice(invoice: Stripe.Invoice): Promise<void> {
  const amountPaid = (invoice as unknown as Record<string, number>).amount_paid ?? 0;
  if (amountPaid === 0) return; // Ignorar invoices gratuitas/trial

  const invoiceId = invoice.id;
  if (!invoiceId) return;

  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  try {
    const user = await getUserByCustomer(customerId);
    if (!user) {
      throw new Error(`Customer ${customerId} sem usuário vinculado.`);
    }

    const cpfCnpjDigits = await syncCheckoutTaxId(customerId);
    if (!cpfCnpjDigits) {
      throw new Error(`CPF/CNPJ válido não encontrado para customer ${customerId} invoice ${invoiceId}.`);
    }

    // Determinar plano a partir da subscription
    const subId = getInvoiceSubscriptionId(invoice);
    let planSlug = invoice.metadata?.planSlug || 'grafico';
    if (subId) {
      const planRow = await db.query<{ slug: string }>(
        `SELECT p.slug FROM subscription s JOIN plan p ON p.id = s.plan_id
         WHERE s.stripe_subscription_id = $1 LIMIT 1`,
        [subId]
      );
      if (planRow.rows[0]) planSlug = planRow.rows[0].slug;
    }

    const periodStart = (invoice as unknown as Record<string, number>).period_start
      ? new Date((invoice as unknown as Record<string, number>).period_start * 1000)
      : new Date();
    const mesReferencia = periodStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    await ensureIssuedAndEmailed({
      sourceId: invoiceId,
      user,
      amountCents: amountPaid,
      cpfCnpj: cpfCnpjDigits,
      customerName: invoice.customer_name,
      customerEmail: invoice.customer_email,
      address: invoice.customer_address,
      planSlug,
      mesReferencia,
    });
    console.log(`[NFS-e] Emissão concluída para invoice ${invoiceId}`);
  } catch (err) {
    console.error(`[NFS-e] Falha para invoice ${invoiceId}:`, err);
    throw err;
  }
}

/** Emite NFS-e para o pagamento proporcional de upgrade (Checkout mode=payment). */
export async function emitirNFSeForUpgradeSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== 'paid' || !session.id || !session.amount_total) return;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!customerId) return;

  const user = await getUserByCustomer(customerId);
  if (!user) throw new Error(`Customer ${customerId} sem usuário vinculado.`);
  const cpfCnpj = checkoutTaxId(session) ?? await syncCheckoutTaxId(customerId);
  if (!cpfCnpj) throw new Error(`CPF/CNPJ não encontrado para checkout ${session.id}.`);

  const planSlug = session.metadata?.planSlug || 'panorama';
  const mesReferencia = `upgrade proporcional - ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
  await ensureIssuedAndEmailed({
    sourceId: `checkout_${session.id}`,
    user,
    amountCents: session.amount_total,
    cpfCnpj,
    customerName: session.customer_details?.name,
    customerEmail: session.customer_details?.email,
    address: session.customer_details?.address,
    planSlug,
    mesReferencia,
  });
  console.log(`[NFS-e] Emissão concluída para upgrade checkout ${session.id}`);
}
