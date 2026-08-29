/**
 * POST /api/admin/suspend
 * Suspende (cancela) a subscription de um usuário (super_admin only)
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

  const { userId } = await req.json() as { userId: string };
  if (!userId) return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });

  await db.query(
    `UPDATE subscription SET status = 'canceled', updated_at = now() WHERE user_id = $1`,
    [userId]
  );

  return NextResponse.json({ success: true });
}
