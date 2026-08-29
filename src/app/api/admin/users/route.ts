/**
 * GET /api/admin/users
 * Lista todos os usuários com dados de plano e uso (super_admin only)
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

  const result = await db.query(`
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
  `);

  return NextResponse.json(result.rows);
}
