import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import TrialExpiredGate from '@/components/app/TrialExpiredGate';
import { auth } from '@/lib/auth';
import { getUserWorkspace } from '@/lib/run-data';
import { ensureWorkspace } from '@/lib/workspace';
import { getSubscriptionDetail, getCurrentPlan } from '@/lib/subscription';

export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect('/login');
  await ensureWorkspace(session.user.id,session.user.name);
  const workspace=await getUserWorkspace(session.user.id);
  const subscription=await getSubscriptionDetail(session.user.id);
  const plan=await getCurrentPlan(session.user.id);
  return (
    <TrialExpiredGate
      isTrial={subscription?.isTrial ?? false}
      isExpired={subscription?.isExpired ?? false}
      trialDaysLeft={subscription?.trialDaysLeft ?? 0}
    >
      <AppShell
        user={{name:session.user.firstName||session.user.name,email:session.user.email}}
        workspace={workspace?.workspaceName||'Meu Workspace'}
        planName={plan.name}
        maxMonthlyAnalyses={plan.limits.maxMonthlyAnalyses}
      >
        {children}
      </AppShell>
    </TrialExpiredGate>
  );
}
