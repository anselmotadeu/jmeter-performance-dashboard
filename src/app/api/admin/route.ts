/**
 * GET/POST /api/admin — Painel do Super Admin (consolidado) — padrão TestDiff.
 * GET:   stats | users&search=&status=&plan= | alerts | notifications | goals |
 *        nfse_emissions | test_nfse | probe_nfse | reconcile_nfse
 * POST:  set_plan | set_status | extend_trial | create_goal | delete_goal |
 *        send_notification | delete_notification | reconcile_nfse | test_nfse |
 *        probe_nfse | process_nfse | cancel_nfse
 * Governance V6: role='super_admin'; zero window.alert; autoria obrigatória
 * @project JMeter Performance Dashboard
 */
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  reconcileRecentNFSeEmissions,
  testNFSeConnection,
  probeNFSeEndpoints,
  listRecentNFSeEmissions,
  getNFSeEmission,
  cancelarNFSe,
} from '@/lib/nfse';

const SUPER_ADMIN_ROLE = 'super_admin';

class HttpError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ─── Guard ────────────────────────────────────────────────────────────────────

async function requireSuperAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return null;
  const r = await db.query<{ role: string }>(`SELECT role FROM "user" WHERE id = $1 LIMIT 1`, [session.user.id]);
  if (r.rows[0]?.role !== SUPER_ADMIN_ROLE) return null;
  return session.user;
}

// ─── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? 'stats';
  const user = await requireSuperAdmin(request);
  if (!user) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  try {
    switch (action) {
      case 'stats':          return Response.json(await getStats());
      case 'users':          return Response.json(await getUsers(url.searchParams));
      case 'alerts':         return Response.json(await getAlerts());
      case 'notifications':  return Response.json(await getNotifications());
      case 'goals':          return Response.json(await getGoals());
      case 'nfse_emissions': return Response.json(await listRecentNFSeEmissions());
      case 'test_nfse':      return Response.json(await testNFSeConnection());
      case 'probe_nfse':     return Response.json(await probeNFSeEndpoints());
      case 'reconcile_nfse': return Response.json(await reconcileRecentNFSeEmissions());
      default:               return Response.json({ error: 'Ação desconhecida.' }, { status: 400 });
    }
  } catch (err) {
    console.error(`[superadmin GET ${action}]`, err);
    return Response.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}

