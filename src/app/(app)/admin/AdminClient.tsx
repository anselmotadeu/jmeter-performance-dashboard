'use client';
/**
 * AdminClient.tsx — Super Admin espelhado no TestDiff (abas + dark theme).
 * Tabs: Visão Geral | Clientes | Alertas | Notificações | Metas | Broadcast
 * Governance V6: zero window.alert/confirm/prompt; banners inline role="alert";
 * modais próprios; cancelamento de NFS-e exige digitar CANCELAR.
 * @project JMeter Performance Dashboard
 */

import { useState, useEffect } from 'react';
import {
  BarChart3, Users, Bell, AlertTriangle, Target, Shield, Search, RefreshCw,
  DollarSign, XCircle, Clock, CheckCircle2,
  ChevronRight, ExternalLink, Loader2, Plus, Trash2, Send, Info,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stats {
  total: number; active: number; trial: number; canceled: number;
  past_due: number; no_plan: number; mrr: number; expiringTrial: number;
}

interface UserRow {
  id: string; name: string | null; email: string; role: string | null; created_at: string;
  sub_status: string | null; plan_slug: string | null; plan_name: string | null;
  price_cents: number | null; current_period_end: string | null;
  cancel_at: string | null; canceled_at: string | null; pending_downgrade_plan: string | null;
  stripe_customer_id: string | null; stripe_subscription_id: string | null;
  total_analyses: number;
}

interface Alert {
  type: 'trial_expiring' | 'past_due' | 'recently_canceled';
  id: string; name: string | null; email: string;
  current_period_end?: string; canceled_at?: string;
}

interface Notification {
  id: number; title: string; body: string; type: string;
  target_plan: string | null; target_status: string | null;
  expires_at: string | null; created_at: string;
}

interface Goal {
  id: number; title: string; type: string; target_value: string;
  target_plan: string | null; period: string; start_date: string;
  end_date: string | null; notes: string | null;
}

interface NFSeEmission {
  id: number; stripe_invoice_id: string; user_id: string | null;
  status: string; nfse_numero: string | null; created_at: string;
  email_sent_at: string | null; error_message: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400',
  trialing: 'bg-amber-500/20 text-amber-400',
  past_due: 'bg-orange-500/20 text-orange-400',
  canceled: 'bg-red-500/20 text-red-400',
  unpaid: 'bg-red-500/20 text-red-400',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo', trialing: 'Trial', past_due: 'Inadimplente', canceled: 'Cancelado', unpaid: 'Não pago',
};

const PLAN_LABEL: Record<string, string> = { grafico: 'Gráfico', panorama: 'Panorama' };

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function fmtBRL(cents: number | null) {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

// ─── Hook de dados ────────────────────────────────────────────────────────────

function useAdminData<T>(action: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin?action=${action}`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally { setLoading(false); }
  }

  // setTimeout defere o setState inicial: evita "set-state-in-effect" e mantém
  // o reload sob demanda (chamado por clique) com o mesmo código.
  useEffect(() => {
    const id = window.setTimeout(load, 0);
    return () => window.clearTimeout(id);
  }, deps);
  return { data, loading, error, reload: load };
}

async function adminPost(action: string, body: object = {}) {
  const r = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || 'Erro');
  return json;
}

// ─── Feedback inline (Governance V6) ─────────────────────────────────────────

function Feedback({ type, children }: { type: 'success' | 'error' | 'info'; children: React.ReactNode }) {
  const styles = {
    success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    error: 'bg-red-500/10 text-red-400 border-red-500/30',
    info: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  };
  return (
    <div role="alert" className={`rounded-lg px-3 py-2 text-xs border ${styles[type]}`}>
      {children}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'clients' | 'alerts' | 'notifications' | 'goals' | 'broadcast';

export default function SuperAdminPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const alertsQ = useAdminData<Alert[]>('alerts');
  const alertCount = alertsQ.data?.length ?? 0;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Visão Geral', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'clients', label: 'Clientes', icon: <Users className="h-4 w-4" /> },
    { id: 'alerts', label: `Alertas${alertCount > 0 ? ` (${alertCount})` : ''}`, icon: <AlertTriangle className="h-4 w-4" /> },
    { id: 'notifications', label: 'Notificações', icon: <Bell className="h-4 w-4" /> },
    { id: 'goals', label: 'Metas', icon: <Target className="h-4 w-4" /> },
    { id: 'broadcast', label: 'Broadcast', icon: <Send className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-black text-white tracking-tight">Performance Dashboard</span>
          <span className="hidden sm:block text-slate-500 text-xs border-l border-slate-700 pl-3">Painel da Plataforma</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <Shield className="h-3.5 w-3.5 text-indigo-400" />
          <span className="hidden sm:block">Super Admin</span>
        </div>
      </header>

      <div className="border-b border-slate-800 px-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? 'border-indigo-400 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'clients' && <ClientsTab />}
        {tab === 'alerts' && <AlertsTab alerts={alertsQ.data ?? []} loading={alertsQ.loading} />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'goals' && <GoalsTab />}
        {tab === 'broadcast' && <BroadcastTab />}
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, sub, color = 'text-indigo-400' }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function OverviewTab() {
  const statsQ = useAdminData<Stats>('stats');
  const nfseQ = useAdminData<NFSeEmission[]>('nfse_emissions');
  const [nfseResult, setNfseResult] = useState<{ success: boolean; nfseNumero?: string; error?: string; processed?: number; failed?: number; checked?: number } | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ invoiceId: string; nfseNumero: string } | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState('');
  const [canceling, setCanceling] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ success: boolean; error?: string; raw?: string } | null>(null);

  const s = statsQ.data;

  async function testNFSe() {
    setTesting(true); setNfseResult(null);
    try { const r = await adminPost('test_nfse'); setNfseResult(r); }
    catch (e) { setNfseResult({ success: false, error: e instanceof Error ? e.message : 'Erro' }); }
    finally { setTesting(false); }
  }

  async function reconcileNFSe() {
    setReconciling(true); setNfseResult(null);
    try {
      const r = await adminPost('reconcile_nfse');
      setNfseResult({
        success: r.failed === 0,
        checked: r.checked,
        processed: r.processed,
        failed: r.failed,
        error: r.errors?.length ? r.errors.map((e: { invoiceId: string; error: string }) => `${e.invoiceId}: ${e.error}`).join(' | ') : undefined,
      });
      nfseQ.reload();
    } catch (e) {
      setNfseResult({ success: false, error: e instanceof Error ? e.message : 'Erro' });
    } finally { setReconciling(false); }
  }

  async function doCancel() {
    if (!cancelTarget || cancelConfirm.toUpperCase() !== 'CANCELAR') return;
    setCanceling(true); setCancelResult(null);
    try {
      const r = await adminPost('cancel_nfse', { invoiceId: cancelTarget.invoiceId });
      setCancelResult(r);
      if (r.success) { setCancelTarget(null); setCancelConfirm(''); nfseQ.reload(); }
    } catch (e) {
      setCancelResult({ success: false, error: e instanceof Error ? e.message : 'Erro' });
    } finally { setCanceling(false); }
  }

  return (
    <div className="space-y-6">
      {statsQ.loading ? <div className="text-slate-400 text-sm">Carregando...</div> : s ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard icon={<Users className="h-5 w-5" />} label="Total usuários" value={s.total} />
          <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Ativos" value={s.active} color="text-emerald-400" />
          <MetricCard icon={<Clock className="h-5 w-5" />} label="Trial" value={s.trial} color="text-amber-400" />
          <MetricCard icon={<XCircle className="h-5 w-5" />} label="Cancelados" value={s.canceled} color="text-red-400" />
          <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Inadimplentes" value={s.past_due} color="text-orange-400" />
          <MetricCard icon={<DollarSign className="h-5 w-5" />} label="MRR" value={fmtBRL(s.mrr * 100)} color="text-indigo-400"
            sub={`${s.expiringTrial} trial expirando`} />
        </div>
      ) : null}

      {/* NFS-e diagnóstico */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">NFS-e — Diagnóstico</h3>
        <div className="flex gap-2 flex-wrap">
          <button onClick={reconcileNFSe} disabled={reconciling}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 flex items-center gap-1.5">
            {reconciling ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {reconciling ? 'Reconciliando…' : 'Reconciliar pagamentos'}
          </button>
          <button onClick={testNFSe} disabled={testing}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Info className="h-3 w-3" />}
            {testing ? 'Testando…' : 'Testar conexão NFS-e'}
          </button>
        </div>

        {nfseResult && (
          <Feedback type={nfseResult.success ? 'success' : 'error'}>
            {nfseResult.success
              ? `✅ Reconciliação concluída — verificadas ${nfseResult.checked ?? 0}, emitidas ${nfseResult.processed ?? 0}, falhas ${nfseResult.failed ?? 0}${nfseResult.nfseNumero ? ` — NFS-e #${nfseResult.nfseNumero}` : ''}`
              : `❌ ${nfseResult.error}`}
          </Feedback>
        )}

        {/* Emissões recentes */}
        {nfseQ.data && nfseQ.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead><tr className="border-b border-slate-700">
                <th className="py-2 px-2 text-left text-slate-400">Invoice</th>
                <th className="py-2 px-2 text-left text-slate-400">NFS-e</th>
                <th className="py-2 px-2 text-left text-slate-400">Status</th>
                <th className="py-2 px-2 text-left text-slate-400">E-mail</th>
                <th className="py-2 px-2 text-left text-slate-400">Ação</th>
              </tr></thead>
              <tbody>
                {nfseQ.data
                  .filter((em) => !em.stripe_invoice_id.startsWith('confirm_email_'))
                  .slice(0, 10).map((em) => (
                  <tr key={em.id} className="border-t border-slate-700/50">
                    <td className="py-1.5 px-2 font-mono">{em.stripe_invoice_id.slice(0, 20)}…</td>
                    <td className="py-1.5 px-2 font-mono">{em.nfse_numero ?? '—'}</td>
                    <td className="py-1.5 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        em.status === 'emitted' ? 'bg-emerald-500/20 text-emerald-400' :
                        em.status === 'canceled' ? 'bg-slate-500/20 text-slate-400 line-through' :
                        em.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'
                      }`}>
                        {em.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">{em.email_sent_at ? '✅' : em.error_message ? '❌' : '—'}</td>
                    <td className="py-1.5 px-2">
                      {em.status === 'emitted' && em.nfse_numero && (
                        <button
                          onClick={() => setCancelTarget({ invoiceId: em.stripe_invoice_id, nfseNumero: em.nfse_numero! })}
                          className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold"
                        >
                          Cancelar NFS-e
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal confirmação de cancelamento */}
      {cancelTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Cancelar NFS-e #{cancelTarget.nfseNumero}</h3>
                <p className="text-xs text-slate-400">Esta ação é irreversível.</p>
              </div>
            </div>
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 space-y-1 text-xs text-red-300">
              <p><strong>Condições obrigatórias da Prefeitura:</strong></p>
              <p>• O ISS <strong>não</strong> pode ter sido recolhido</p>
              <p>• A nota foi emitida há <strong>menos de 6 meses</strong></p>
              <p>• Se o ISS foi pago, use o SAV da Prefeitura SP</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-2">Digite <strong className="text-white">CANCELAR</strong> para confirmar:</p>
              <input value={cancelConfirm} onChange={e => setCancelConfirm(e.target.value)}
                placeholder="CANCELAR"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            {cancelResult && !cancelResult.success && (
              <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 space-y-1">
                <p>❌ {cancelResult.error}</p>
                {cancelResult.raw && (
                  <details className="text-[10px] text-slate-500">
                    <summary className="cursor-pointer hover:text-slate-400">Ver resposta bruta</summary>
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all">{cancelResult.raw.slice(0, 600)}</pre>
                  </details>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setCancelTarget(null); setCancelConfirm(''); setCancelResult(null); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-sm font-semibold text-slate-300 hover:bg-white/5">
                Voltar
              </button>
              <button onClick={doCancel} disabled={canceling || cancelConfirm.toUpperCase() !== 'CANCELAR'}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-1.5">
                {canceling ? <><Loader2 className="h-4 w-4 animate-spin" />Cancelando…</> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Clients ──────────────────────────────────────────────────────────────────

function ClientsTab() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const params = new URLSearchParams({ search, status: statusFilter, plan: planFilter });
  const usersQ = useAdminData<UserRow[]>(`users&${params}`, [params.toString()]);

  async function doAction(action: string, extra: object = {}) {
    if (!selectedUser) return;
    setActionMsg(null);
    try {
      await adminPost(action, { userId: selectedUser.id, ...extra });
      setActionMsg({ type: 'success', text: '✅ Operação realizada com sucesso.' });
      usersQ.reload();
    } catch (e) {
      setActionMsg({ type: 'error', text: `❌ ${e instanceof Error ? e.message : 'Erro'}` });
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
          <option value="">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="trialing">Trial</option>
          <option value="past_due">Inadimplente</option>
          <option value="canceled">Cancelado</option>
        </select>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
          <option value="">Todos os planos</option>
          <option value="grafico">Gráfico</option>
          <option value="panorama">Panorama</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm text-slate-300">
          <thead><tr className="border-b border-slate-700 bg-slate-800/50">
            <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400">Usuário</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400">Plano</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400">Status</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400">Análises</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-slate-400">Renova</th>
            <th className="py-3 px-4"></th>
          </tr></thead>
          <tbody>
            {usersQ.loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
            ) : (usersQ.data ?? []).map((u) => (
              <tr key={u.id} className="border-t border-slate-700/50 hover:bg-slate-800/30 cursor-pointer"
                onClick={() => setSelectedUser(u)}>
                <td className="py-3 px-4">
                  <p className="font-medium text-white text-sm flex items-center gap-1.5">
                    {u.name || '—'}
                    {u.role === 'super_admin' && (
                      <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300 uppercase tracking-wide">Super Admin</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </td>
                <td className="py-3 px-4">
                  <span className="text-xs font-bold text-slate-300">{PLAN_LABEL[u.plan_slug ?? ''] ?? '—'}</span>
                  {u.plan_slug && <span className="text-xs text-slate-500 ml-1">{fmtBRL(u.price_cents)}/mês</span>}
                </td>
                <td className="py-3 px-4">
                  {u.sub_status ? (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COLOR[u.sub_status] ?? 'bg-slate-700 text-slate-400'}`}>
                      {STATUS_LABEL[u.sub_status] ?? u.sub_status}
                    </span>
                  ) : <span className="text-xs text-slate-500">Sem plano</span>}
                </td>
                <td className="py-3 px-4 text-sm">{u.total_analyses}</td>
                <td className="py-3 px-4 text-xs text-slate-400">{fmt(u.current_period_end)}</td>
                <td className="py-3 px-4"><ChevronRight className="h-4 w-4 text-slate-500" /></td>
              </tr>
            ))}
            {!usersQ.loading && (usersQ.data ?? []).length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500">Nenhum usuário encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Painel de ações do usuário */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-white flex items-center gap-1.5">
                  {selectedUser.name || selectedUser.email}
                  {selectedUser.role === 'super_admin' && (
                    <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300 uppercase tracking-wide">Super Admin</span>
                  )}
                </p>
                <p className="text-xs text-slate-400">{selectedUser.email}</p>
              </div>
              <button onClick={() => { setSelectedUser(null); setActionMsg(null); }} className="text-slate-400 hover:text-white" aria-label="Fechar">✕</button>
            </div>

            {actionMsg && <Feedback type={actionMsg.type}>{actionMsg.text}</Feedback>}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-800 rounded-lg p-2.5">
                <p className="text-slate-400">Plano</p>
                <p className="font-bold text-white mt-0.5">{PLAN_LABEL[selectedUser.plan_slug ?? ''] ?? 'Sem plano'}</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-2.5">
                <p className="text-slate-400">Status</p>
                <p className="font-bold text-white mt-0.5">{STATUS_LABEL[selectedUser.sub_status ?? ''] ?? '—'}</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-2.5">
                <p className="text-slate-400">Análises</p>
                <p className="font-bold text-white mt-0.5">{selectedUser.total_analyses}</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-2.5">
                <p className="text-slate-400">Renova</p>
                <p className="font-bold text-white mt-0.5">{fmt(selectedUser.current_period_end)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ações</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => doAction('set_plan', { planSlug: 'grafico' })}
                  className="text-xs px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">
                  Forçar Gráfico
                </button>
                <button onClick={() => doAction('set_plan', { planSlug: 'panorama' })}
                  className="text-xs px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">
                  Forçar Panorama
                </button>
                <button onClick={() => doAction('extend_trial', { days: 7 })}
                  className="text-xs px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300">
                  +7 dias trial
                </button>
                <button onClick={() => doAction('set_status', { status: 'active' })}
                  className="text-xs px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300">
                  Reativar
                </button>
                <button onClick={() => doAction('set_status', { status: 'canceled' })}
                  className="text-xs px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 col-span-2">
                  Cancelar conta
                </button>
              </div>
              {selectedUser.stripe_customer_id && (
                <a href={`https://dashboard.stripe.com/customers/${encodeURIComponent(selectedUser.stripe_customer_id)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 mt-1">
                  <ExternalLink className="h-3.5 w-3.5" /> Ver no Stripe
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Alertas ──────────────────────────────────────────────────────────────────

function AlertsTab({ alerts, loading }: { alerts: Alert[]; loading?: boolean }) {
  const ALERT_CONFIG: Record<Alert['type'], { label: string; color: string }> = {
    trial_expiring: { label: 'Trial expirando', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    past_due: { label: 'Inadimplente', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
    recently_canceled: { label: 'Cancelado recentemente', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  };

  if (loading) return <div className="text-slate-400 text-sm"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (alerts.length === 0) return (
    <div className="text-center py-16 text-slate-500">
      <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500/50" />
      <p>Nenhum alerta no momento.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {alerts.map((a, i) => {
        const cfg = ALERT_CONFIG[a.type];
        return (
          <div key={i} className={`rounded-xl border px-4 py-3 ${cfg.color}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider">{cfg.label}</span>
                <p className="text-sm font-semibold mt-0.5 text-white">{a.name || a.email}</p>
                <p className="text-xs opacity-70">{a.email}</p>
              </div>
              {a.current_period_end && (
                <div className="text-right">
                  <p className="text-xs opacity-60">Expira em</p>
                  <p className="text-sm font-bold">{fmt(a.current_period_end)}</p>
                </div>
              )}
              {a.canceled_at && (
                <div className="text-right">
                  <p className="text-xs opacity-60">Cancelado em</p>
                  <p className="text-sm font-bold">{fmt(a.canceled_at)}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Notificações ─────────────────────────────────────────────────────────────

function NotificationsTab() {
  const notifQ = useAdminData<Notification[]>('notifications');
  const [form, setForm] = useState({ title: '', body: '', type: 'info', targetPlan: '', targetStatus: '', expiresAt: '' });
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function send() {
    if (!form.title.trim() || !form.body.trim()) return;
    if (!form.expiresAt) { setMsg({ type: 'error', text: '❌ Informe a data de vencimento da notificação.' }); return; }
    setSending(true); setMsg(null);
    try {
      await adminPost('send_notification', { title: form.title, bodyText: form.body, type: form.type, targetPlan: form.targetPlan || null, targetStatus: form.targetStatus || null, expiresAt: form.expiresAt });
      setForm({ title: '', body: '', type: 'info', targetPlan: '', targetStatus: '', expiresAt: '' });
      setMsg({ type: 'success', text: '✅ Notificação enviada.' });
      notifQ.reload();
    } catch (e) {
      setMsg({ type: 'error', text: `❌ ${e instanceof Error ? e.message : 'Erro'}` });
    } finally { setSending(false); }
  }

  return (
    <div className="space-y-6">
      {/* Formulário */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Nova notificação</p>
        {msg && <Feedback type={msg.type}>{msg.text}</Feedback>}
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Título"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="Mensagem" rows={3}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
        <div className="flex gap-2 flex-wrap">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
            <option value="info">Info</option>
            <option value="warning">Aviso</option>
            <option value="success">Sucesso</option>
          </select>
          <select value={form.targetPlan} onChange={(e) => setForm({ ...form, targetPlan: e.target.value })}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
            <option value="">Todos os planos</option>
            <option value="grafico">Gráfico</option>
            <option value="panorama">Panorama</option>
          </select>
          <select value={form.targetStatus} onChange={(e) => setForm({ ...form, targetStatus: e.target.value })}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
            <option value="">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="trialing">Trial</option>
          </select>
          <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" title="Vencimento (obrigatório)" />
          <span className="self-center text-[10px] text-slate-500 uppercase tracking-wide">Vencimento *</span>
        </div>
        <button onClick={send} disabled={sending || !form.title.trim() || !form.body.trim() || !form.expiresAt}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-bold text-white disabled:opacity-50">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Enviando…' : 'Enviar notificação'}
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {(notifQ.data ?? []).map((n) => (
          <div key={n.id} className="rounded-xl border border-slate-700 bg-slate-900 p-3 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{n.title}</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{n.body}</p>
              <div className="flex gap-2 mt-1 text-[10px] text-slate-500">
                {n.target_plan && <span>Plano: {PLAN_LABEL[n.target_plan] ?? n.target_plan}</span>}
                {n.target_status && <span>Status: {n.target_status}</span>}
                {n.expires_at && <span>Expira: {fmt(n.expires_at)}</span>}
              </div>
            </div>
            <button onClick={async () => { await adminPost('delete_notification', { id: n.id }); notifQ.reload(); }}
              className="text-slate-500 hover:text-red-400 shrink-0" aria-label="Excluir notificação">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {notifQ.data?.length === 0 && <p className="text-slate-500 text-sm text-center py-8">Nenhuma notificação ativa.</p>}
      </div>
    </div>
  );
}

// ─── Metas ────────────────────────────────────────────────────────────────────

const GOAL_TYPE_LABEL: Record<string, string> = {
  MRR_TARGET: 'Meta de MRR', PLAN_COUNT: 'Qtd por plano',
  NEW_CLIENTS: 'Novos clientes', CHURN_BELOW: 'Churn abaixo de',
};

const PERIOD_LABEL: Record<string, string> = {
  MONTHLY: 'Mensal', WEEKLY: 'Semanal', CAMPAIGN: 'Campanha', ALLTIME: 'Total',
};

function GoalsTab() {
  const goalsQ = useAdminData<Goal[]>('goals');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({ title: '', type: 'MRR_TARGET', targetValue: '', period: 'MONTHLY', startDate: '', endDate: '', notes: '' });

  async function createGoal() {
    if (!form.title || !form.targetValue || !form.startDate) return;
    setCreating(true); setMsg(null);
    try {
      await adminPost('create_goal', { title: form.title, type: form.type, targetValue: parseFloat(form.targetValue), period: form.period, startDate: form.startDate, endDate: form.endDate || null, notes: form.notes || null });
      setForm({ title: '', type: 'MRR_TARGET', targetValue: '', period: 'MONTHLY', startDate: '', endDate: '', notes: '' });
      setMsg({ type: 'success', text: '✅ Meta criada.' });
      goalsQ.reload();
    } catch (e) {
      setMsg({ type: 'error', text: `❌ ${e instanceof Error ? e.message : 'Erro'}` });
    } finally { setCreating(false); }
  }

  return (
    <div className="space-y-6">
      {/* Formulário */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Nova meta</p>
        {msg && <Feedback type={msg.type}>{msg.text}</Feedback>}
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Título da meta"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        <div className="flex gap-2 flex-wrap">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
            {Object.entries(GOAL_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
            {Object.entries(PERIOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="number" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
            placeholder="Valor alvo"
            className="w-28 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" />
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            placeholder="Fim (opcional)"
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" />
        </div>
        <button onClick={createGoal} disabled={creating || !form.title || !form.targetValue || !form.startDate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-bold text-white disabled:opacity-50">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {creating ? 'Criando…' : 'Criar meta'}
        </button>
      </div>

      {/* Lista de metas */}
      <div className="space-y-3">
        {(goalsQ.data ?? []).map((g) => (
          <div key={g.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4 flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-white text-sm">{g.title}</p>
              <div className="flex gap-2 mt-1 text-xs text-slate-400">
                <span>{GOAL_TYPE_LABEL[g.type] ?? g.type}</span>
                <span>·</span>
                <span>{PERIOD_LABEL[g.period] ?? g.period}</span>
                <span>·</span>
                <span>Alvo: {g.target_value}</span>
                {g.target_plan && <><span>·</span><span>{PLAN_LABEL[g.target_plan] ?? g.target_plan}</span></>}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {fmt(g.start_date)}{g.end_date ? ` → ${fmt(g.end_date)}` : ''}
              </p>
            </div>
            <button onClick={async () => { await adminPost('delete_goal', { id: g.id }); goalsQ.reload(); }}
              className="text-slate-500 hover:text-red-400 shrink-0" aria-label="Excluir meta">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {goalsQ.data?.length === 0 && <p className="text-slate-500 text-sm text-center py-8">Nenhuma meta criada ainda.</p>}
      </div>
    </div>
  );
}

// ─── Broadcast (recurso próprio do Performance Dashboard) ─────────────────────

function BroadcastTab() {
  const [broadcastPlan, setBroadcastPlan] = useState<'all' | 'grafico' | 'panorama'>('all');
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastSubject.trim() || !broadcastMessage.trim()) return;
    setSending(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug: broadcastPlan, subject: broadcastSubject, message: broadcastMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro no broadcast');
      setMsg({ type: 'success', text: `✅ Broadcast enviado: ${data.sent} sucesso(s), ${data.failed} falha(s).` });
      setBroadcastSubject('');
      setBroadcastMessage('');
    } catch (e) {
      setMsg({ type: 'error', text: `❌ ${e instanceof Error ? e.message : 'Erro'}` });
    } finally { setSending(false); }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3 max-w-2xl">
      <p className="text-sm font-semibold text-white">Broadcast de Email</p>
      <p className="text-xs text-slate-500">Envie uma mensagem para todos os assinantes de um plano.</p>
      {msg && <Feedback type={msg.type}>{msg.text}</Feedback>}
      <form onSubmit={send} className="space-y-3">
        <select value={broadcastPlan} onChange={(e) => setBroadcastPlan(e.target.value as 'all' | 'grafico' | 'panorama')}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
          <option value="all">Todos os planos</option>
          <option value="grafico">Gráfico</option>
          <option value="panorama">Panorama</option>
        </select>
        <input value={broadcastSubject} onChange={(e) => setBroadcastSubject(e.target.value)}
          placeholder="Assunto" required
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        <textarea value={broadcastMessage} onChange={(e) => setBroadcastMessage(e.target.value)}
          placeholder="Mensagem" rows={5} required
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y" />
        <button type="submit" disabled={sending || !broadcastSubject.trim() || !broadcastMessage.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-bold text-white disabled:opacity-50">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Enviando…' : 'Enviar Broadcast'}
        </button>
      </form>
    </div>
  );
}