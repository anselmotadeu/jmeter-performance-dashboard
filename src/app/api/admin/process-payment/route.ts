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
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const rawSub = sub as unknown as Record<string, unknown>;

    const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer as { id: string }).id;
    const priceId = sub.items.data[0]?.price?.id;
    const periodStart = (rawSub.current_period_start as number) ? new Date((rawSub.current_period_start as number) * 1000) : null;
    const periodEnd = (rawSub.current_period_end as number) ? new Date((rawSub.current_period_end as number) * 1000) : null;

    // 2. Buscar plano pelo slug
    const planRow = await db.query<{ id: string; name: string; slug: string; price_cents: number }>(
      'SELECT id, name, slug, price_cents FROM plan WHERE slug = $1 LIMIT 1',
      [planSlug]
    );
    if (!planRow.rows[0]) return Response.json({ error: `Plano '${planSlug}' não encontrado` }, { status: 400 });
    const plan = planRow.rows[0];

    // 3. UPSERT subscription no banco (índice parcial — não suporta ON CONFLICT direto)
    // Verificar se já existe subscription para este usuário
    const existing = await db.query<{ id: string }>(
      'SELECT id FROM subscription WHERE user_id = $1 LIMIT 1', [userId]
    );

    let result;
    if (existing.rows[0]) {
      // UPDATE da subscription existente
      result = await db.query<{ id: string; status: string }>(
        `UPDATE subscription SET
          plan_id = $1, status = $2, stripe_customer_id = $3, stripe_subscription_id = $4,
          current_period_start = $5, current_period_end = $6, cancel_at_period_end = false,
          updated_at = NOW()
        WHERE user_id = $7 RETURNING id, status`,
        [plan.id, sub.status, customerId, stripeSubscriptionId, periodStart, periodEnd, userId]
      );
    } else {
      // INSERT novo
      result = await db.query<{ id: string; status: string }>(
        `INSERT INTO subscription (
          user_id, plan_id, status, stripe_customer_id, stripe_subscription_id,
          current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW(), NOW())
        RETURNING id, status`,
        [userId, plan.id, sub.status, customerId, stripeSubscriptionId, periodStart, periodEnd]
      );
    }

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
