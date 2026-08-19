import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import { auth } from '@/lib/auth';
import { getUserWorkspace } from '@/lib/run-data';
import { ensureWorkspace } from '@/lib/workspace';

export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect('/login');
  await ensureWorkspace(session.user.id,session.user.name);
  const workspace=await getUserWorkspace(session.user.id);
  return <AppShell user={{name:session.user.firstName||session.user.name,email:session.user.email}} workspace={workspace?.workspaceName||'Meu Workspace'}>{children}</AppShell>;
}
