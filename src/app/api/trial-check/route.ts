import { db } from '@/lib/db';
import { sendTrialExpiringEmail, sendTrialExpiredEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.BETTER_AUTH_URL ?? 'https://jmeter-performance-dashboard.vercel.app';

/**
 * POST /api/trial-check
 * Verifica trials expirando (2 dias) e expirados, envia emails.
 * Chamado pelo middleware ou cron job.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const now = new Date();
  const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  let expiringSent = 0;
  let expiredSent = 0;

  // Buscar trials que expiram em 2 dias (não enviados ainda)
  const expiringTrials = await db.query<{
    user_id: string;
    email: string;
    name: string | null;
    current_period_end: Date;
  }>(
    `SELECT s.user_id, u.email, u.name, s.current_period_end
     FROM subscription s
     JOIN "user" u ON u.id = s.user_id
     WHERE s.status = 'trialing'
       AND s.current_period_end > $1
       AND s.current_period_end <= $2
       AND NOT EXISTS (
         SELECT 1 FROM notification
         WHERE user_id = s.user_id AND type = 'warning' AND title LIKE '%trial expira%'
       )`,
    [now, inTwoDays]
  );

  for (const trial of expiringTrials.rows) {
    const deliveryKey = `trial_expiring_${trial.user_id}_${trial.current_period_end.toISOString().slice(0, 10)}`;
    const daysLeft = Math.ceil((trial.current_period_end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    try {
      const claimed = await db.query(
        `INSERT INTO email_delivery (delivery_key, recipient, email_type)
        VALUES ($1, $2, 'trial_expiring')
        ON CONFLICT (delivery_key) DO UPDATE
          SET status = 'processing', processing_started_at = NOW()
        WHERE email_delivery.status = 'processing'
          AND email_delivery.processing_started_at < NOW() - interval '10 minutes'
        RETURNING delivery_key`,
        [deliveryKey, trial.email],
      );
      if (claimed.rowCount === 0) continue;
      await sendTrialExpiringEmail({
        to: trial.email,
        userName: trial.name || trial.email,
        daysLeft,
        appUrl: APP_URL,
      });
      // Registrar notificação enviada
      await db.query(
        `INSERT INTO notification (user_id, title, body, type)
         VALUES ($1, $2, $3, 'warning')`,
        [trial.user_id, `Seu trial expira em ${daysLeft} dias`, `Enviamos um email avisando sobre o trial expirando.`]
      );
      await db.query(`UPDATE email_delivery SET status = 'sent', sent_at = NOW() WHERE delivery_key = $1`, [deliveryKey]);
      expiringSent++;
      console.log(`[trial-check] Expiring email sent to ${trial.email} (${daysLeft} days left)`);
    } catch (err) {
      await db.query(`UPDATE email_delivery SET processing_started_at = NOW() - interval '11 minutes' WHERE delivery_key = $1`, [deliveryKey]);
      console.error(`[trial-check] Failed to send expiring email to ${trial.email}:`, err);
    }
  }

  // Buscar trials expirados (não enviados ainda)
  const expiredTrials = await db.query<{
    user_id: string;
    email: string;
    name: string | null;
  }>(
    `SELECT s.user_id, u.email, u.name
     FROM subscription s
     JOIN "user" u ON u.id = s.user_id
     WHERE s.status = 'trialing'
       AND s.current_period_end <= $1
       AND NOT EXISTS (
         SELECT 1 FROM notification
         WHERE user_id = s.user_id AND type = 'warning' AND title LIKE '%trial expirou%'
       )`,
    [now]
  );

  for (const trial of expiredTrials.rows) {
    const deliveryKey = `trial_expired_${trial.user_id}`;
    try {
      const claimed = await db.query(
        `INSERT INTO email_delivery (delivery_key, recipient, email_type)
        VALUES ($1, $2, 'trial_expired')
        ON CONFLICT (delivery_key) DO UPDATE
          SET status = 'processing', processing_started_at = NOW()
        WHERE email_delivery.status = 'processing'
          AND email_delivery.processing_started_at < NOW() - interval '10 minutes'
        RETURNING delivery_key`,
        [deliveryKey, trial.email],
      );
      if (claimed.rowCount === 0) continue;
      await sendTrialExpiredEmail({
        to: trial.email,
        userName: trial.name || trial.email,
        appUrl: APP_URL,
      });
      // Registrar notificação enviada
      await db.query(
        `INSERT INTO notification (user_id, title, body, type)
         VALUES ($1, $2, $3, 'warning')`,
        [trial.user_id, `Seu trial expirou`, `Enviamos um email avisando sobre o trial expirado.`]
      );
      await db.query(`UPDATE email_delivery SET status = 'sent', sent_at = NOW() WHERE delivery_key = $1`, [deliveryKey]);
      expiredSent++;
      console.log(`[trial-check] Expired email sent to ${trial.email}`);
    } catch (err) {
      await db.query(`UPDATE email_delivery SET processing_started_at = NOW() - interval '11 minutes' WHERE delivery_key = $1`, [deliveryKey]);
      console.error(`[trial-check] Failed to send expired email to ${trial.email}:`, err);
    }
  }

  return Response.json({
    expiringSent,
    expiredSent,
  });
}
