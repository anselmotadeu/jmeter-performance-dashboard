import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { getActiveSubscription, clearSubscriptionCache } from '@/lib/subscription';

/**
 * POST /api/subscription/cancel
 * Cancela a assinatura ao fim do ciclo atual (cancel_at_period_end).
 * O usuário mantém acesso até current_period_end.
 * Envia e-mail de comunicado de cancelamento.
 *
 * Padrão EstilOS/TestDiff.
 */
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

    const sub = await getActiveSubscription(session.user.id);
    if (!sub?.stripeSubscriptionId) {
      return Response.json({ error: 'Nenhuma assinatura ativa encontrada.' }, { status: 400 });
    }

    // Cancelar ao fim do ciclo (não imediatamente)
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    clearSubscriptionCache(session.user.id);

    // Enviar e-mail de comunicado de cancelamento (fire-and-forget)
    const accessUntil = sub.currentPeriodEnd
      ? new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')
      : '—';
    import('@/lib/email').then(async ({ sendCancellationEmail }) => {
      const db = (await import('@/lib/db')).db;
      const userRow = await db.query<{ email: string; name: string | null }>(
        'SELECT email, name FROM "user" WHERE id = $1 LIMIT 1', [session.user.id]
      );
      if (!userRow.rows[0]) return;
      await sendCancellationEmail({
        to: userRow.rows[0].email,
        userName: userRow.rows[0].name || userRow.rows[0].email,
        planName: sub.planName,
        accessUntil,
        appUrl: process.env.BETTER_AUTH_URL || 'https://jmeter-performance-dashboard.vercel.app',
      });
    }).catch(err => console.error('[cancel] email falhou:', err));

    return Response.json({
      success: true,
      message: `Cancelamento agendado. Você mantém o acesso até ${accessUntil}.`,
    });
  } catch (error) {
    console.error('[cancel]', error);
    return Response.json({ error: 'Erro ao cancelar assinatura.' }, { status: 500 });
  }
}
