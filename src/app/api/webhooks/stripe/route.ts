import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { clearSubscriptionCache } from '@/lib/subscription';
import { emitirNFSeForInvoice, emitirNFSeForUpgradeSession, getInvoiceSubscriptionId } from '@/lib/nfse-webhook';
import { sendCancellationEmail, sendSubscriptionConfirmationEmail, sendPaymentFailedEmail } from '@/lib/email';
import Stripe from 'stripe';

export const maxDuration = 60;

/**
 * POST /api/webhooks/stripe — Performance Dashboard
 *
 * Fonte única da verdade: o banco é SEMPRE um reflexo do Stripe.
 * Nenhuma rota da aplicação modifica o banco diretamente para billing —
 * toda mudança chega via webhook.
 *
 * Espelho fiel do TestDiff (src/app/api/webhooks/stripe/route.ts).
 * Adaptado: planos grafico/panorama, Performance Dashboard.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const claimed = await db.query(
      `INSERT INTO subscription_event
         (stripe_event_id, event_type, event_created_at, status, processing_started_at)
       VALUES ($1, $2, to_timestamp($3), 'processing', NOW())
       ON CONFLICT (stripe_event_id) DO UPDATE
         SET status = 'processing', processing_started_at = NOW(), error_message = NULL
       WHERE subscription_event.status = 'failed'
          OR (subscription_event.status = 'processing'
              AND subscription_event.processing_started_at < NOW() - interval '2 minutes')
       RETURNING stripe_event_id`,
      [event.id, event.type, event.created],
    );
    if (claimed.rowCount === 0) return NextResponse.json({ received: true, duplicate: true });

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.created);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, event.created);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.created);
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`[webhook] Unhandled event: ${event.type}`);
    }
    await db.query(
      `UPDATE subscription_event SET status = 'completed', processed_at = NOW()
       WHERE stripe_event_id = $1`,
      [event.id],
    );
    return NextResponse.json({ received: true });
  } catch (error) {
    await db.query(
      `UPDATE subscription_event SET status = 'failed', error_message = $2 WHERE stripe_event_id = $1`,
      [event.id, error instanceof Error ? error.message : String(error)],
    ).catch(console.error);
    console.error('[webhook] Handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve userId: metadata → customer.metadata → user.email */
async function resolveUserId(customerId: string, metadata?: Record<string, string>): Promise<string | null> {
  if (metadata?.userId) return metadata.userId;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const meta = (customer as Stripe.Customer).metadata;
    if (meta?.userId) return meta.userId;
    const email = (customer as Stripe.Customer).email;
    if (email) {
      const r = await db.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1 LIMIT 1', [email]);
      if (r.rows.length > 0) return r.rows[0].id;
    }
  } catch (err) {
    console.error('[webhook] resolveUserId error:', err);
  }
  return null;
}

/** Extrai current_period_end compatível com Stripe SDK v14+ */
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

/** Extrai cancel_at */
function getCancelAt(sub: unknown): number | null {
  const s = sub as Record<string, unknown>;
  if (typeof s?.cancel_at === 'number') return s.cancel_at;
  return null;
}

/** Remove subscription de trial quando usuário assina de verdade */
async function clearTrial(userId: string) {
  try {
    await db.query(`DELETE FROM subscription WHERE user_id = $1 AND status = 'trialing'`, [userId]);
  } catch (err) {
    console.error('[webhook] clearTrial error:', err);
  }
}

async function deliverEmailOnce(
  key: string,
  recipient: string,
  emailType: string,
  send: () => Promise<void>,
) {
  const claimed = await db.query(
    `INSERT INTO email_delivery (delivery_key, recipient, email_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (delivery_key) DO UPDATE
       SET status = 'processing', processing_started_at = NOW()
     WHERE email_delivery.status = 'processing'
       AND email_delivery.processing_started_at < NOW() - interval '10 minutes'
     RETURNING delivery_key`,
    [key, recipient, emailType],
  );
  if (claimed.rowCount === 0) return;
  try {
    await send();
    await db.query(`UPDATE email_delivery SET status = 'sent', sent_at = NOW() WHERE delivery_key = $1`, [key]);
  } catch (error) {
    await db.query(
      `UPDATE email_delivery SET processing_started_at = NOW() - interval '11 minutes' WHERE delivery_key = $1`,
      [key],
    );
    throw error;
  }
}

