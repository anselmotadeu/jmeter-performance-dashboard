import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { PLANS, type PlanSlug } from '@/lib/plans';
import { getActiveSubscription } from '@/lib/subscription';

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

    const { planSlug } = await request.json() as { planSlug?: PlanSlug };
    const target = planSlug ? PLANS[planSlug] : null;
    if (!target?.stripePriceId) return Response.json({ error: 'Plano inválido ou não configurado.' }, { status: 400 });

    const subscription = await getActiveSubscription(session.user.id);
    if (!subscription?.stripeSubscriptionId || !subscription.stripeCustomerId || subscription.status !== 'active') {
      return Response.json({ error: 'Nenhuma assinatura ativa encontrada.' }, { status: 400 });
    }

    const current = PLANS[subscription.planSlug as PlanSlug];
    if (!current || target.priceCents <= current.priceCents) {
      return Response.json({ error: 'O plano selecionado não representa um upgrade.' }, { status: 400 });
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
    if (stripeSubscription.cancel_at_period_end || stripeSubscription.cancel_at) {
      return Response.json({ error: 'Reative a assinatura no portal do Stripe antes de solicitar o upgrade.' }, { status: 409 });
    }
    const item = stripeSubscription.items.data[0];
    if (!item) return Response.json({ error: 'Assinatura Stripe inválida.' }, { status: 409 });

    const appUrl = process.env.BETTER_AUTH_URL ?? 'https://jmeter-performance-dashboard.vercel.app';
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/minha-conta`,
      flow_data: {
        type: 'subscription_update_confirm',
        subscription_update_confirm: {
          subscription: subscription.stripeSubscriptionId,
          items: [{ id: item.id, price: target.stripePriceId, quantity: 1 }],
        },
        after_completion: {
          type: 'redirect',
          redirect: { return_url: `${appUrl}/minha-conta?upgrade=success` },
        },
      },
    });

    return Response.json({ url: portalSession.url });
  } catch (error) {
    console.error('[upgrade]', error);
    return Response.json({ error: 'Não foi possível abrir o upgrade no Stripe.' }, { status: 500 });
  }
}
