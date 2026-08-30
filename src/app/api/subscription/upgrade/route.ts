import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { PLANS, type PlanSlug } from '@/lib/plans';
import { getActiveSubscription } from '@/lib/subscription';
import { db } from '@/lib/db';

const PLAN_NAMES: Record<PlanSlug, string> = { grafico: 'Gráfico', panorama: 'Panorama' };

const FISCAL_DOCUMENT_FIELD = {
  key: 'cpf_cnpj',
  label: { type: 'custom' as const, custom: 'CPF ou CNPJ para emissão da nota fiscal' },
  type: 'text' as const,
  optional: false,
  text: { minimum_length: 11, maximum_length: 18 },
};

function getPeriodEnd(sub: unknown): number | null {
  const s = sub as Record<string, unknown>;
  const items = (s?.items as Record<string, unknown>)?.data;
  if (Array.isArray(items) && items[0]) {
    const i = items[0] as Record<string, unknown>;
    if (typeof i.current_period_end === 'number') return i.current_period_end;
  }
  if (typeof s?.current_period_end === 'number') return s.current_period_end;
  return null;
}

function getPeriodStart(sub: unknown): number | null {
  const s = sub as Record<string, unknown>;
  const items = (s?.items as Record<string, unknown>)?.data;
  if (Array.isArray(items) && items[0]) {
    const i = items[0] as Record<string, unknown>;
    if (typeof i.current_period_start === 'number') return i.current_period_start;
  }
  if (typeof s?.current_period_start === 'number') return s.current_period_start;
  return null;
}

/**
 * POST /api/subscription/upgrade
 *
 * Cria Checkout Session de pagamento único (mode=payment) com valor proporcional.
 * Se o usuário tem cancelamento agendado e passa { reactivate: true }, primeiro
 * cancela o agendamento (cancel_at_period_end=false) e depois prossegue.
 *
 * Padrão TestDiff.
 */
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

    const { planSlug, reactivate } = (await request.json()) as { planSlug: PlanSlug; reactivate?: boolean };

    if (!planSlug || !PLANS[planSlug]) {
      return Response.json({ error: 'Plano inválido.' }, { status: 400 });
    }

    const newPriceId = PLANS[planSlug].stripePriceId;
    if (!newPriceId) {
      return Response.json({ error: 'Configuração inválida.' }, { status: 500 });
    }

    const sub = await getActiveSubscription(session.user.id);
    if (!sub?.stripeSubscriptionId || !sub.stripeCustomerId) {
      return Response.json({ error: 'Nenhuma assinatura ativa encontrada.' }, { status: 400 });
    }

    if (sub.status !== 'active') {
      return Response.json({ error: `Assinatura no estado "${sub.status}". Acesse /pricing para assinar.` }, { status: 400 });
    }

    if (sub.planSlug === planSlug) {
      return Response.json({ error: `Você já está no plano ${PLAN_NAMES[planSlug]}.` }, { status: 400 });
    }

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const itemId = stripeSub.items.data[0]?.id;
    const currentPriceId = stripeSub.items.data[0]?.price.id;
    if (!itemId || !currentPriceId) {
      return Response.json({ error: 'Assinatura inválida.' }, { status: 400 });
    }

    const hasCancelScheduled = stripeSub.cancel_at_period_end || stripeSub.cancel_at != null;

    if (hasCancelScheduled) {
      if (!reactivate) {
        return Response.json({ isCanceledScheduled: true, requiresReactivation: true }, { status: 200 });
      }
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: false,
        cancel_at: '',
      });
      const reactivated = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
      if (reactivated.cancel_at_period_end || reactivated.cancel_at != null) {
        return Response.json({ error: 'O Stripe não confirmou a reativação da assinatura.' }, { status: 409 });
      }
      console.log(`[upgrade] Cancelamento agendado removido para ${sub.stripeSubscriptionId}`);
    }

    const scheduleId = (stripeSub as unknown as Record<string, unknown>).schedule;
    if (scheduleId && typeof scheduleId === 'string') {
      await stripe.subscriptionSchedules.release(scheduleId);
      await db.query(
        `UPDATE subscription SET pending_downgrade_plan = NULL, pending_downgrade_date = NULL, updated_at = NOW()
          WHERE stripe_subscription_id = $1`,
        [sub.stripeSubscriptionId],
      );
    }

    const baseUrl = process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app';

    const nowSec = Math.floor(Date.now() / 1000);
    const periodEnd = getPeriodEnd(stripeSub);
    const periodStart = getPeriodStart(stripeSub);

    if (!periodEnd) {
      return Response.json({ error: 'Não foi possível obter a data de renovação. Tente novamente.' }, { status: 500 });
    }

    const [currentPrice, newPrice] = await Promise.all([
      stripe.prices.retrieve(currentPriceId),
      stripe.prices.retrieve(newPriceId),
    ]);

    const currentUnits = currentPrice.unit_amount ?? 0;
    const newUnits = newPrice.unit_amount ?? 0;
    if (newUnits <= currentUnits) {
      return Response.json({ error: 'O plano selecionado não representa um upgrade.' }, { status: 400 });
    }

    let amountDue = 0;
    if (newUnits > currentUnits && periodEnd > nowSec) {
      const remainingSec = periodEnd - nowSec;
      const totalSec = periodStart ? (periodEnd - periodStart) : 30 * 24 * 60 * 60;
      amountDue = Math.round((newUnits - currentUnits) * (remainingSec / totalSec));
    }

    const FOUR_HOURS = 4 * 60 * 60;
    if (amountDue <= 0 || (periodEnd - nowSec) <= FOUR_HOURS) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: 'none',
        metadata: { userId: session.user.id, planSlug },
      });
      console.log(`[upgrade] Direto (valor irrisório ou renovação iminente): ${sub.stripeSubscriptionId}`);
      return Response.json({ success: true, url: null });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: sub.stripeCustomerId,
      mode: 'payment',
      payment_method_types: ['card'],
      billing_address_collection: 'required',
      customer_update: { name: 'auto', address: 'auto' },
      custom_fields: [FISCAL_DOCUMENT_FIELD],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Upgrade para o plano ${PLAN_NAMES[planSlug]}`,
            description: 'Valor proporcional pelos dias restantes no ciclo atual.',
          },
          unit_amount: amountDue,
        },
        quantity: 1,
      }],
      metadata: {
        type: 'upgrade',
        userId: session.user.id,
        planSlug,
        subscriptionId: sub.stripeSubscriptionId,
        newPriceId,
        itemId,
      },
      success_url: `${baseUrl}/minha-conta?upgrade=success`,
      cancel_url: `${baseUrl}/minha-conta?upgrade=canceled`,
    });

    return Response.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('[upgrade]', error);
    return Response.json({ error: 'Erro ao processar upgrade.' }, { status: 500 });
  }
}
