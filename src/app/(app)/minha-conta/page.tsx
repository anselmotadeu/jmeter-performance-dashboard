import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import MinhaContaClient from './MinhaContaClient';

export default async function MinhaContaPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <MinhaContaClient
        userName={session.user.name ?? ''}
        userEmail={session.user.email}
      />
    </div>
  );
}
