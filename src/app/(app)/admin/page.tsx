import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import AppShell from '@/components/app/AppShell';

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  
  if (!session) {
    redirect('/login');
  }

  const admin = await isAdmin(session.user.id);
  if (!admin) {
    redirect('/');
  }

  // Buscar estatísticas
  const totalUsers = await db.query(`select count(*) from "user"`);
  const activeSubscriptions = await db.query(`
    select count(*) from subscription 
    where status in ('active', 'trialing') 
    and (current_period_end is null or current_period_end > now())
  `);
  const totalRevenue = await db.query(`
    select coalesce(sum(amount_paid), 0) as total
    from stripe_event
    where event_type = 'invoice.payment_succeeded'
    and status = 'succeeded'
  `);
  const recentSignups = await db.query(`
    select id, email, "createdAt", role
    from "user"
    order by "createdAt" desc
    limit 10
  `);

  const stats = {
    totalUsers: parseInt(totalUsers.rows[0].count),
    activeSubscriptions: parseInt(activeSubscriptions.rows[0].count),
    totalRevenue: parseFloat(totalRevenue.rows[0].total) / 100,
    recentSignups: recentSignups.rows,
  };

  return (
    <AppShell user={session.user} workspace="Admin Panel">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Painel Administrativo</h1>
          <p className="text-slate-500">Visão geral do sistema Performance Dashboard</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 text-white shadow-lg">
            <div className="text-sm font-medium opacity-90">Total de Usuários</div>
            <div className="text-4xl font-bold mt-2">{stats.totalUsers}</div>
            <div className="text-sm opacity-75 mt-2">Usuários cadastrados</div>
          </div>

          <div className="rounded-xl bg-gradient-to-br from-green-500 to-green-600 p-6 text-white shadow-lg">
            <div className="text-sm font-medium opacity-90">Assinaturas Ativas</div>
            <div className="text-4xl font-bold mt-2">{stats.activeSubscriptions}</div>
            <div className="text-sm opacity-75 mt-2">Planos Gráfico e Panorama</div>
          </div>

          <div className="rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 p-6 text-white shadow-lg">
            <div className="text-sm font-medium opacity-90">Receita Total</div>
            <div className="text-4xl font-bold mt-2">
              R$ {stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-sm opacity-75 mt-2">Pagamentos processados</div>
          </div>
        </div>

        {/* Recent Signups */}
        <div className="rounded-xl border bg-white p-6 dark:bg-slate-900">
          <h2 className="text-xl font-bold mb-4">Últimos Cadastros</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-semibold">Email</th>
                  <th className="pb-3 font-semibold">Data</th>
                  <th className="pb-3 font-semibold">Role</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentSignups.map((user) => (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="py-3">{user.email}</td>
                    <td className="py-3 text-slate-500">
                      {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-4">
          <a
            href="/api/trial-check"
            className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700"
          >
            Verificar Trials Expirados
          </a>
          <Link
            href="/"
            className="rounded-xl border border-slate-300 px-6 py-3 font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
