'use client';
/**
 * AdminClient.tsx — Client Component interativo do painel Super Admin
 * Governance V6: zero window.alert/confirm/prompt; banners inline com role="alert"
 * @project JMeter Performance Dashboard
 */

import { useState } from 'react';
import { Shield, Users, TrendingUp, TrendingDown, DollarSign, RefreshCw, Send, Ban, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  email: string;
  createdAt: string;
  role: string;
  plan_name: string | null;
  plan_slug: string | null;
  status: string | null;
  current_period_end: string | null;
  usage_this_month: number;
};

type NFSeRow = {
  id: number;
  stripe_invoice_id: string;
  user_id: string | null;
  status: string;
  nfse_numero: string | null;
  created_at: string;
  email_sent_at: string | null;
  error_message: string | null;
};

type MRR = { mrr: number; newSubscribers: number; churned: number };

type Props = {
  initialUsers: UserRow[];
  initialNFSe: NFSeRow[];
  initialMRR: MRR;
  totalUsers: number;
  activeSubscriptions: number;
};

// ─── Banner de feedback ─────────────────────────────────────────────────────

type BannerType = 'success' | 'error' | 'info';

function Banner({ type, message, onClose }: { type: BannerType; message: string; onClose: () => void }) {
  const styles: Record<BannerType, string> = {
    success: 'bg-green-50 border-green-400 text-green-800 dark:bg-green-950 dark:border-green-600 dark:text-green-200',
    error: 'bg-red-50 border-red-400 text-red-800 dark:bg-red-950 dark:border-red-600 dark:text-red-200',
    info: 'bg-indigo-50 border-indigo-400 text-indigo-800 dark:bg-indigo-950 dark:border-indigo-600 dark:text-indigo-200',
  };
  const Icon = type === 'success' ? CheckCircle : type === 'error' ? XCircle : AlertCircle;

  return (
    <div role="alert" className={`flex items-start gap-3 rounded-xl border p-4 mb-4 ${styles[type]}`}>
      <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-current opacity-60 hover:opacity-100" aria-label="Fechar">✕</button>
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    trialing: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    canceled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    past_due: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

// ─── Main Client Component ──────────────────────────────────────────────────

export default function AdminClient({ initialUsers, initialNFSe, initialMRR, totalUsers, activeSubscriptions }: Props) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [nfseList, setNFSeList] = useState<NFSeRow[]>(initialNFSe);
  const [mrr, setMRR] = useState<MRR>(initialMRR);
  const [banner, setBanner] = useState<{ type: BannerType; message: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  // Broadcast form state
  const [broadcastPlan, setBroadcastPlan] = useState<'all' | 'grafico' | 'panorama'>('all');
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');

  const showBanner = (type: BannerType, message: string) => setBanner({ type, message });

  // ─── Ações de usuário ──────────────────────────────────────────────────

  async function forcePlan(userId: string, planSlug: 'grafico' | 'panorama') {
    setLoading(`plan-${userId}-${planSlug}`);
    try {
      const res = await fetch('/api/admin/force-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, planSlug }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro desconhecido');
      showBanner('success', `Plano ${planSlug} aplicado com sucesso.`);
      await refreshUsers();
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Erro ao forçar plano');
    } finally {
      setLoading(null);
    }
  }

  async function suspendUser(userId: string, email: string) {
    setLoading(`suspend-${userId}`);
    try {
      const res = await fetch('/api/admin/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro desconhecido');
      showBanner('success', `Usuário ${email} suspenso.`);
      await refreshUsers();
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Erro ao suspender');
    } finally {
      setLoading(null);
    }
  }

  async function refreshUsers() {
    const res = await fetch('/api/admin/users');
    if (res.ok) setUsers(await res.json());
    const mrrRes = await fetch('/api/admin/mrr');
    if (mrrRes.ok) setMRR(await mrrRes.json());
  }

  // ─── Ações NFS-e ───────────────────────────────────────────────────────

  async function cancelNFSe(stripeInvoiceId: string) {
    setLoading(`nfse-cancel-${stripeInvoiceId}`);
    try {
      const res = await fetch('/api/admin/nfse/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeInvoiceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? data.message ?? 'Erro ao cancelar');
      showBanner('success', 'NFS-e cancelada com sucesso.');
      await refreshNFSe();
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Erro ao cancelar NFS-e');
    } finally {
      setLoading(null);
    }
  }

  async function resendNFSe(stripeInvoiceId: string) {
    setLoading(`nfse-resend-${stripeInvoiceId}`);
    try {
      const res = await fetch('/api/admin/nfse/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeInvoiceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao re-emitir');
      showBanner('success', data.message ?? 'Reconciliação concluída.');
      await refreshNFSe();
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Erro ao re-emitir NFS-e');
    } finally {
      setLoading(null);
    }
  }

  async function refreshNFSe() {
    // Reload da página para atualizar dados server-side da lista NFS-e
    // (listRecentNFSeEmissions é chamada no server component)
    window.location.reload();
  }

  // ─── Broadcast ────────────────────────────────────────────────────────

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastSubject.trim() || !broadcastMessage.trim()) {
      showBanner('error', 'Assunto e mensagem são obrigatórios.');
      return;
    }
    setLoading('broadcast');
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug: broadcastPlan, subject: broadcastSubject, message: broadcastMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro no broadcast');
      showBanner('success', `Broadcast enviado: ${data.sent} sucesso(s), ${data.failed} falha(s).`);
      setBroadcastSubject('');
      setBroadcastMessage('');
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Erro ao enviar broadcast');
    } finally {
      setLoading(null);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg">
          <Shield className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Super Admin</h1>
          <p className="text-sm text-slate-500">Acesso restrito — role super_admin</p>
        </div>
        <span className="ml-auto rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 ring-1 ring-indigo-400/30">
          🔒 Área Segura
        </span>
      </div>

      {/* Banner feedback */}
      {banner && (
        <Banner type={banner.type} message={banner.message} onClose={() => setBanner(null)} />
      )}

      {/* Cards de métricas */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Users className="h-6 w-6" />}
          label="Total Usuários"
          value={totalUsers}
          gradient="from-indigo-500 to-indigo-700"
        />
        <MetricCard
          icon={<CheckCircle className="h-6 w-6" />}
          label="Assinaturas Ativas"
          value={activeSubscriptions}
          gradient="from-emerald-500 to-emerald-700"
        />
        <MetricCard
          icon={<DollarSign className="h-6 w-6" />}
          label="MRR"
          value={`R$ ${(mrr.mrr / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          sub={`+${mrr.newSubscribers} novos (30d)`}
          gradient="from-violet-500 to-violet-700"
        />
        <MetricCard
          icon={<TrendingDown className="h-6 w-6" />}
          label="Churn 30d"
          value={mrr.churned}
          gradient="from-rose-500 to-rose-700"
        />
      </div>

      {/* Tabela de usuários */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-bold">Usuários</h2>
          <button
            onClick={refreshUsers}
            disabled={loading === 'refresh'}
            className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50">
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">Email</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">Plano</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">Consumo/mês</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">Cadastro</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      {u.plan_name ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                  <td className="px-4 py-3 text-center">{Number(u.usage_this_month)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => forcePlan(u.id, 'grafico')}
                        disabled={loading === `plan-${u.id}-grafico`}
                        className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {loading === `plan-${u.id}-grafico` ? '…' : 'Forçar Gráfico'}
                      </button>
                      <button
                        onClick={() => forcePlan(u.id, 'panorama')}
                        disabled={loading === `plan-${u.id}-panorama`}
                        className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {loading === `plan-${u.id}-panorama` ? '…' : 'Forçar Panorama'}
                      </button>
                      <button
                        onClick={() => suspendUser(u.id, u.email)}
                        disabled={loading === `suspend-${u.id}`}
                        className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {loading === `suspend-${u.id}` ? '…' : 'Suspender'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhum usuário encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Seção NFS-e */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-bold">NFS-e — Últimas emissões</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50">
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">Invoice Stripe</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">NFS-e nº</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">Data</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody>
              {nfseList.map((n) => (
                <tr key={n.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-4 py-3 font-mono text-xs">{n.stripe_invoice_id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{n.nfse_numero ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={n.status} />
                    {n.error_message && (
                      <div className="mt-0.5 text-xs text-rose-500 truncate max-w-[160px]" title={n.error_message}>
                        {n.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(n.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => cancelNFSe(n.stripe_invoice_id)}
                        disabled={loading === `nfse-cancel-${n.stripe_invoice_id}`}
                        className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {loading === `nfse-cancel-${n.stripe_invoice_id}` ? '…' : 'Cancelar'}
                      </button>
                      <button
                        onClick={() => resendNFSe(n.stripe_invoice_id)}
                        disabled={loading === `nfse-resend-${n.stripe_invoice_id}`}
                        className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {loading === `nfse-resend-${n.stripe_invoice_id}` ? '…' : 'Re-emitir'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {nfseList.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhuma NFS-e encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Seção Broadcast */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-bold">Broadcast de Email</h2>
          <p className="text-xs text-slate-500 mt-0.5">Envie uma mensagem para todos os assinantes de um plano</p>
        </div>
        <form onSubmit={sendBroadcast} className="space-y-4 p-6">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold" htmlFor="broadcast-plan">Plano alvo</label>
            <select
              id="broadcast-plan"
              value={broadcastPlan}
              onChange={(e) => setBroadcastPlan(e.target.value as 'all' | 'grafico' | 'panorama')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="all">Todos os planos</option>
              <option value="grafico">Gráfico</option>
              <option value="panorama">Panorama</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold" htmlFor="broadcast-subject">Assunto</label>
            <input
              id="broadcast-subject"
              type="text"
              value={broadcastSubject}
              onChange={(e) => setBroadcastSubject(e.target.value)}
              placeholder="Ex: Novidade no Performance Dashboard"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold" htmlFor="broadcast-message">Mensagem</label>
            <textarea
              id="broadcast-message"
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              rows={5}
              placeholder="Escreva a mensagem aqui..."
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 resize-y"
              required
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading === 'broadcast'}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {loading === 'broadcast' ? 'Enviando…' : 'Enviar Broadcast'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ─── MetricCard ──────────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, sub, gradient,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  gradient: string;
}) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white shadow-md`}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
        {icon}
      </div>
      <div className="text-sm font-medium opacity-90">{label}</div>
      <div className="mt-1 text-3xl font-black">{value}</div>
      {sub && <div className="mt-1 text-xs opacity-75">{sub}</div>}
    </div>
  );
}
