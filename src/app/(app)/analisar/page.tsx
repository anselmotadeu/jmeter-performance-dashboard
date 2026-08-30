import { headers } from 'next/headers';
import AnalysisWorkspace from '@/components/app/AnalysisWorkspace';
import { auth } from '@/lib/auth';
import { requireProductPageAccess } from '@/lib/page-access';

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  await requireProductPageAccess(session.user.id);
  return <AnalysisWorkspace />;
}