// ─── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const user = await requireSuperAdmin(request);
  if (!user) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');

    switch (action) {
      case 'set_plan':          return Response.json(await setPlan(body));
      case 'set_status':        return Response.json(await setStatus(body));
      case 'extend_trial':      return Response.json(await extendTrial(body));
      case 'create_goal':       return Response.json(await createGoal(body));
      case 'delete_goal':       return Response.json(await deleteGoal(body));
      case 'send_notification': return Response.json(await sendNotification(body));
      case 'delete_notification': return Response.json(await deleteNotification(body));
      case 'reconcile_nfse':    return Response.json(await reconcileRecentNFSeEmissions());
      case 'test_nfse':         return Response.json(await testNFSeConnection());
      case 'probe_nfse':        return Response.json(await probeNFSeEndpoints());
      case 'process_nfse':      return Response.json(await processNFSeById(body));
      case 'cancel_nfse':       return Response.json(await cancelarNFSe(String(body.invoiceId ?? '')));
      default:                  return Response.json({ error: 'Ação desconhecida.' }, { status: 400 });
    }
  } catch (err) {
    console.error('[superadmin POST]', err);
    if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

async function getStats() {
  // Conta por usuário (última subscription de cada usuário) para não
  // duplicar usuários com múltiplos registros históricos de assinatura.
  const users = await db.query<{
    total: string; active: string; trial: string; canceled: string;
    past_due: string; no_plan: string;
  }>(`
    SELECT
      count(*)::int                                                              as total,
      count(*) FILTER (WHERE sub.status = 'active')::int                        as active,
      count(*) FILTER (WHERE sub.status = 'trialing')::int                       as trial,
      count(*) FILTER (WHERE sub.status = 'canceled')::int                       as canceled,
      count(*) FILTER (WHERE sub.status = 'past_due')::int                       as past_due,
      count(*) FILTER (WHERE sub.id IS NULL)::int                                as no_plan
    FROM "user" u
    LEFT JOIN subscription sub ON sub.user_id = u.id
      AND sub.id = (SELECT id FROM subscription WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1)
    WHERE u.role != $1
  `, [SUPER_ADMIN_ROLE]);

  // MRR: somar price_cents dos planos ativos (última subscription por usuário)
  const mrr = await db.query<{ mrr: string }>(`
    SELECT coalesce(sum(p.price_cents), 0)::int as mrr
    FROM subscription s JOIN plan p ON p.id = s.plan_id
    WHERE s.status = 'active'
      AND s.id = (SELECT id FROM subscription s2 WHERE s2.user_id = s.user_id ORDER BY created_at DESC LIMIT 1)
  `);

  const now = new Date();
  const in5Days = new Date(now.getTime() + 5 * 86_400_000);
  const expiringTrial = await db.query<{ count: string }>(`
    SELECT count(*)::int FROM subscription
    WHERE status = 'trialing' AND current_period_end > $1 AND current_period_end <= $2
  `, [now, in5Days]);

  return {
    ...users.rows[0],
    mrr: parseInt(mrr.rows[0]?.mrr ?? '0', 10),
    expiringTrial: parseInt(expiringTrial.rows[0]?.count ?? '0', 10),
  };
}

async function getUsers(params: URLSearchParams) {
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const plan = params.get('plan') ?? '';

  const conditions: string[] = [`u.role != $1`];
  const values: unknown[] = [SUPER_ADMIN_ROLE];
  let idx = 2;

  if (search) {
    conditions.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx + 1})`);
    values.push(`%${search}%`, `%${search}%`);
    idx += 2;
  }
  // Filtro por status: usa coalesce para não excluir usuários sem subscription
  if (status) {
    conditions.push(`coalesce(sub.status, 'no_plan') = $${idx++}`);
    values.push(status);
  }
  if (plan) {
    conditions.push(`p.slug = $${idx++}`);
    values.push(plan);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  return await db.query(`
    SELECT
      u.id, u.name, u.email, u."createdAt" as created_at,
      sub.status as sub_status, sub.stripe_customer_id,
      sub.stripe_subscription_id, sub.current_period_end,
      sub.cancel_at, sub.canceled_at, sub.cancel_at_period_end,
      sub.pending_downgrade_plan, sub.pending_downgrade_date,
      p.slug as plan_slug, p.name as plan_name, p.price_cents,
      (SELECT count(*)::int FROM analysis_run WHERE created_by = u.id) as total_analyses
    FROM "user" u
    LEFT JOIN subscription sub ON sub.user_id = u.id
      AND sub.id = (SELECT id FROM subscription s2 WHERE s2.user_id = u.id ORDER BY created_at DESC LIMIT 1)
    LEFT JOIN plan p ON p.id = sub.plan_id
    ${where}
    ORDER BY u."createdAt" DESC
    LIMIT 100
  `, values).then((r) => r.rows);
}

async function getAlerts() {
  const now = new Date();
  const in5Days = new Date(now.getTime() + 5 * 86_400_000);
  const minus7Days = new Date(now.getTime() - 7 * 86_400_000);

  const expiring = await db.query(`
    SELECT u.id, u.name, u.email, sub.current_period_end, 'trial_expiring' as type
    FROM subscription sub JOIN "user" u ON u.id = sub.user_id
    WHERE sub.status = 'trialing' AND sub.current_period_end > $1 AND sub.current_period_end <= $2
  `, [now, in5Days]);

  const pastDue = await db.query(`
    SELECT u.id, u.name, u.email, 'past_due' as type
    FROM subscription sub JOIN "user" u ON u.id = sub.user_id
    WHERE sub.status = 'past_due'
  `);

  const recentCanceled = await db.query(`
    SELECT u.id, u.name, u.email, sub.canceled_at, 'recently_canceled' as type
    FROM subscription sub JOIN "user" u ON u.id = sub.user_id
    WHERE sub.status = 'canceled' AND sub.canceled_at > $1
  `, [minus7Days]);

  return [...expiring.rows, ...pastDue.rows, ...recentCanceled.rows];
}

async function getNotifications() {
  const now = new Date();
  const r = await db.query(`
    SELECT * FROM notification
    WHERE expires_at IS NULL OR expires_at > $1
    ORDER BY created_at DESC LIMIT 50
  `, [now]);
  return r.rows;
}

async function getGoals() {
  const r = await db.query(`SELECT * FROM platform_goal ORDER BY created_at DESC`);
  return r.rows;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

async function setPlan(body: Record<string, unknown>) {
  const { userId, planSlug } = body as { userId: string; planSlug: string };
  if (!userId || !planSlug) throw new HttpError('userId e planSlug obrigatórios.');
  await db.query(
    `UPDATE subscription SET plan_id = (SELECT id FROM plan WHERE slug = $1), updated_at = NOW()
     WHERE user_id = $2 AND id = (SELECT id FROM subscription WHERE user_id = $2 ORDER BY created_at DESC LIMIT 1)`,
    [planSlug, userId]
  );
  return { success: true };
}

async function setStatus(body: Record<string, unknown>) {
  const { userId, status } = body as { userId: string; status: string };
  const validStatuses = ['active', 'trialing', 'canceled', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'];
  if (!userId || !validStatuses.includes(status)) throw new HttpError('Status inválido.');

  await db.query(
    `UPDATE subscription SET status = $1,
     ${status === 'canceled' ? 'canceled_at = NOW(),' : ''}
     updated_at = NOW()
     WHERE user_id = $2 AND id = (SELECT id FROM subscription WHERE user_id = $2 ORDER BY created_at DESC LIMIT 1)`,
    [status, userId]
  );
  return { success: true };
}

async function extendTrial(body: Record<string, unknown>) {
  const { userId, days } = body as { userId: string; days: number };
  if (!userId || !days || days < 1 || days > 90) throw new HttpError('Dias inválido (1-90).');

  const newEnd = new Date(Date.now() + days * 86_400_000);
  const r = await db.query(
    `UPDATE subscription SET status = 'trialing', current_period_end = $1, updated_at = NOW()
     WHERE user_id = $2 AND id = (SELECT id FROM subscription WHERE user_id = $2 ORDER BY created_at DESC LIMIT 1)
     RETURNING id`,
    [newEnd, userId]
  );
  if (r.rowCount === 0) throw new HttpError('Usuário sem assinatura para estender trial.');
  return { success: true, newEndsAt: newEnd };
}

async function createGoal(body: Record<string, unknown>) {
  const { title, type, targetValue, targetPlan, period, startDate, endDate, notes } = body as {
    title: string; type: string; targetValue: number; targetPlan?: string;
    period: string; startDate: string; endDate?: string; notes?: string;
  };
  if (!title || !type || targetValue === undefined || !period || !startDate) {
    throw new HttpError('Campos obrigatórios ausentes: título, tipo, valor alvo, período e data inicial.');
  }
  await db.query(
    `INSERT INTO platform_goal (title, type, target_value, target_plan, period, start_date, end_date, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [title, type, targetValue, targetPlan || null, period,
     new Date(startDate + 'T12:00:00Z'),
     endDate ? new Date(endDate + 'T12:00:00Z') : null,
     notes || null]
  );
  return { success: true };
}

