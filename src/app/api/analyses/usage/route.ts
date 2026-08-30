import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCurrentPlan } from '@/lib/subscription';
import { requireProductAccess } from '@/lib/billing-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const accessError = await requireProductAccess(session.user.id);
  if (accessError) return accessError;

  const plan = await getCurrentPlan(session.user.id);

  // Contar análises no mês atual
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM analysis_usage WHERE user_id = $1 AND processed_at >= $2`,
    [session.user.id, firstDayOfMonth]
  );

  const count = parseInt(result.rows[0]?.count || '0', 10);

  return Response.json({
    count,
    max: plan.limits.maxMonthlyAnalyses,
    planSlug: plan.slug,
    planName: plan.name,
  });
}