async function sendSubscriptionWelcome(params: {
  userId: string;
  subscriptionId: string;
  planName: string;
  priceCents: number;
  periodEnd: number | null;
}) {
  const user = await db.query<{ email: string; name: string | null }>(
    `SELECT email, name FROM "user" WHERE id = $1 LIMIT 1`,
    [params.userId],
  );
  if (!user.rows[0]) return;
  const renewalDate = params.periodEnd
    ? new Date(params.periodEnd * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  const priceBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(params.priceCents / 100);
  await deliverEmailOnce(`subscription_welcome_${params.subscriptionId}`, user.rows[0].email, 'subscription_welcome', () =>
    sendSubscriptionConfirmationEmail({
      to: user.rows[0].email,
      userName: user.rows[0].name || user.rows[0].email,
      planName: params.planName,
      priceBRL,
      renewalDate,
      appUrl: process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app',
    }),
  );
}

/**
 * Upsert da subscription no banco.
 * Usa ON CONFLICT (stripe_subscription_id) — requer índice único criado na migration 010.
 */
async function upsertSubscription(params: {
  userId: string;
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  cancelAt?: number | null;
  eventCreated: number;
}): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO subscription
       (user_id, plan_id, stripe_customer_id, stripe_subscription_id,
         status, current_period_start, current_period_end, cancel_at_period_end, cancel_at,
         last_stripe_event_created)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, to_timestamp($9))
     ON CONFLICT (stripe_subscription_id) DO UPDATE
       SET status               = EXCLUDED.status,
           plan_id              = EXCLUDED.plan_id,
           current_period_end   = EXCLUDED.current_period_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end,
           cancel_at            = EXCLUDED.cancel_at,
            last_stripe_event_created = EXCLUDED.last_stripe_event_created,
            updated_at           = NOW()
      WHERE subscription.last_stripe_event_created IS NULL
         OR subscription.last_stripe_event_created <= EXCLUDED.last_stripe_event_created
      RETURNING subscription.id`,
    [
      params.userId,
      params.planId,
      params.stripeCustomerId,
      params.stripeSubscriptionId,
      params.status,
      params.periodEnd ? new Date(params.periodEnd * 1000) : null,
      params.cancelAtPeriodEnd,
      params.cancelAt ? new Date(params.cancelAt * 1000) : null,
      params.eventCreated,
    ]
  );
  if (result.rowCount) clearSubscriptionCache(params.userId);
  return (result.rowCount ?? 0) > 0;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * checkout.session.completed
 * Trata dois casos:
 * 1. Nova assinatura (mode=subscription)
 * 2. Pagamento de upgrade (metadata.type="upgrade", mode=payment)
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventCreated: number) {
  const customerId = session.customer as string;
  const metadata = (session.metadata ?? {}) as Record<string, string>;
  const userId = await resolveUserId(customerId, metadata);

  // Caso 1: Nova assinatura
  if (session.mode === 'subscription' && session.subscription) {
    if (!userId) {
      console.error('[webhook] checkout.completed: userId not found for customer', customerId);
      return;
    }
    const sub = await stripe.subscriptions.retrieve(session.subscription as string);
    const priceId = sub.items.data[0]?.price.id;
    if (!priceId) throw new Error('No price in subscription');

    // Buscar plano pelo stripe_price_id (padrão TestDiff)
    const planResult = await db.query<{ id: string; name: string; slug: string; price_cents: number }>(
      `SELECT id, name, slug, price_cents FROM plan WHERE stripe_price_id = $1`, [priceId]
    );
    if (planResult.rows.length === 0) {
      console.warn(`[webhook] checkout.completed: plan not found for price ${priceId}`);
      return;
    }

    if (sub.status === 'active') await clearTrial(userId);
    const applied = await upsertSubscription({
      userId,
      planId: planResult.rows[0].id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      periodEnd: getPeriodEnd(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      cancelAt: getCancelAt(sub),
      eventCreated,
    });
    if (!applied) return;

    if (sub.status === 'active') {
      await sendSubscriptionWelcome({
        userId,
        subscriptionId: sub.id,
        planName: planResult.rows[0].name,
        priceCents: planResult.rows[0].price_cents,
        periodEnd: getPeriodEnd(sub),
      });
    }

    console.log(`[webhook] checkout.subscription: userId=${userId} plan=${planResult.rows[0].slug} sub=${sub.id}`);
    return;
  }

  // Caso 2: Pagamento de upgrade (cobrança proporcional)
  if (session.mode === 'payment' && metadata.type === 'upgrade') {
    const upgradeUserId = metadata.userId;
    const planSlug = metadata.planSlug;
    const subscriptionId = metadata.subscriptionId;
    const newPriceId = metadata.newPriceId;
    const itemId = metadata.itemId;

    if (!upgradeUserId || !subscriptionId || !newPriceId || !itemId) {
      console.error('[webhook] upgrade payment: missing metadata', metadata);
      return;
    }
    if (session.payment_status !== 'paid') {
      console.warn(`[webhook] upgrade payment not paid: session=${session.id} status=${session.payment_status}`);
      return;
    }

    // Aplicar mudança de plano no Stripe
    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'none',
      metadata: { userId: upgradeUserId, planSlug },
    });

    const planResult = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM plan WHERE stripe_price_id = $1`, [newPriceId]
    );
    if (planResult.rows.length === 0) {
      console.warn(`[webhook] upgrade: plan not found for price ${newPriceId}`);
      return;
    }

    const applied = await upsertSubscription({
      userId: upgradeUserId,
      planId: planResult.rows[0].id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      status: updated.status,
      periodEnd: getPeriodEnd(updated),
      cancelAtPeriodEnd: updated.cancel_at_period_end,
      cancelAt: getCancelAt(updated),
      eventCreated,
    });
    if (!applied) return;
    await db.query(
      `UPDATE subscription SET pending_downgrade_plan = NULL, pending_downgrade_date = NULL, updated_at = NOW()
        WHERE stripe_subscription_id = $1`,
      [subscriptionId]
    );
    await emitirNFSeForUpgradeSession(session);
    console.log(`[webhook] upgrade.completed: userId=${upgradeUserId} plan=${planSlug} sub=${subscriptionId}`);
  }
}

