import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { PLANS, type PlanSlug } from '@/lib/plans';
import { getActiveSubscription } from '@/lib/subscription';

const APP_URL = process.env.BETTER_AUTH_URL ?? 'https://jmeter-performance-dashboard.vercel.app';

/** POST /api/checkout — cria sessão de pagamento no Stripe */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { planSlug } = await request.json() as { planSlug: PlanSlug };
  const plan = PLANS[planSlug];
  if (!plan?.stripePriceId) return Response.json({ error: 'Plano inválido.' }, { status: 400 });

  // Não permitir checkout se já tem plano ativo
  const existing = await getActiveSubscription(session.user.id);
  if (existing && existing.status === 'active') {
    return Response.json({ error: 'Você já possui uma assinatura ativa.' }, { status: 400 });
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    // Pedir CPF/CNPJ para NFS-e (padrão EstilOS)
    custom_fields: [{
      key: 'cpf_cnpj',
      label: { type: 'custom', custom: 'CPF ou CNPJ' },
      type: 'text',
      optional: false,
    }],
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    metadata: { userId: session.user.id, planSlug },
    success_url: `${APP_URL}/minha-conta?checkout=success`,
    cancel_url: `${APP_URL}/pricing`,
    locale: 'pt-BR',
  });

  return Response.json({ url: checkout.url });
}
