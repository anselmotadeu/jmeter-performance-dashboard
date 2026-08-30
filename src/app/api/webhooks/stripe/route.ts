import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { clearSubscriptionCache, getPlanByStripePrice } from '@/lib/subscription';
import Stripe from 'stripe';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckout(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':              // alias — processar igual a payment_succeeded
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }
  } catch (err) {
    console.error(`[webhook] Handler error for ${event.type}:`, err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveUserId(customerId: string, meta: Record<string, string>): Promise<string | null> {
  if (meta.userId) return meta.userId;
  try {
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    if (customer.deleted) return null;
    if (customer.metadata?.userId) return customer.metadata.userId;
    if (customer.email) {
      const r = await db.query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1 LIMIT 1`, [customer.email]);
      return r.rows[0]?.id ?? null;
    }
  } catch { }
  return null;
}

function getPeriodEnd(sub: Stripe.Subscription): number | null {
  const raw = sub as unknown as Record<string, unknown>;
  return typeof raw.current_period_end === 'number' ? raw.current_period_end : null;
}

function getCancelAt(sub: Stripe.Subscription): Date | null {
  const raw = sub as unknown as Record<string, unknown>;
  const ts = raw.cancel_at;
  return typeof ts === 'number' && ts > 0 ? new Date(ts * 1000) : null;
}

async function clearTrial(userId: string) {
  try {
    await db.query(`DELETE FROM subscription WHERE user_id = $1 AND status = 'trialing'`, [userId]);
  } catch (err) {
    console.error('[webhook] clearTrial error:', err);
  }
}

async function upsertSubscription(params: {
  userId: string; planId: string; stripeCustomerId: string;
  stripeSubscriptionId: string; status: string; periodEnd: number | null;
  cancelAtPeriodEnd: boolean; cancelAt: Date | null;
}) {
  const periodEndDate = params.periodEnd ? new Date(params.periodEnd * 1000) : null;
  await db.query(`
    INSERT INTO subscription
      (user_id, plan_id, stripe_customer_id, stripe_subscription_id, status,
       current_period_start, current_period_end, cancel_at_period_end, cancel_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, NOW())
    ON CONFLICT (user_id) WHERE status IN ('active','trialing','past_due')
    DO UPDATE SET
      plan_id = excluded.plan_id,
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      cancel_at = excluded.cancel_at,
      updated_at = NOW()
  `, [params.userId, params.planId, params.stripeCustomerId, params.stripeSubscriptionId,
      params.status, periodEndDate, params.cancelAtPeriodEnd, params.cancelAt]);
  await clearSubscriptionCache(params.userId);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCheckout(session: Stripe.Checkout.Session) {
  const meta = (session.metadata ?? {}) as Record<string, string>;

  // ── Upgrade pro-rata (mode=payment) ──────────────────────────────────────
  if (session.mode === 'payment' && meta.type === 'upgrade') {
    const { userId, planSlug, subscriptionId, newPriceId, itemId } = meta;
    if (!userId || !planSlug || !subscriptionId || !newPriceId || !itemId) {
      console.warn('[webhook] upgrade: metadados incompletos', meta);
      return;
    }

    // Atualizar assinatura no Stripe
    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'none',
      metadata: { userId, planSlug },
    });

    // Atualizar banco
    const planResult = await db.query<{ id: string; name: string; price_cents: number }>(
      `SELECT id, name, price_cents FROM plan WHERE slug = $1`, [planSlug]
    );
    if (planResult.rows[0]) {
      await db.query(
        `UPDATE subscription SET plan_id = $1, updated_at = NOW() WHERE stripe_subscription_id = $2`,
        [planResult.rows[0].id, subscriptionId]
      );
      // E-mail de confirmação de upgrade
      sendConfirmationEmail(userId, planResult.rows[0].name, planResult.rows[0].price_cents, null)
        .catch(err => console.error('[webhook] email upgrade falhou:', err));
    }

    // NFS-e para o pagamento do upgrade (fire-and-forget)
    import('@/lib/nfse-webhook').then(async ({ emitirNFSeForInvoice }) => {
      // Buscar a invoice gerada pelo payment_intent desta session
      const paymentIntentId = session.payment_intent as string;
      if (!paymentIntentId) return;
      const charges = await stripe.charges.list({ payment_intent: paymentIntentId, limit: 1 });
      const invoiceId = charges.data[0]?.invoice;
      if (!invoiceId || typeof invoiceId !== 'string') return;
      const invoice = await stripe.invoices.retrieve(invoiceId);
      await emitirNFSeForInvoice(invoice);
    }).catch(err => console.error('[webhook] NFS-e upgrade falhou:', err));

    console.log(`[webhook] upgrade: userId=${userId} plan=${planSlug} sub=${subscriptionId}`);
    return;
  }

  // ── Checkout de nova assinatura (mode=subscription) ───────────────────────
  if (session.mode !== 'subscription') return;

  const customerId = session.customer as string;
  const meta = (session.metadata ?? {}) as Record<string, string>;
  const userId = meta.userId ?? await resolveUserId(customerId, meta);
  if (!userId) { console.warn('[webhook] checkout: userId não encontrado'); return; }

  const sub = await stripe.subscriptions.retrieve(session.subscription as string);
  const priceId = sub.items.data[0]?.price.id;
  const plan = getPlanByStripePrice(priceId ?? '');
  if (!plan) { console.warn(`[webhook] checkout: plano não encontrado para price ${priceId}`); return; }

  const planResult = await db.query<{ id: string }>(`SELECT id FROM plan WHERE slug = $1`, [plan.slug]);
  if (!planResult.rows[0]) return;

  await clearTrial(userId);
  await upsertSubscription({
    userId, planId: planResult.rows[0].id, stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id, status: sub.status,
    periodEnd: getPeriodEnd(sub), cancelAtPeriodEnd: sub.cancel_at_period_end,
    cancelAt: getCancelAt(sub),
  });

  // Email de confirmação (fire-and-forget)
  sendConfirmationEmail(userId, plan.name, plan.priceCents, getPeriodEnd(sub))
    .catch(err => console.error('[webhook] Email confirmação falhou:', err));

  console.log(`[webhook] checkout: userId=${userId} plan=${plan.slug} sub=${sub.id}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const meta = (subscription.metadata ?? {}) as Record<string, string>;
  const userId = await resolveUserId(customerId, meta);
  if (!userId) return;

  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanByStripePrice(priceId ?? '');
  if (!plan) return;

  const planResult = await db.query<{ id: string }>(`SELECT id FROM plan WHERE slug = $1`, [plan.slug]);
  if (!planResult.rows[0]) return;

  await upsertSubscription({
    userId, planId: planResult.rows[0].id, stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id, status: subscription.status,
    periodEnd: getPeriodEnd(subscription), cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: getCancelAt(subscription),
  });

  // Email de confirmação quando ativa pela primeira vez (fallback do checkout)
  if (subscription.status === 'active') {
    const alreadySent = await db.query<{ count: string }>(
      `SELECT count(*)::int FROM nfse_emission WHERE stripe_invoice_id LIKE 'confirm_email_%' AND user_id = $1`,
      [userId]
    );
    if (parseInt(alreadySent.rows[0]?.count ?? '0') === 0) {
      sendConfirmationEmail(userId, plan.name, plan.priceCents, getPeriodEnd(subscription))
        .catch(err => console.error('[webhook] Email confirmação falhou:', err));
      await db.query(
        `INSERT INTO nfse_emission (stripe_invoice_id, user_id, status) VALUES ($1, $2, 'emitted') ON CONFLICT DO NOTHING`,
        [`confirm_email_${subscription.id}`, userId]
      );
    }
  }

  console.log(`[webhook] sub.updated: userId=${userId} status=${subscription.status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await db.query(
    `UPDATE subscription SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const raw = invoice as unknown as Record<string, unknown>;
  const subscriptionId = raw.subscription as string | null;
  if (!subscriptionId) return;

  const sub = await db.query<{ user_id: string; plan_slug: string }>(
    `SELECT s.user_id, p.slug as plan_slug FROM subscription s JOIN plan p ON p.id = s.plan_id
     WHERE s.stripe_subscription_id = $1 LIMIT 1`,
    [subscriptionId]
  );
  if (!sub.rows[0]) return;

  const invoiceId = invoice.id;
  const existing = await db.query<{ id: number; status: string }>(
    `SELECT id, status FROM nfse_emission WHERE stripe_invoice_id = $1 LIMIT 1`, [invoiceId]
  );
  if (existing.rows[0] && existing.rows[0].status === 'emitted') return; // Idempotência

  // Chamar emissão NFS-e (fire-and-forget)
  import('@/lib/nfse-webhook').then(async ({ emitirNFSeForInvoice }) => {
    try {
      await emitirNFSeForInvoice(invoice);
    } catch (err) {
      console.error('[webhook] NFS-e emission failed:', err);
    }
  }).catch(err => console.error('[webhook] NFS-e import failed:', err));

  console.log(`[webhook] invoice.payment_succeeded: invoiceId=${invoiceId}`);
}

async function sendConfirmationEmail(userId: string, planName: string, priceCents: number, periodEnd: number | null) {
  const userRow = await db.query<{ email: string; name: string | null }>(
    `SELECT email, name FROM "user" WHERE id = $1 LIMIT 1`, [userId]
  );
  if (!userRow.rows[0]) return;

  const { sendSubscriptionConfirmationEmail } = await import('@/lib/email');
  const renewalDate = periodEnd
    ? new Date(periodEnd * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  const priceBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(priceCents / 100);

  await sendSubscriptionConfirmationEmail({
    to: userRow.rows[0].email,
    userName: userRow.rows[0].name || userRow.rows[0].email,
    planName, priceBRL, renewalDate,
    appUrl: process.env.BETTER_AUTH_URL ?? 'https://jmeter-performance-dashboard.vercel.app',
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const raw = invoice as unknown as Record<string, unknown>;
  const subscriptionId = raw.subscription as string | null;
  if (!subscriptionId) return;

  const sub = await db.query<{ user_id: string; plan_name: string }>(
    `SELECT s.user_id, p.name as plan_name FROM subscription s JOIN plan p ON p.id = s.plan_id
     WHERE s.stripe_subscription_id = $1 LIMIT 1`,
    [subscriptionId]
  );
  if (!sub.rows[0]) return;

  const user = await db.query<{ email: string; name: string | null }>(
    `SELECT email, name FROM "user" WHERE id = $1 LIMIT 1`, [sub.rows[0].user_id]
  );
  if (!user.rows[0]) return;

  const { sendPaymentFailedEmail } = await import('@/lib/email');
  await sendPaymentFailedEmail({
    to: user.rows[0].email,
    userName: user.rows[0].name || user.rows[0].email,
    planName: sub.rows[0].plan_name,
    appUrl: process.env.BETTER_AUTH_URL ?? 'https://jmeter-performance-dashboard.vercel.app',
  });

  console.log(`[webhook] invoice.payment_failed: userId=${sub.rows[0].user_id} invoiceId=${invoice.id}`);
}
