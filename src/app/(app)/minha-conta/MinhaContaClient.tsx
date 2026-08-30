'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Crown, Zap, AlertCircle, CheckCircle2, Clock,
  Loader2, XCircle, ExternalLink, AlertTriangle, ArrowUpRight, ArrowDownRight, Ban,
} from 'lucide-react';

/**
 * MinhaContaClient — JMeter Performance Dashboard
 * Espelho do TestDiff MinhaContaClient, adaptado para indigo-600 e planos Gráfico/Panorama.
 * Governance V6: zero window.alert — todos os erros são banners inline role="alert".
 */

interface SubscriptionDetail {
  subscription: {
    id: string; status: string; planName: string; planSlug: string; priceCents: number;
    currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean;
    cancelAt: string | null; canceledAt: string | null;
    pendingDowngradePlan: string | null; pendingDowngradeDate: string | null;
    maxMonthlyAnalyses: number;
  } | null;
  isTrial: boolean; trialDaysLeft: number; isExpired: boolean;
  isCanceled: boolean; isCanceledScheduled: boolean; accessExpiresAt: string | null;
}

const PLAN_LABELS: Record<string, string> = { grafico: 'Gráfico', panorama: 'Panorama' };

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function formatBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export default function MinhaContaClient({ userName, userEmail }: { userName: string; userEmail: string }) {
  const [data, setData] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState<{ action: 'upgrade' | 'downgrade'; planSlug: string } | null>(null);

  const loadDetail = useCallback(() => {
    setLoading(true);
    fetch('/api/subscription/detail')
      .then(r => r.json())
      .then(setData)
      .catch(() => setFeedback({ type: 'error', msg: 'Erro ao carregar dados da assinatura.' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDetail();
    // Verificar parâmetros de retorno do Stripe (lidos de forma segura fora do ciclo de render)
    const params = new URLSearchParams(window.location.search);
    const upgradeParam = params.get('upgrade');
    if (upgradeParam === 'success') {
      // Usar setTimeout para evitar setState síncrono no corpo do effect
      setTimeout(() => setFeedback({ type: 'success', msg: 'Upgrade realizado com sucesso! O plano será atualizado em instantes.' }), 0);
    } else if (upgradeParam === 'canceled') {
      setTimeout(() => setFeedback({ type: 'error', msg: 'Upgrade cancelado. Nenhuma cobrança foi realizada.' }), 0);
    }
  }, [loadDetail]);

  async function callApi(url: string, body: object, successMsg: string) {
    setActionLoading(url);
    setFeedback(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json() as { url?: string; success?: boolean; error?: string; requiresReactivation?: boolean; isCanceledScheduled?: boolean; message?: string };
      if (data.isCanceledScheduled && data.requiresReactivation) {
        // Exibir modal de reativação
        const action = url.includes('upgrade') ? 'upgrade' : 'downgrade';
        const slug = (body as { planSlug?: string }).planSlug ?? '';
        setShowReactivateModal({ action, planSlug: slug });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
      if (data.url) { window.location.href = data.url; return; }
      setFeedback({ type: 'success', msg: data.message || successMsg });
      loadDetail();
    } catch (err) {
      setFeedback({ type: 'error', msg: err instanceof Error ? err.message : 'Erro ao processar a solicitação.' });
    } finally {
      setActionLoading(null);
      setShowCancelConfirm(false);
    }
  }

  async function handleUpgrade(planSlug: string, reactivate = false) {
    await callApi('/api/subscription/upgrade', { planSlug, reactivate }, 'Upgrade realizado com sucesso!');
  }

  async function handleDowngrade(planSlug: string, reactivate = false) {
    await callApi('/api/subscription/downgrade', { planSlug, reactivate }, 'Downgrade agendado com sucesso.');
  }

  async function handleCancel() {
    await callApi('/api/subscription/cancel', {}, 'Cancelamento agendado. Você mantém o acesso até o fim do ciclo.');
  }

  async function handlePortal() {
    setActionLoading('portal');
    try {
      const res = await fetch('/api/portal', { method: 'POST' });
      const d = await res.json() as { url?: string; error?: string };
      if (!res.ok || !d.url) throw new Error(d.error || 'Erro ao abrir portal');
      window.location.href = d.url;
    } catch (err) {
      setFeedback({ type: 'error', msg: err instanceof Error ? err.message : 'Erro ao abrir portal.' });
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;
  }

  const sub = data?.subscription;
  const isTrial = data?.isTrial ?? false;
  const trialDaysLeft = data?.trialDaysLeft ?? 0;
  const isExpired = data?.isExpired ?? false;
  const isCanceled = data?.isCanceled ?? false;
  const isCanceledScheduled = data?.isCanceledScheduled ?? false;
  const accessExpiresAt = data?.accessExpiresAt ?? null;

  const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    active: { label: 'Ativo', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400', icon: CheckCircle2 },
    trialing: { label: `Trial — ${trialDaysLeft}d restantes`, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 dark:text-indigo-400', icon: Clock },
    past_due: { label: 'Pagamento pendente', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400', icon: AlertCircle },
    canceled: { label: 'Cancelado', color: 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400', icon: XCircle },
    unpaid: { label: 'Não pago', color: 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400', icon: XCircle },
  };
  const statusInfo = statusConfig[sub?.status ?? ''] ?? { label: 'Sem plano', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800', icon: AlertCircle };
  const StatusIcon = statusInfo.icon;

  const isGrafico = sub?.planSlug === 'grafico';
  const isPanorama = sub?.planSlug === 'panorama';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Minha Conta</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Assinatura, planos e histórico de pagamentos</p>
      </div>

      {/* Feedback inline — zero window.alert (Governance V6) */}
      {feedback && (
        <div role="alert" className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'}`}>
          {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span className="flex-1">{feedback.msg}</span>
          <button onClick={() => setFeedback(null)} className="shrink-0 opacity-60 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      )}

      {/* Trial expirado / cancelado — Paywall */}
      {(isExpired || isCanceled) && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-950/30">
          <div className="flex items-center gap-3">
            <XCircle className="h-6 w-6 text-red-500 shrink-0" />
            <div>
              <p className="font-bold text-red-700 dark:text-red-300">{isCanceled ? 'Assinatura cancelada' : 'Período de teste encerrado'}</p>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{isCanceled ? 'Reative sua assinatura para continuar.' : 'Escolha um plano para continuar usando o JMeter Dashboard.'}</p>
            </div>
          </div>
          <Link href="/pricing" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">
            <Crown className="h-4 w-4" /> {isCanceled ? 'Reativar assinatura' : 'Ver planos'}
          </Link>
        </div>
      )}

      {/* Card do plano */}
      {sub && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Plano atual</p>
              <h2 className="mt-1 text-xl font-black">{sub.planName}</h2>
              {!isTrial && <p className="mt-0.5 text-sm text-slate-500">{formatBRL(sub.priceCents)}/mês</p>}
            </div>
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${statusInfo.color}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              {isCanceledScheduled ? 'Cancelamento agendado' : statusInfo.label}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-400">{isCanceled ? 'Acesso encerrado em' : isCanceledScheduled ? 'Acesso até' : 'Renova em'}</p>
              <p className="mt-1 font-bold text-sm">{formatDate(isCanceled || isCanceledScheduled ? accessExpiresAt : sub.currentPeriodEnd)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-400">Análises/mês</p>
              <p className="mt-1 font-bold text-sm">{sub.maxMonthlyAnalyses}</p>
            </div>
          </div>

          {/* Trial — últimos 3 dias */}
          {isTrial && !isExpired && (
            <div className={`mt-4 rounded-xl border p-3 ${trialDaysLeft <= 3 ? 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30' : 'border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30'}`}>
              <p className={`text-sm ${trialDaysLeft <= 3 ? 'text-amber-700 dark:text-amber-300' : 'text-indigo-700 dark:text-indigo-300'}`}>
                {trialDaysLeft <= 3
                  ? <><AlertTriangle className="inline h-4 w-4 mr-1 mb-0.5" /><strong>{trialDaysLeft} dia{trialDaysLeft !== 1 ? 's' : ''} restante{trialDaysLeft !== 1 ? 's' : ''}</strong> no período de teste.</>
                  : <><strong>Período de teste</strong> — {trialDaysLeft} dias restantes com acesso completo.</>
                }
              </p>
            </div>
          )}

          {/* Cancelamento agendado */}
          {isCanceledScheduled && !isCanceled && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                <span className="font-bold">Cancelamento agendado</span> — acesso mantido até <strong>{formatDate(accessExpiresAt)}</strong>.
              </p>
            </div>
          )}

          {/* Downgrade pendente */}
          {sub.pendingDowngradePlan && sub.pendingDowngradeDate && (
            <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950/30">
              <p className="text-sm text-orange-700 dark:text-orange-300">
                <span className="font-bold">Downgrade para {PLAN_LABELS[sub.pendingDowngradePlan] ?? sub.pendingDowngradePlan}</span>{' '}
                agendado para {formatDate(sub.pendingDowngradeDate)}. Você continua com o plano atual até lá.
              </p>
            </div>
          )}

          {/* Ações — Upgrade / Downgrade / Cancelar */}
          {sub.status === 'active' && !isCanceled && (
            <div className="mt-6 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Gerenciar plano</p>
              <div className="flex flex-wrap gap-2">
                {isGrafico && (
                  <button
                    onClick={() => handleUpgrade('panorama')}
                    disabled={!!actionLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {actionLoading === '/api/subscription/upgrade' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                    Upgrade para Panorama
                  </button>
                )}
                {isPanorama && (
                  <button
                    onClick={() => handleDowngrade('grafico')}
                    disabled={!!actionLoading}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    {actionLoading === '/api/subscription/downgrade' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownRight className="h-4 w-4" />}
                    Downgrade para Gráfico
                  </button>
                )}
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={!!actionLoading || isCanceledScheduled}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30 disabled:opacity-50"
                >
                  <Ban className="h-4 w-4" />
                  {isCanceledScheduled ? 'Cancelamento já agendado' : 'Cancelar assinatura'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmação de cancelamento */}
      {showCancelConfirm && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h3 className="text-lg font-bold">Cancelar assinatura?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Você mantém o acesso até o fim do ciclo atual. Nenhum reembolso será gerado por período parcial.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleCancel}
                disabled={!!actionLoading}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === '/api/subscription/cancel' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Confirmar cancelamento'}
              </button>
              <button onClick={() => setShowCancelConfirm(false)} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800">Manter plano</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de reativação (usuário tentou upgrade/downgrade com cancelamento agendado) */}
      {showReactivateModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h3 className="text-lg font-bold">Reativar assinatura?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Sua assinatura tem um cancelamento agendado. Para fazer o {showReactivateModal.action === 'upgrade' ? 'upgrade' : 'downgrade'},
              o cancelamento será removido e sua assinatura continuará normalmente.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  const m = showReactivateModal;
                  setShowReactivateModal(null);
                  if (m.action === 'upgrade') handleUpgrade(m.planSlug, true);
                  else handleDowngrade(m.planSlug, true);
                }}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
              >
                Reativar e {showReactivateModal.action === 'upgrade' ? 'fazer upgrade' : 'agendar downgrade'}
              </button>
              <button onClick={() => setShowReactivateModal(null)} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Sem assinatura */}
      {!sub && !isExpired && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
          <Crown className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-bold text-slate-700 dark:text-slate-300">Nenhum plano ativo</p>
          <p className="mt-1 text-sm text-slate-400">Escolha um plano para usar o JMeter Dashboard</p>
          <Link href="/pricing" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
            <Zap className="h-4 w-4" /> Ver planos
          </Link>
        </div>
      )}

      {/* Histórico de faturas via Stripe Portal */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <button
          onClick={handlePortal}
          disabled={!!actionLoading}
          className="flex w-full items-center justify-between gap-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            {actionLoading === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-5 w-5" />}
            Ver faturas e gerenciar cartão de pagamento
          </div>
        </button>
      </div>

      {/* Suporte */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <a
          href={`mailto:suporte@anstech.com.br?subject=${encodeURIComponent(`[JMeter Dashboard${sub?.planSlug === 'panorama' ? ' Panorama' : ''}] Suporte`)}`}
          className="flex items-center justify-between gap-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          <div>
            <div>Falar com o suporte{sub?.planSlug === 'panorama' ? ' prioritário' : ''}</div>
            <div className="mt-1 text-xs font-normal text-slate-500">suporte@anstech.com.br</div>
          </div>
        </a>
      </div>

      {/* Info do usuário */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Conta</p>
        <p className="text-sm font-semibold">{userName || '—'}</p>
        <p className="text-xs text-slate-500">{userEmail}</p>
      </div>
    </div>
  );
}
