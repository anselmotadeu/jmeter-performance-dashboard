import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/notifications — retorna notificações relevantes para o usuário autenticado.
 * Filtra por: user_id (direta), target_plan, target_status, expires_at, notification_read.
 * Padrão TestDiff/EstilOS (notifications.getMine).
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ notifications: [] });
  }

  try {
    const userId = session.user.id;
    const now = new Date();

    // Plano e status da subscription do usuário para filtragem de broadcast
    const subRow = await db.query<{ plan_slug: string | null; status: string | null }>(
      `SELECT p.slug as plan_slug, s.status
       FROM subscription s LEFT JOIN plan p ON p.id = s.plan_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC LIMIT 1`,
      [userId]
    );
    const planSlug = subRow.rows[0]?.plan_slug ?? null;
    const subStatus = subRow.rows[0]?.status ?? null;

    // Todas as notificações não expiradas
    const allNotifs = await db.query<{
      id: number; user_id: string | null; target_plan: string | null;
      target_status: string | null; title: string; body: string;
      type: string; expires_at: Date | null; created_at: Date;
    }>(
      `SELECT id, user_id, target_plan, target_status, title, body, type, expires_at, created_at
       FROM notification
       WHERE expires_at IS NULL OR expires_at > $1
       ORDER BY created_at DESC LIMIT 50`,
      [now]
    );

    // Notificações relevantes: diretas ao usuário OU broadcast que casa plano/status
    const relevant = allNotifs.rows.filter((n) => {
      if (n.user_id !== null && n.user_id !== userId) return false;
      if (n.user_id === null && n.target_plan !== null && n.target_plan !== planSlug) return false;
      if (n.user_id === null && n.target_status !== null && n.target_status !== subStatus) return false;
      return true;
    });

    if (relevant.length === 0) {
      return NextResponse.json({ notifications: [] });
    }

    const dismissed = await db.query<{ notification_id: number }>(
      `SELECT notification_id FROM notification_read
       WHERE user_id = $1 AND notification_id = ANY($2)`,
      [userId, relevant.map((n) => n.id)]
    );
    const dismissedSet = new Set(dismissed.rows.map((d) => d.notification_id));

    return NextResponse.json({
      notifications: relevant
        .filter((n) => !dismissedSet.has(n.id))
        .map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          type: n.type,
          expires_at: n.expires_at,
          created_at: n.created_at,
        })),
    });
  } catch (err) {
    console.error('[notifications GET]', err);
    return NextResponse.json({ notifications: [] });
  }
}

/**
 * POST /api/notifications — marca notificação como lida para o usuário.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { notificationId } = await request.json() as { notificationId: number };
    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId required' }, { status: 400 });
    }

    await db.query(
      `INSERT INTO notification_read (notification_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [notificationId, session.user.id]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[notifications POST]', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}