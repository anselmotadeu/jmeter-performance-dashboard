/**
 * nfse-webhook.ts
 * Integração NFS-e com os eventos do Stripe.
 * Separado do webhook principal para manter o fluxo limpo.
 * Padrão EstilOS (server/billing.ts → emitNFSeForInvoice).
 */

import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { emitirNFSe, getNFSeEmission, markNFSeEmailSent, markNFSeEmailError } from '@/lib/nfse';
import { sendNFSeEmail } from '@/lib/email';
import Stripe from 'stripe';

const FISCAL_DOCUMENT_KEY = 'cpf_cnpj';

/** Extrai CPF/CNPJ do custom_field gravado no Stripe Checkout */
async function syncCheckoutTaxId(customerId: string, stripeInvoiceId: string): Promise<string | null> {
  // Buscar checkout session associada à invoice
  const sessions = await stripe.checkout.sessions.list({
    customer: customerId, status: 'complete', limit: 5,
  });

  for (const session of sessions.data) {
    const field = session.custom_fields?.find((f) => f.key === FISCAL_DOCUMENT_KEY);
    const value = field?.text?.value?.replace(/\D/g, '') ?? '';
    if (value.length === 11 || value.length === 14) return value;
  }

  // Fallback: tax_ids no customer do Stripe
  const taxIds = await stripe.customers.listTaxIds(customerId, { limit: 10 });
  const taxId = taxIds.data.find((t) => t.type === 'br_cpf' || t.type === 'br_cnpj');
  return taxId?.value?.replace(/\D/g, '') ?? null;
}

/** Busca userId no banco pelo stripe_customer_id */
async function getUserByCustomer(customerId: string): Promise<{ userId: string; email: string; name: string } | null> {
  const r = await db.query<{ user_id: string; user_email: string | null }>(
    `SELECT s.user_id,
            u.email as user_email
     FROM subscription s
     JOIN "user" u ON u.id = s.user_id
     WHERE s.stripe_customer_id = $1 LIMIT 1`,
    [customerId]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  // Buscar nome do usuário
  const nameRow = await db.query<{ name: string | null }>(`SELECT name FROM "user" WHERE id = $1 LIMIT 1`, [row.user_id]);
  return {
    userId: row.user_id,
    email: row.user_email ?? '',
    name: nameRow.rows[0]?.name ?? '',
  };
}

/**
 * Emite NFS-e para uma invoice paga.
 * Fire-and-forget — não bloqueia o webhook.
 * Padrão EstilOS (server/billing.ts → emitNFSeForInvoice).
 */
export async function emitirNFSeForInvoice(invoice: Stripe.Invoice): Promise<void> {
  const amountPaid = (invoice as unknown as Record<string, number>).amount_paid ?? 0;
  if (amountPaid === 0) return; // Ignorar invoices gratuitas/trial

  const invoiceId = invoice.id;
  if (!invoiceId) return;

  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  try {
    // Verificar se já foi emitida
    const existingEmission = await getNFSeEmission(invoiceId);
    if (existingEmission?.status === 'emitted') return;

    const user = await getUserByCustomer(customerId);
    if (!user) {
      console.warn(`[NFS-e] Customer ${customerId} sem usuário vinculado — skip`);
      return;
    }

    // Obter CPF/CNPJ do checkout
    const cpfCnpjDigits = await syncCheckoutTaxId(customerId, invoiceId);
    if (!cpfCnpjDigits) {
      console.warn(`[NFS-e] CPF/CNPJ não encontrado para customer ${customerId} invoice ${invoiceId} — skip`);
      return;
    }

    const tipoPessoa = cpfCnpjDigits.length === 11 ? 'CPF' : 'CNPJ';
    const razaoSocial = invoice.customer_name || user.name || user.email || 'Cliente Performance Dashboard';

    // Obter endereço do Stripe (via ViaCEP se houver CEP)
    let endereco: Parameters<typeof emitirNFSe>[0]['endereco'];
    const address = invoice.customer_address;
    if (address?.country === 'BR' && address.postal_code) {
      try {
        const cep = address.postal_code.replace(/\D/g, '');
        const viaCepRes = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (viaCepRes.ok) {
          const viaCep = await viaCepRes.json() as Record<string, string>;
          if (!viaCep.erro && viaCep.ibge && viaCep.logradouro) {
            const numero = address.line1?.match(/[,\s](\d+[A-Za-z-]*)$/)?.[1]
              ?? address.line2?.match(/^\s*(\d+[A-Za-z-]*)/)?.[1]
              ?? 'S/N';
            endereco = {
              logradouro: String(viaCep.logradouro).slice(0, 50),
              numero: numero.slice(0, 10),
              ...(address.line2 ? { complemento: address.line2.slice(0, 30) } : {}),
              bairro: String(viaCep.bairro).slice(0, 30),
              cidadeIbge: viaCep.ibge,
              uf: address.state || viaCep.uf,
              cep,
            };
          }
        }
      } catch { /* endereço é opcional — continua sem */ }
    }

    // Determinar plano a partir da subscription
    const subId = (invoice as unknown as Record<string, unknown>).subscription as string | null;
    let planSlug = 'monitor';
    if (subId) {
      const planRow = await db.query<{ slug: string }>(
        `SELECT p.slug FROM subscription s JOIN plan p ON p.id = s.plan_id
         WHERE s.stripe_subscription_id = $1 LIMIT 1`,
        [subId]
      );
      if (planRow.rows[0]) planSlug = planRow.rows[0].slug;
    }

    const planoNome = planSlug === 'radar' ? 'Radar' : 'Monitor';
    const periodStart = (invoice as unknown as Record<string, number>).period_start
      ? new Date((invoice as unknown as Record<string, number>).period_start * 1000)
      : new Date();
    const mesReferencia = periodStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    await emitirNFSe({
      stripeInvoiceId: invoiceId,
      userId: user.userId,
      valorServicos: amountPaid / 100,
      cnpjOuCpf: cpfCnpjDigits,
      tipoPessoa,
      razaoSocial,
      email: invoice.customer_email || user.email || undefined,
      endereco,
      plano: planoNome,
      mesReferencia,
    });

    // Enviar email com a NFS-e ao usuário (padrão EstilOS billing.ts)
    const emission = await getNFSeEmission(invoiceId);
    if (emission?.nfse_numero && !emission.email_sent_at) {
      const recipient = invoice.customer_email || user.email;
      if (recipient) {
        try {
          await sendNFSeEmail({
            to: recipient,
            userName: user.name || user.email,
            nfseNumero: emission.nfse_numero,
            codigoVerificacao: emission.codigo_verificacao,
            verificacaoUrl: emission.verificacao_url || 'https://nfe.prefeitura.sp.gov.br/publico/verificacao.aspx',
            valorServicos: amountPaid / 100,
            planName: planoNome,
            mesReferencia,
          });
          await markNFSeEmailSent(emission.id, recipient);
        } catch (emailErr) {
          const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
          await markNFSeEmailError(emission.id, recipient, msg);
          console.error(`[NFS-e] Falha ao enviar email para ${recipient}: ${msg}`);
        }
      }
    }
    console.log(`[NFS-e] Emissão concluída para invoice ${invoiceId}`);
  } catch (err) {
    console.error(`[NFS-e] Falha para invoice ${invoiceId}:`, err);
    // Não re-throw — NFS-e não deve bloquear o webhook
  }
}
