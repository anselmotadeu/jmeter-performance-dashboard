/**
 * POST /api/admin/force-plan
 * Força plano de um usuário (super_admin only)
 * Governance V6: zero window.alert; autoria obrigatória
 * @project JMeter Performance Dashboard
 */
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(session.user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId, planSlug } = await req.json() as { userId: string; planSlug: 'grafico' | 'panorama' };
  if (!userId || !planSlug) return NextResponse.json({ error: 'userId e planSlug são obrigatórios' }, { status: 400 });

  // Busca plan_id pelo slug
  const planResult = await db.query(`SELECT id FROM plan WHERE slug = $1`, [planSlug]);
  if (!planResult.rows[0]) return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 });
  const planId = planResult.rows[0].id;

  // UPSERT na subscription
  await db.query(
    `INSERT INTO subscription (user_id, plan_id, status, current_period_end, created_at, updated_at)
     VALUES ($1, $2, 'active', now() + interval '30 days', now(), now())
     ON CONFLICT (user_id) DO UPDATE
       SET plan_id = EXCLUDED.plan_id,
           status = 'active',
           current_period_end = now() + interval '30 days',
           updated_at = now()`,
    [userId, planId]
  );

  return NextResponse.json({ success: true });
}