/**
 * customer.subscription.created / updated
 * Reflete QUALQUER mudança feita no Stripe (Dashboard, Portal, API, schedule).
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription, eventCreated: number) {
  // Materialize current Stripe state instead of trusting an out-of-order payload.
  subscription = await stripe.subscriptions.retrieve(subscription.id);
  const previous = await db.query<{ cancel_at_period_end: boolean }>(
    `SELECT cancel_at_period_end FROM subscription WHERE stripe_subscription_id = $1 LIMIT 1`,
    [subscription.id],
  );
  const customerId = subscription.customer as string;
  const meta = (subscription.metadata ?? {}) as Record<string, string>;
  const userId = await resolveUserId(customerId, meta);

  if (!userId) {
    console.log(`[webhook] subscription.updated: userId not found for customer ${customerId} — skip`);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) return;

  const planResult = await db.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM plan WHERE stripe_price_id = $1`, [priceId]
  );
  if (planResult.rows.length === 0) {
    console.warn(`[webhook] subscription.updated: plan not found for price ${priceId} — skip`);
    return;
  }

  if (subscription.status === 'active') await clearTrial(userId);
  const applied = await upsertSubscription({
    userId,
    planId: planResult.rows[0].id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    periodEnd: getPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: getCancelAt(subscription),
    eventCreated,
  });
  if (!applied) return;
  await db.query(
    `UPDATE subscription SET pending_downgrade_plan = NULL, pending_downgrade_date = NULL, updated_at = NOW()
      WHERE stripe_subscription_id = $1 AND pending_downgrade_plan = $2`,
    [subscription.id, planResult.rows[0].slug]
  );

  if (subscription.status === 'active') {
    const planRow = await db.query<{ name: string; price_cents: number }>(
      `SELECT name, price_cents FROM plan WHERE stripe_price_id = $1 LIMIT 1`, [priceId]
    );
    if (planRow.rows[0]) await sendSubscriptionWelcome({
      userId,
      subscriptionId: subscription.id,
      planName: planRow.rows[0].name,
      priceCents: planRow.rows[0].price_cents,
      periodEnd: getPeriodEnd(subscription),
    });
  }
  if (subscription.cancel_at_period_end && !previous.rows[0]?.cancel_at_period_end) {
    const user = await db.query<{ email: string; name: string | null }>(
      `SELECT email, name FROM "user" WHERE id = $1 LIMIT 1`, [userId],
    );
    const plan = await db.query<{ name: string }>(`SELECT name FROM plan WHERE id = $1`, [planResult.rows[0].id]);
    if (user.rows[0]) {
      const end = getPeriodEnd(subscription);
      await deliverEmailOnce(`subscription_cancel_${subscription.id}_${end ?? 'end'}`, user.rows[0].email, 'subscription_cancel', () =>
        sendCancellationEmail({
          to: user.rows[0].email,
          userName: user.rows[0].name || user.rows[0].email,
          planName: plan.rows[0]?.name ?? 'atual',
          accessUntil: end ? new Date(end * 1000).toLocaleDateString('pt-BR') : 'fim do período atual',
          appUrl: process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app',
        }),
      );
    }
  }

  console.log(`[webhook] subscription.updated: userId=${userId} status=${subscription.status} cancelEOP=${subscription.cancel_at_period_end}`);
}

/**
 * customer.subscription.deleted
 * Marca a subscription como cancelada no banco.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription, eventCreated: number) {
  const customerId = subscription.customer as string;
  const meta = (subscription.metadata ?? {}) as Record<string, string>;
  const userId = await resolveUserId(customerId, meta);
  if (!userId) throw new Error(`Usuário não encontrado para assinatura cancelada ${subscription.id}.`);
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) throw new Error(`Preço ausente na assinatura cancelada ${subscription.id}.`);
  const plan = await db.query<{ id: string }>(`SELECT id FROM plan WHERE stripe_price_id = $1 LIMIT 1`, [priceId]);
  if (!plan.rows[0]) throw new Error(`Plano não encontrado para preço ${priceId}.`);
  const applied = await upsertSubscription({
    userId,
    planId: plan.rows[0].id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: 'canceled',
    periodEnd: getPeriodEnd(subscription),
    cancelAtPeriodEnd: false,
    cancelAt: getCancelAt(subscription),
    eventCreated,
  });
  if (applied) {
    await db.query(`UPDATE subscription SET canceled_at = NOW() WHERE stripe_subscription_id = $1`, [subscription.id]);
  }
  console.log(`[webhook] subscription.deleted: ${subscription.id}`);
}

/**
 * invoice.payment_succeeded
 * Confirma status active e dispara emissão de NFS-e.
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  console.log(`[webhook] payment_succeeded: invoice=${invoice.id} sub=${subscriptionId ?? 'none'}`);
  await emitirNFSeForInvoice(invoice);
}

/**
 * invoice.payment_failed
 * Marca como past_due e alerta o usuário.
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const sub = await db.query<{ user_id: string; plan_name: string }>(
    `SELECT s.user_id, p.name as plan_name FROM subscription s JOIN plan p ON p.id = s.plan_id
     WHERE s.stripe_subscription_id = $1 LIMIT 1`,
    [subscriptionId]
  );
  if (sub.rows[0]) {
    const user = await db.query<{ email: string; name: string | null }>(
      `SELECT email, name FROM "user" WHERE id = $1 LIMIT 1`, [sub.rows[0].user_id]
    );
    if (user.rows[0]) {
      await deliverEmailOnce(`payment_failed_${invoice.id}`, user.rows[0].email, 'payment_failed', () =>
        sendPaymentFailedEmail({
          to: user.rows[0].email,
          userName: user.rows[0].name || user.rows[0].email,
          planName: sub.rows[0].plan_name,
          appUrl: process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app',
        }),
      );
    }
  }

  console.log(`[webhook] payment_failed: sub=${subscriptionId}`);
}
