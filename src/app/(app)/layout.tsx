/**
 * (app)/layout.tsx — Layout principal do app
 * Governance V6: verifica super_admin e passa prop isSuperAdmin ao AppShell
 * @project JMeter Performance Dashboard
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import TrialExpiredGate from '@/components/app/TrialExpiredGate';
import { auth } from '@/lib/auth';
import { getUserWorkspace } from '@/lib/run-data';
import { ensureWorkspace } from '@/lib/workspace';
import { getOrCreateTrial, getSubscriptionDetail, getCurrentPlan, subscriptionHasAccess } from '@/lib/subscription';
import { db } from '@/lib/db';

export const dynamic='force-dynamic';

export default async function Layout({children}:{children:React.ReactNode}){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect('/login');
  await ensureWorkspace(session.user.id,session.user.name);
  await getOrCreateTrial(session.user.id);
  const workspace=await getUserWorkspace(session.user.id);
  const subscription=await getSubscriptionDetail(session.user.id);
  const plan=await getCurrentPlan(session.user.id);

  // Verificar se o usuário é super_admin
  const userResult = await db.query<{ role: string }>(
    `SELECT role FROM "user" WHERE id = $1`,
    [session.user.id]
  );
  const isSuperAdmin = userResult.rows[0]?.role === 'super_admin';
  const hasProductAccess = isSuperAdmin || subscriptionHasAccess(subscription?.subscription ?? null);

  return (
    <TrialExpiredGate
      isTrial={subscription?.isTrial ?? false}
      isExpired={subscription?.isExpired ?? false}
      trialDaysLeft={subscription?.trialDaysLeft ?? 0}
      blocked={!hasProductAccess}
    >
      <AppShell
        user={{name:session.user.firstName||session.user.name,email:session.user.email}}
        workspace={workspace?.workspaceName||'Meu Workspace'}
        planName={plan.name}
        maxMonthlyAnalyses={plan.limits.maxMonthlyAnalyses}
        isSuperAdmin={isSuperAdmin}
        hasProductAccess={hasProductAccess}
      >
        {children}
      </AppShell>
    </TrialExpiredGate>
  );
}