async function deleteGoal(body: Record<string, unknown>) {
  await db.query(`DELETE FROM platform_goal WHERE id = $1`, [body.id as number]);
  return { success: true };
}

async function sendNotification(body: Record<string, unknown>) {
  const { userId, targetPlan, targetStatus, title, bodyText, type, expiresAt } = body as {
    userId?: string; targetPlan?: string; targetStatus?: string;
    title: string; bodyText: string; type: string; expiresAt?: string;
  };
  if (!title || !bodyText) throw new HttpError('Título e mensagem obrigatórios.');
  await db.query(
    `INSERT INTO notification (user_id, target_plan, target_status, title, body, type, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId || null, targetPlan || null, targetStatus || null, title, bodyText, type,
     expiresAt ? new Date(expiresAt + 'T23:59:59Z') : null]
  );
  return { success: true };
}

async function deleteNotification(body: Record<string, unknown>) {
  await db.query(`DELETE FROM notification WHERE id = $1`, [body.id as number]);
  return { success: true };
}

async function processNFSeById(body: Record<string, unknown>) {
  const { invoiceId } = body as { invoiceId: string };
  if (!invoiceId) throw new HttpError('invoiceId obrigatório.');
  const existing = await getNFSeEmission(String(invoiceId));
  return {
    message: existing
      ? `Registro já existe (status: ${existing.status}). Use "Reconciliar pagamentos" para reprocessar.`
      : 'Nenhum registro pendente. Use "Reconciliar pagamentos" para reprocessar automaticamente.',
  };
}