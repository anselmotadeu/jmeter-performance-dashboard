import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await db.query(`
    SELECT id, title, body, type, created_at
    FROM notification
    WHERE user_id = $1
      AND id NOT IN (
        SELECT notification_id FROM notification_read WHERE user_id = $1
      )
    ORDER BY created_at DESC
    LIMIT 5
  `, [session.user.id]);

  return NextResponse.json({ notifications: result.rows });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { notificationId } = await request.json();
  if (!notificationId) {
    return NextResponse.json({ error: 'notificationId required' }, { status: 400 });
  }

  await db.query(`
    INSERT INTO notification_read (notification_id, user_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
  `, [notificationId, session.user.id]);

  return NextResponse.json({ success: true });
}
