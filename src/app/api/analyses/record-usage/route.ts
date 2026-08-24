import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCurrentPlan } from '@/lib/subscription';

/**
 * POST /api/analyses/record-usage
 * Registra análise processada no limite mensal.
 * Lição TestDiff: conta no PROCESSAMENTO, não no salvamento.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const userId = session.user.id;
  const plan = await getCurrentPlan(userId);
  const limit = plan.limits.maxMonthlyAnalyses;

  const countResult = await db.query<{ count: string }>(
    `SELECT count(*)::text FROM analysis_usage
     WHERE user_id = $1 AND processed_at >= date_trunc('month', CURRENT_DATE)`,
    [userId]
  );
  const used = Number(countResult.rows[0]?.count ?? 0);

  if (used >= limit) {
    return Response.json(
      { error: 'Limite de análises do plano atingido.', limit, used, limitReached: true },
      { status: 402 }
    );
  }

  await db.query(
    `INSERT INTO analysis_usage (user_id, plan_slug) VALUES ($1, $2)`,
    [userId, plan.slug]
  );

  return Response.json({ success: true, used: used + 1, limit });
}
