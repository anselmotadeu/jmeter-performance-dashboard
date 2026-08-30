import { auth } from '@/lib/auth';
import { getSubscriptionDetail } from '@/lib/subscription';

/**
 * GET /api/subscription/detail
 * Retorna os detalhes completos da assinatura do usuário logado.
 * Usado pelo MinhaContaClient para exibir plano atual, status, datas e limites.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const detail = await getSubscriptionDetail(session.user.id);
  return Response.json(detail ?? { subscription: null, isTrial: false, trialDaysLeft: 0, isExpired: false, isCanceled: false, isCanceledScheduled: false, accessExpiresAt: null });
}
