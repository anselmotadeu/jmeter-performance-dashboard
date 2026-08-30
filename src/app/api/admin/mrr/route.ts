/**
 * GET /api/admin/mrr
 * MRR e métricas de billing (super_admin only)
 * Governance V6: zero window.alert; autoria obrigatória
 * @project JMeter Performance Dashboard
 */
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(session.user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [mrrResult, newResult, churnResult] = await Promise.all([
    // MRR: soma price_cents das assinaturas ativas
    db.query(`
      SELECT COALESCE(SUM(p.price_cents), 0) AS mrr
      FROM subscription s
      INNER JOIN plan p ON p.id = s.plan_id
       WHERE s.status = 'active'
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    `),
    // Novos assinantes nos últimos 30 dias
    db.query(`
      SELECT COUNT(*) AS new_subscribers
      FROM subscription
       WHERE status = 'active'
        AND created_at >= now() - interval '30 days'
    `),
    // Churn: cancelamentos nos últimos 30 dias
    db.query(`
      SELECT COUNT(*) AS churned
      FROM subscription
      WHERE status = 'canceled'
        AND updated_at >= now() - interval '30 days'
    `),
  ]);

  return NextResponse.json({
    mrr: parseInt(mrrResult.rows[0].mrr, 10),
    newSubscribers: parseInt(newResult.rows[0].new_subscribers, 10),
    churned: parseInt(churnResult.rows[0].churned, 10),
  });
}
