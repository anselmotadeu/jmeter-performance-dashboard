import { userHasProductAccess } from '@/lib/subscription';
import { getCurrentPlan } from '@/lib/subscription';
import type { PlanLimits } from '@/lib/plans';

export async function requireProductAccess(userId: string): Promise<Response | null> {
  if (await userHasProductAccess(userId)) return null;
  return Response.json(
    { error: 'Seu período de acesso terminou. Escolha um plano para continuar.', code: 'SUBSCRIPTION_REQUIRED' },
    { status: 402 },
  );
}

export async function requirePlanFeature(userId: string, feature: keyof PlanLimits): Promise<Response | null> {
  const accessError = await requireProductAccess(userId);
  if (accessError) return accessError;
  const plan = await getCurrentPlan(userId);
  if (plan.limits[feature]) return null;
  return Response.json({ error: 'Este recurso não está disponível no seu plano.', code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
}
