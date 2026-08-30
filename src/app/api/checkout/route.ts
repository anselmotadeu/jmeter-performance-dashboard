import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { PLANS, type PlanSlug } from '@/lib/plans';
import { getActiveSubscription, getRecoverableStripeSubscription, getStripeCustomerId } from '@/lib/subscription';

const APP_URL = process.env.BETTER_AUTH_URL ?? 'https://jmeter-performance-dashboard.vercel.app';

/** POST /api/checkout — cria sessão de pagamento no Stripe */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let planSlug: PlanSlug;
  try {
    const body = await request.json() as { planSlug: PlanSlug };
    planSlug = body.planSlug;
  } catch {
    return Response.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const plan = PLANS[planSlug];
  if (!plan) {
    return Response.json({ error: 'Plano não encontrado.' }, { status: 400 });
  }
  if (!plan.stripePriceId) {
    console.error(`[checkout] Price ID não configurado para plano: ${planSlug}`);
    return Response.json(
      { error: 'Configuração de pagamento incompleta. Contate o suporte: suporte@anstech.com.br' },
      { status: 500 }
    );
  }

  // Não permitir checkout se já tem plano ativo
  const existing = await getActiveSubscription(session.user.id);
  if (existing && existing.status === 'active') {
    return Response.json({ error: 'Você já possui uma assinatura ativa.' }, { status: 400 });
  }
  const recoverable = await getRecoverableStripeSubscription(session.user.id);
  if (recoverable?.stripeCustomerId) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: recoverable.stripeCustomerId,
      return_url: `${APP_URL}/minha-conta`,
    });
    return Response.json({ url: portal.url, portal: true });
  }

  try {
    // Buscar Stripe Customer ID existente (se o usuário já fez checkout antes)
    const existingCustomerId = await getStripeCustomerId(session.user.id);

    // Parâmetros base do checkout
    const checkoutParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      mode: 'subscription',
      payment_method_types: ['card'],
      billing_address_collection: 'required',
      // Pedir CPF/CNPJ para NFS-e (padrão EstilOS)
      custom_fields: [{
        key: 'cpf_cnpj',
        label: { type: 'custom', custom: 'CPF ou CNPJ' },
        type: 'text',
        optional: false,
        text: { minimum_length: 11, maximum_length: 18 },
      }],
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      metadata: { userId: session.user.id, planSlug },
      subscription_data: { metadata: { userId: session.user.id, planSlug } },
      success_url: `${APP_URL}/minha-conta?checkout=success`,
      cancel_url: `${APP_URL}/pricing`,
      locale: 'pt-BR',
    };

    // customer_update só é válido quando existe um customer — evita o erro do Stripe
    if (existingCustomerId) {
      checkoutParams.customer = existingCustomerId;
      checkoutParams.customer_update = { address: 'auto', name: 'auto' };
    } else {
      // Pré-preencher email para facilitar o checkout
      checkoutParams.customer_email = session.user.email;
    }

    const checkout = await stripe.checkout.sessions.create(checkoutParams, {
      idempotencyKey: `subscription_checkout:${session.user.id}:${planSlug}:${Math.floor(Date.now() / 900_000)}`,
    });
    return Response.json({ url: checkout.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[checkout] Stripe error:', message);
    return Response.json(
      { error: 'Erro ao criar sessão de pagamento. Tente novamente ou contate suporte@anstech.com.br' },
      { status: 500 }
    );
  }
}
