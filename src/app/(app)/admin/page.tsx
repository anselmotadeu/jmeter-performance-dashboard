/**
 * Admin page — Super Admin Panel (Server Component)
 * Governance V6: carrega dados server-side e passa para AdminClient
 * @project JMeter Performance Dashboard
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { listRecentNFSeEmissions } from '@/lib/nfse';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const admin = await isAdmin(session.user.id);
  if (!admin) redirect('/');

  // Buscar dados paralelos
  const [
    totalUsersResult,
    activeSubsResult,
    usersResult,
    mrrResult,
    newSubsResult,
    churnResult,
    nfseRows,
  ] = await Promise.all([
    db.query<{ count: string }>(`SELECT COUNT(*) FROM "user"`),
    db.query<{ count: string }>(`
      SELECT COUNT(*) FROM subscription
      WHERE status IN ('active', 'trialing')
        AND (current_period_end IS NULL OR current_period_end > now())
    `),
    db.query(`
      SELECT
        u.id,
        u.email,
        u."createdAt",
        u.role,
        p.name  AS plan_name,
        p.slug  AS plan_slug,
        s.status,
        s.current_period_end,
        (
          SELECT COUNT(*)
          FROM analysis_usage au
          WHERE au.user_id = u.id
            AND au.processed_at >= date_trunc('month', NOW())
        ) AS usage_this_month
      FROM "user" u
      LEFT JOIN subscription s ON s.user_id = u.id
      LEFT JOIN plan p ON p.id = s.plan_id
      ORDER BY u."createdAt" DESC
      LIMIT 100
    `),
    db.query<{ mrr: string }>(`
      SELECT COALESCE(SUM(p.price_cents), 0) AS mrr
      FROM subscription s
      INNER JOIN plan p ON p.id = s.plan_id
      WHERE s.status IN ('active', 'trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    `),
    db.query<{ new_subscribers: string }>(`
      SELECT COUNT(*) AS new_subscribers
      FROM subscription
      WHERE status IN ('active', 'trialing')
        AND created_at >= now() - interval '30 days'
    `),
    db.query<{ churned: string }>(`
      SELECT COUNT(*) AS churned
      FROM subscription
      WHERE status = 'canceled'
        AND updated_at >= now() - interval '30 days'
    `),
    listRecentNFSeEmissions(),
  ]);

  const initialMRR = {
    mrr: parseInt(mrrResult.rows[0]?.mrr ?? '0', 10),
    newSubscribers: parseInt(newSubsResult.rows[0]?.new_subscribers ?? '0', 10),
    churned: parseInt(churnResult.rows[0]?.churned ?? '0', 10),
  };

  return (
    <AdminClient
      initialUsers={usersResult.rows}
      initialNFSe={nfseRows}
      initialMRR={initialMRR}
      totalUsers={parseInt(totalUsersResult.rows[0]?.count ?? '0', 10)}
      activeSubscriptions={parseInt(activeSubsResult.rows[0]?.count ?? '0', 10)}
    />
  );
}
