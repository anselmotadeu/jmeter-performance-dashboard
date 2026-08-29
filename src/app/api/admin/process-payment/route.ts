import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { sendSubscriptionConfirmationEmail } from '@/lib/email';

/**
 * POST /api/admin/process-payment — processa manualmente um pagamento Stripe já completado.
 * Protegido por token de bootstrap. TEMPORÁRIO — remover após processamento.
 *
 * Body: { token, stripeSubscriptionId, userId, planSlug }
 */
export async function POST(request: Request) {
  let body: { token?: string; stripeSubscriptionId?: string; userId?: string; planSlug?: string } = {};
  try { body = await request.json(); } catch { return Response.json({ error: 'bad payload' }, { status: 400 }); }

  if (body.token !== 'anstech-bootstrap-2026') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { stripeSubscriptionId, userId, planSlug } = body;
  if (!stripeSubscriptionId || !userId || !planSlug) {
    return Response.json({ error: 'stripeSubscriptionId, userId, planSlug obrigatórios' }, { status: 400 });
  }

  try {
    // 1. Buscar dados completos da subscription no Stripe
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ['customer', 'items.data.price'],
    });

    const customer = sub.customer as { id: string; email?: string | null };
    const customerId = typeof customer === 'string' ? customer : customer.id;
    const priceId = sub.items.data[0]?.price?.id;
    const periodStart = sub.current_period_start ? new Date(sub.current_period_start * 1000) : null;
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

    // 2. Buscar plano pelo slug
    const planRow = await db.query<{ id: string; name: string; slug: string; price_cents: number }>(
      'SELECT id, name, slug, price_cents FROM plan WHERE slug = $1 LIMIT 1',
      [planSlug]
    );
    if (!planRow.rows[0]) return Response.json({ error: `Plano '${planSlug}' não encontrado` }, { status: 400 });
    const plan = planRow.rows[0];

    // 3. UPSERT subscription no banco
    const result = await db.query<{ id: string; status: string }>(
      `INSERT INTO subscription (
        user_id, plan_id, status, stripe_customer_id, stripe_subscription_id,
        current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = false,
        updated_at = NOW()
      RETURNING id, status`,
      [userId, plan.id, sub.status, customerId, stripeSubscriptionId, periodStart, periodEnd]
    );

    // 4. Buscar dados do usuário para o email
    const userRow = await db.query<{ email: string; name: string }>(
      'SELECT email, name FROM "user" WHERE id = $1',
      [userId]
    );
    const user = userRow.rows[0];

    // 5. Enviar email de confirmação
    if (user) {
      const renewalDate = periodEnd
        ? periodEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
        : 'não disponível';
      const priceBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.price_cents / 100);
      const APP_URL = process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app';

      await sendSubscriptionConfirmationEmail({
        to: user.email,
        userName: user.name,
        planName: plan.name,
        planSlug: plan.slug as 'grafico' | 'panorama',
        priceBRL,
        renewalDate,
        appUrl: APP_URL,
      });
    }

    return Response.json({
      success: true,
      subscription: result.rows[0],
      plan: { name: plan.name, slug: plan.slug },
      stripe: { subscriptionId: stripeSubscriptionId, customerId, priceId, status: sub.status },
      email_sent: !!user,
      user: user ? { email: user.email } : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[process-payment]', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
