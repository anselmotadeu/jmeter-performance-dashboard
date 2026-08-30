import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { PLANS, type PlanSlug } from '@/lib/plans';
import { getActiveSubscription } from '@/lib/subscription';
import { db } from '@/lib/db';
import Stripe from 'stripe';

/**
 * POST /api/subscription/downgrade
 *
 * Agenda o downgrade via subscriptionSchedules do Stripe.
 * Salva pendingDowngradePlan e pendingDowngradeDate no banco para exibição na UI.
 * Se o usuário tem cancelamento agendado e passa { reactivate: true },
 * primeiro cancela o agendamento antes de criar o schedule de downgrade.
 *
 * Padrão EstilOS/TestDiff — adaptado para planos Gráfico/Panorama.
 */

const PLAN_NAMES: Record<PlanSlug, string> = { grafico: 'Gráfico', panorama: 'Panorama' };

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

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

    const { planSlug, reactivate } = (await request.json()) as { planSlug: PlanSlug; reactivate?: boolean };
    if (!planSlug || !PLANS[planSlug]) return Response.json({ error: 'Plano inválido.' }, { status: 400 });

    const newPriceId = planSlug === 'grafico'
      ? process.env.STRIPE_PRICE_GRAFICO_ID
      : process.env.STRIPE_PRICE_PANORAMA_ID;

    if (!newPriceId) return Response.json({ error: 'Configuração inválida.' }, { status: 500 });

    const sub = await getActiveSubscription(session.user.id);
    if (!sub?.stripeSubscriptionId) {
      return Response.json({ error: 'Nenhuma assinatura ativa encontrada.' }, { status: 400 });
    }
    if (sub.planSlug === planSlug) {
      return Response.json({ error: `Você já está no plano ${PLAN_NAMES[planSlug]}.` }, { status: 400 });
    }

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const hasCancelScheduled = stripeSub.cancel_at_period_end || stripeSub.cancel_at != null;

    if (hasCancelScheduled) {
      if (!reactivate) {
        return Response.json({ isCanceledScheduled: true, requiresReactivation: true }, { status: 200 });
      }
      const reactivateParams: Stripe.SubscriptionUpdateParams = {};
      if (stripeSub.cancel_at_period_end) reactivateParams.cancel_at_period_end = false;
      if (stripeSub.cancel_at != null) reactivateParams.cancel_at = null;
      await stripe.subscriptions.update(sub.stripeSubscriptionId, reactivateParams);
      const reactivated = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
      if (reactivated.cancel_at_period_end || reactivated.cancel_at != null) {
        return Response.json({ error: 'O Stripe não confirmou a reativação da assinatura.' }, { status: 409 });
      }
      console.log(`[downgrade] Cancelamento agendado removido: ${sub.stripeSubscriptionId}`);
    }

    const currentPriceId = stripeSub.items.data[0]?.price.id;
    if (!currentPriceId) return Response.json({ error: 'Assinatura inválida.' }, { status: 400 });

    const periodEnd = getPeriodEnd(stripeSub);
    const periodStart = getPeriodStart(stripeSub);
    if (!periodEnd) return Response.json({ error: 'Não foi possível obter a data de renovação.' }, { status: 500 });

    const [currentPrice, targetPrice] = await Promise.all([
      stripe.prices.retrieve(currentPriceId),
      stripe.prices.retrieve(newPriceId),
    ]);
    if ((targetPrice.unit_amount ?? 0) >= (currentPrice.unit_amount ?? 0)) {
      return Response.json({ error: 'O plano selecionado não representa um downgrade.' }, { status: 400 });
    }

    // Criar ou reutilizar schedule existente — padrão EstilOS
    let scheduleId = (stripeSub as unknown as Record<string, unknown>).schedule as string | null;
    if (!scheduleId) {
      const schedule = await stripe.subscriptionSchedules.create({
        from_subscription: sub.stripeSubscriptionId,
      });
      scheduleId = schedule.id;
    }

    await (stripe.subscriptionSchedules as unknown as {
      update: (id: string, params: unknown) => Promise<unknown>;
    }).update(scheduleId, {
      end_behavior: 'release',
      phases: [
        {
          start_date: periodStart ?? 'now',
          items: [{ price: currentPriceId, quantity: 1 }],
          end_date: periodEnd,
          proration_behavior: 'none',
          metadata: { userId: session.user.id },
        },
        {
          items: [{ price: newPriceId, quantity: 1 }],
          iterations: 1,
          proration_behavior: 'none',
          metadata: { userId: session.user.id, planSlug },
        },
      ],
    });

    const effectiveDate = new Date(periodEnd * 1000);

    // Salvar downgrade pendente no banco — exibido na UI
    await db.query(
      `UPDATE subscription
       SET pending_downgrade_plan = $1, pending_downgrade_date = $2, updated_at = NOW()
       WHERE stripe_subscription_id = $3`,
      [planSlug, effectiveDate, sub.stripeSubscriptionId]
    );

    console.log(`[downgrade] Agendado ${sub.planSlug} → ${planSlug} para ${effectiveDate.toISOString()}`);

    return Response.json({
      success: true,
      effectiveDate: effectiveDate.toISOString(),
      message: `Downgrade para ${PLAN_NAMES[planSlug]} agendado para ${effectiveDate.toLocaleDateString('pt-BR')}. Você continua com o plano atual até lá.`,
    });
  } catch (error) {
    console.error('[downgrade]', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Erro ao processar downgrade.' },
      { status: 500 },
    );
  }
}
