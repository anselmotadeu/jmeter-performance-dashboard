/**
 * POST /api/admin/broadcast
 * Envia email para todos os usuários de um plano (super_admin only)
 * Governance V6: zero window.alert; autoria obrigatória
 * @project JMeter Performance Dashboard
 */
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { sendAuthEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(session.user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { planSlug, subject, message } = await req.json() as {
    planSlug?: 'grafico' | 'panorama' | 'all';
    subject: string;
    message: string;
  };

  if (!subject || !message) {
    return NextResponse.json({ error: 'subject e message são obrigatórios' }, { status: 400 });
  }

  // Busca usuários conforme plano alvo
  let query: string;
  let params: string[];

  if (!planSlug || planSlug === 'all') {
    query = `
      SELECT u.email, u.name
      FROM "user" u
      INNER JOIN subscription s ON s.user_id = u.id
      WHERE s.status IN ('active', 'trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    `;
    params = [];
  } else {
    query = `
      SELECT u.email, u.name
      FROM "user" u
      INNER JOIN subscription s ON s.user_id = u.id
      INNER JOIN plan p ON p.id = s.plan_id
      WHERE s.status IN ('active', 'trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        AND p.slug = $1
    `;
    params = [planSlug];
  }

  const users = await db.query(query, params);
  const appUrl = process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app';

  let sent = 0;
  let failed = 0;

  for (const user of users.rows) {
    try {
      await sendAuthEmail({
        to: user.email,
        subject,
        title: subject,
        description: message,
        action: 'Acessar JMeter Dashboard',
        url: appUrl,
      });
      sent++;
    } catch (err) {
      console.error(`[broadcast] Falha ao enviar para ${user.email}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ sent, failed });
}
