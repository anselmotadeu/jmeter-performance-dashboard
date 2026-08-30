import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { clearSubscriptionCache } from '@/lib/subscription';
import { emitirNFSeForInvoice, emitirNFSeForUpgradeSession, getInvoiceSubscriptionId } from '@/lib/nfse-webhook';
import { sendSubscriptionConfirmationEmail, sendPaymentFailedEmail } from '@/lib/email';
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
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
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
    return NextResponse.json({ received: true });
  } catch (error) {
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
}) {
  await db.query(
    `INSERT INTO subscription
       (user_id, plan_id, stripe_customer_id, stripe_subscription_id,
        status, current_period_start, current_period_end, cancel_at_period_end, cancel_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)
     ON CONFLICT (stripe_subscription_id) DO UPDATE
       SET status               = EXCLUDED.status,
           plan_id              = EXCLUDED.plan_id,
           current_period_end   = EXCLUDED.current_period_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end,
           cancel_at            = EXCLUDED.cancel_at,
           updated_at           = NOW()`,
    [
      params.userId,
      params.planId,
      params.stripeCustomerId,
      params.stripeSubscriptionId,
      params.status,
      params.periodEnd ? new Date(params.periodEnd * 1000) : null,
      params.cancelAtPeriodEnd,
      params.cancelAt ? new Date(params.cancelAt * 1000) : null,
    ]
  );
  clearSubscriptionCache(params.userId);
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * checkout.session.completed
 * Trata dois casos:
 * 1. Nova assinatura (mode=subscription)
 * 2. Pagamento de upgrade (metadata.type="upgrade", mode=payment)
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
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

    await clearTrial(userId);
    await upsertSubscription({
      userId,
      planId: planResult.rows[0].id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      periodEnd: getPeriodEnd(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      cancelAt: getCancelAt(sub),
    });

    // Email de confirmação (fire-and-forget)
    const periodEndRaw = getPeriodEnd(sub);
    const renewalDate = periodEndRaw
      ? new Date(periodEndRaw * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      : '—';
    const userRow = await db.query<{ email: string; name: string | null }>(
      `SELECT email, name FROM "user" WHERE id = $1 LIMIT 1`, [userId]
    );
    if (userRow.rows[0]) {
      const priceBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
        .format(planResult.rows[0].price_cents / 100);
      sendSubscriptionConfirmationEmail({
        to: userRow.rows[0].email,
        userName: userRow.rows[0].name || userRow.rows[0].email,
        planName: planResult.rows[0].name,
        priceBRL,
        renewalDate,
        appUrl: process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app',
      }).catch(err => console.error('[webhook] Email confirmação falhou:', err));
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

    await upsertSubscription({
      userId: upgradeUserId,
      planId: planResult.rows[0].id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      status: updated.status,
      periodEnd: getPeriodEnd(updated),
      cancelAtPeriodEnd: updated.cancel_at_period_end,
      cancelAt: getCancelAt(updated),
    });
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
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
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

  await upsertSubscription({
    userId,
    planId: planResult.rows[0].id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    periodEnd: getPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: getCancelAt(subscription),
  });
  await db.query(
    `UPDATE subscription SET pending_downgrade_plan = NULL, pending_downgrade_date = NULL, updated_at = NOW()
      WHERE stripe_subscription_id = $1 AND pending_downgrade_plan = $2`,
    [subscription.id, planResult.rows[0].slug]
  );

  // Enviar email de confirmação quando subscription fica active pela primeira vez
  // Fallback para quando checkout.session.completed falha ou é entregue com atraso
  if (subscription.status === 'active') {
    const emailSentCheck = await db.query<{ count: string }>(
      `SELECT count(*)::int FROM nfse_emission WHERE stripe_invoice_id LIKE 'confirm_email_%' AND user_id = $1`,
      [userId]
    );
    const alreadySent = parseInt(emailSentCheck.rows[0]?.count ?? '0') > 0;

    if (!alreadySent) {
      try {
        const userRow = await db.query<{ email: string; name: string | null }>(
          `SELECT email, name FROM "user" WHERE id = $1 LIMIT 1`, [userId]
        );
        const planRow = await db.query<{ name: string; price_cents: number }>(
          `SELECT name, price_cents FROM plan WHERE stripe_price_id = $1 LIMIT 1`, [priceId]
        );
        if (userRow.rows[0] && planRow.rows[0]) {
          const periodEndRaw = getPeriodEnd(subscription);
          const renewalDate = periodEndRaw
            ? new Date(periodEndRaw * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
            : '—';
          const priceBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
            .format(planRow.rows[0].price_cents / 100);

          await sendSubscriptionConfirmationEmail({
            to: userRow.rows[0].email,
            userName: userRow.rows[0].name || userRow.rows[0].email,
            planName: planRow.rows[0].name,
            priceBRL,
            renewalDate,
            appUrl: process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app',
          });

          // Marcar que o email foi enviado (evitar duplicata)
          await db.query(
            `INSERT INTO nfse_emission (stripe_invoice_id, user_id, status) VALUES ($1, $2, 'emitted') ON CONFLICT DO NOTHING`,
            [`confirm_email_${subscription.id}`, userId]
          );
          console.log(`[webhook] Email de confirmação enviado para ${userRow.rows[0].email}`);
        }
      } catch (emailErr) {
        console.error('[webhook] Falha ao enviar email de confirmação:', emailErr);
      }
    }
  }

  console.log(`[webhook] subscription.updated: userId=${userId} status=${subscription.status} cancelEOP=${subscription.cancel_at_period_end}`);
}

/**
 * customer.subscription.deleted
 * Marca a subscription como cancelada no banco.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await db.query(
    `UPDATE subscription SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );
  const customerId = subscription.customer as string;
  const meta = (subscription.metadata ?? {}) as Record<string, string>;
  const userId = await resolveUserId(customerId, meta);
  if (userId) clearSubscriptionCache(userId);
  console.log(`[webhook] subscription.deleted: ${subscription.id}`);
}

/**
 * invoice.payment_succeeded
 * Confirma status active e dispara emissão de NFS-e.
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (subscriptionId) {
    await db.query(
      `UPDATE subscription SET status = 'active', updated_at = NOW()
       WHERE stripe_subscription_id = $1`,
      [subscriptionId]
    );
  }
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

  await db.query(
    `UPDATE subscription SET status = 'past_due', updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );

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
      sendPaymentFailedEmail({
        to: user.rows[0].email,
        userName: user.rows[0].name || user.rows[0].email,
        planName: sub.rows[0].plan_name,
        appUrl: process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app',
      }).catch(err => console.error('[webhook] Email payment_failed falhou:', err));
    }
  }

  console.log(`[webhook] payment_failed: sub=${subscriptionId}`);
}
