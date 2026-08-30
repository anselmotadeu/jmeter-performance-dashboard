/**
 * Admin page — Super Admin Panel (padrão TestDiff)
 * Server Component apenas para o guard de acesso (auth + role super_admin);
 * todos os dados são carregados via /api/admin no client (AdminClient).
 * Governance V6: role='super_admin'; zero window.alert; autoria obrigatória
 * @project JMeter Performance Dashboard
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const admin = await isAdmin(session.user.id);
  if (!admin) redirect('/');

  return <AdminClient />;
}