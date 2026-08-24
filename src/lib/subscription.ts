/**
 * subscription.ts — Gerenciamento de assinaturas do Performance Dashboard
 * Padrão TestDiff/EstilOS. Trial 7 dias com limites Radar.
 * Banco é SEMPRE reflexo do Stripe — só webhook atualiza.
 */

import { db } from '@/lib/db';
import { getPlanBySlug, getPlanByStripePrice, RADAR, type Plan } from '@/lib/plans';

export interface Subscription {
  id: string;
  userId: string;
  status: string;
  planSlug: string;
  planName: string;
  planId: string;
  priceCents: number;
  maxMonthlyAnalyses: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  pendingDowngradePlan: string | null;
  pendingDowngradeDate: Date | null;
}

interface SubRow {
  id: string;
  user_id: string;
  status: string;
  plan_id: string;
  plan_slug: string;
  plan_name: string;
  price_cents: number;
  max_monthly_analyses: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  cancel_at: Date | null;
  canceled_at: Date | null;
  pending_downgrade_plan: string | null;
  pending_downgrade_date: Date | null;
}

function mapRow(row: SubRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    planId: row.plan_id,
    planSlug: row.plan_slug,
    planName: row.plan_name,
    priceCents: row.price_cents,
    maxMonthlyAnalyses: row.max_monthly_analyses,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    cancelAt: row.cancel_at,
    canceledAt: row.canceled_at,
    pendingDowngradePlan: row.pending_downgrade_plan,
    pendingDowngradeDate: row.pending_downgrade_date,
  };
}

const SUB_SELECT = `
  SELECT s.id, s.user_id, s.status, s.plan_id,
    p.slug as plan_slug, p.name as plan_name, p.price_cents, p.max_monthly_analyses,
    s.stripe_customer_id, s.stripe_subscription_id,
    s.current_period_start, s.current_period_end,
    s.cancel_at_period_end, s.cancel_at, s.canceled_at,
    s.pending_downgrade_plan, s.pending_downgrade_date
  FROM subscription s JOIN plan p ON p.id = s.plan_id
  WHERE s.user_id = $1 AND s.status IN ('active','trialing','past_due')
  ORDER BY s.created_at DESC LIMIT 1
`;

export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  try {
    const r = await db.query<SubRow>(SUB_SELECT, [userId]);
    return r.rows[0] ? mapRow(r.rows[0]) : null;
  } catch {
    return null;
  }
}

export async function clearSubscriptionCache(_userId: string) {
  // No-op: sem cache em memória — cada request vai ao banco
}

/**
 * Cria trial de 7 dias com limites Radar se o usuário não tiver subscription.
 * Lição TestDiff: trial bloqueia totalmente ao expirar.
 */
export async function getOrCreateTrial(userId: string): Promise<Subscription | null> {
  const existing = await getActiveSubscription(userId);
  if (existing) return existing;

  try {
    const planResult = await db.query<{ id: string }>(
      `SELECT id FROM plan WHERE slug = 'radar' LIMIT 1`
    );
    if (!planResult.rows[0]) return null;

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    await db.query(
      `INSERT INTO subscription (user_id, plan_id, status, current_period_start, current_period_end)
       VALUES ($1, $2, 'trialing', NOW(), $3)
       ON CONFLICT DO NOTHING`,
      [userId, planResult.rows[0].id, trialEnd]
    );
    return getActiveSubscription(userId);
  } catch {
    return null;
  }
}

export async function getCurrentPlan(userId: string): Promise<Plan> {
  const sub = await getActiveSubscription(userId);
  if (!sub) return RADAR; // fallback para trial (limites Radar)
  return getPlanBySlug(sub.planSlug);
}

export async function getSubscriptionDetail(userId: string): Promise<{
  subscription: Subscription | null;
  isTrial: boolean;
  trialDaysLeft: number;
  isExpired: boolean;
  isCanceled: boolean;
  isCanceledScheduled: boolean;
  accessExpiresAt: string | null;
  invoices: Array<{ id: string; date: string; amount: string; status: string; url: string | null }>;
} | null> {
  try {
    const sub = await getActiveSubscription(userId);

    // Verificar se expirou trial
    const trialRow = await db.query<SubRow>(
      `SELECT s.*, p.slug as plan_slug, p.name as plan_name, p.price_cents, p.max_monthly_analyses, p.id as plan_id
       FROM subscription s JOIN plan p ON p.id = s.plan_id
       WHERE s.user_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
      [userId]
    );
    const anyRow = trialRow.rows[0];

    const isTrial = anyRow?.status === 'trialing';
    const isExpired = isTrial && anyRow.current_period_end
      ? new Date(anyRow.current_period_end) < new Date()
      : false;

    const trialDaysLeft = isTrial && anyRow.current_period_end && !isExpired
      ? Math.max(0, Math.ceil((new Date(anyRow.current_period_end).getTime() - Date.now()) / 86_400_000))
      : 0;

    const isCanceled = anyRow?.status === 'canceled';
    const isCanceledScheduled = !isCanceled && (
      anyRow?.cancel_at_period_end === true ||
      (anyRow?.cancel_at != null && new Date(anyRow.cancel_at) > new Date())
    );

    const accessExpiresAt = isCanceledScheduled
      ? (anyRow?.cancel_at ?? anyRow?.current_period_end)?.toISOString() ?? null
      : isCanceled
      ? anyRow?.canceled_at?.toISOString() ?? null
      : isExpired
      ? anyRow?.current_period_end?.toISOString() ?? null
      : null;

    return {
      subscription: anyRow ? mapRow(anyRow as SubRow) : null,
      isTrial, trialDaysLeft, isExpired,
      isCanceled, isCanceledScheduled, accessExpiresAt,
      invoices: [],
    };
  } catch {
    return null;
  }
}

/** Busca o stripe_customer_id a partir do user_id */
export async function getStripeCustomerId(userId: string): Promise<string | null> {
  try {
    const r = await db.query<{ stripe_customer_id: string }>(
      `SELECT stripe_customer_id FROM subscription WHERE user_id = $1 AND stripe_customer_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return r.rows[0]?.stripe_customer_id ?? null;
  } catch {
    return null;
  }
}

export { getPlanByStripePrice };
