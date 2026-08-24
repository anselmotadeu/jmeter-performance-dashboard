import { db } from '@/lib/db';
import { sendTrialExpiringEmail, sendTrialExpiredEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.BETTER_AUTH_URL ?? 'https://jmeter-performance-dashboard.vercel.app';

/**
 * POST /api/trial-check
 * Verifica trials expirando (2 dias) e expirados, envia emails.
 * Chamado pelo middleware ou cron job.
 */
export async function POST() {
  const now = new Date();
  const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

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
    const daysLeft = Math.ceil((trial.current_period_end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    try {
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
        [trial.user_id, `Seu trial expira em ${daysLeft} dias`, `Enviamos um email avisando sobre o trial expirando.`, 'warning']
      );
      console.log(`[trial-check] Expiring email sent to ${trial.email} (${daysLeft} days left)`);
    } catch (err) {
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
    try {
      await sendTrialExpiredEmail({
        to: trial.email,
        userName: trial.name || trial.email,
        appUrl: APP_URL,
      });
      // Registrar notificação enviada
      await db.query(
        `INSERT INTO notification (user_id, title, body, type)
         VALUES ($1, $2, $3, 'warning')`,
        [trial.user_id, `Seu trial expirou`, `Enviamos um email avisando sobre o trial expirado.`, 'warning']
      );
      console.log(`[trial-check] Expired email sent to ${trial.email}`);
    } catch (err) {
      console.error(`[trial-check] Failed to send expired email to ${trial.email}:`, err);
    }
  }

  return Response.json({
    expiringSent: expiringTrials.rows.length,
    expiredSent: expiredTrials.rows.length,
  });
}
