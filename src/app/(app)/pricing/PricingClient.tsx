'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Zap, Loader2, AlertCircle, ArrowUpCircle, ArrowDownCircle, AlertTriangle, X } from 'lucide-react';
import type { Plan } from '@/lib/plans';
import type { PlanSlug } from '@/lib/plans';
import PortalButton from './PortalButton';

interface PricingPlan extends Plan {
  isCurrent: boolean;
  priceFormatted: string;
}

interface Props {
  plans: PricingPlan[];
  currentPlanSlug: PlanSlug | null;
  isCanceledScheduled?: boolean;
  accessExpiresAt?: string | null;
}

function Modal({ title, icon, onClose, children, footer }: {
  title: string; icon: React.ReactNode; onClose: () => void;
  children: React.ReactNode; footer: React.ReactNode;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 font-bold text-sm">{icon}{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-slate-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 text-sm text-slate-300">{children}</div>
        <div className="flex gap-3 mt-5">{footer}</div>
      </div>
    </div>
  );
}

export default function PricingClient({ plans, currentPlanSlug, isCanceledScheduled = false, accessExpiresAt = null }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReactivateModal, setShowReactivateModal] = useState<{ type: 'upgrade' | 'downgrade'; slug: PlanSlug } | null>(null);
  const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  const router = useRouter();

  async function handleCheckout(planSlug: string) {
    setLoading(planSlug);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar checkout');
      }
      if (data.url) { window.location.assign(data.url); return; }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao processar checkout. Tente novamente.');
    } finally {
      setLoading(null);
    }
  }

  async function executeChange(endpoint: string, planSlug: string, reactivate?: boolean) {
    setLoading(planSlug);
    setError(null);
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug, ...(reactivate ? { reactivate: true } : {}) }),
      });
      const json = await r.json();

      if (json.requiresReactivation) {
        const type = endpoint.includes('upgrade') ? 'upgrade' : 'downgrade';
        setShowReactivateModal({ type, slug: planSlug as PlanSlug });
        return;
      }

      if (!r.ok) throw new Error(json.error || 'Erro ao processar');
      if (json.url) { window.location.assign(json.url); return; }
      router.push('/minha-conta');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao processar. Tente novamente.');
    } finally {
      setLoading(null);
    }
  }

  const grafico = plans.find((p) => p.slug === 'grafico');
  const panorama = plans.find((p) => p.slug === 'panorama');

  if (!grafico || !panorama) {
    return <div role="status" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Erro ao carregar planos</div>;
  }

  const isDisabled = loading !== null;

  function requestChange(type: 'upgrade' | 'downgrade', slug: PlanSlug) {
    if (isCanceledScheduled) {
      setShowReactivateModal({ type, slug });
      return;
    }
    if (type === 'upgrade') setShowUpgradeConfirm(true);
    else setShowDowngradeConfirm(true);
  }

  function renderButton(plan: PricingPlan) {
    const slug = plan.slug as PlanSlug;
    const isCurrentPlan = currentPlanSlug === slug;

    if (isCurrentPlan) {
      return (
        <div className="space-y-2">
          <div className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-indigo-300 font-bold text-indigo-600 dark:border-indigo-600 dark:text-indigo-400">
            <Check className="h-4 w-4" /> Plano atual
          </div>
          <PortalButton />
        </div>
      );
    }

    if (currentPlanSlug === 'grafico' && slug === 'panorama') {
      return (
        <button
          onClick={() => requestChange('upgrade', 'panorama')}
          disabled={isDisabled}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 font-bold text-white shadow-lg hover:from-indigo-700 hover:to-cyan-700 disabled:opacity-50"
        >
          {loading === slug ? <><Loader2 className="h-4 w-4 animate-spin" />Processando...</> : <><ArrowUpCircle className="h-4 w-4" />Upgrade para Panorama</>}
        </button>
      );
    }

    if (currentPlanSlug === 'panorama' && slug === 'grafico') {
      return (
        <button
          onClick={() => requestChange('downgrade', 'grafico')}
          disabled={isDisabled}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          {loading === slug ? <><Loader2 className="h-4 w-4 animate-spin" />Processando...</> : <><ArrowDownCircle className="h-4 w-4" />Downgrade para Gráfico</>}
        </button>
      );
    }

    return (
      <button
        onClick={() => handleCheckout(slug)}
        disabled={isDisabled}
        className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl font-bold text-white shadow disabled:opacity-50 ${slug === 'panorama' ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700 shadow-lg' : 'bg-indigo-600 hover:bg-indigo-700'}`}
      >
        {loading === slug ? <><Loader2 className="h-4 w-4 animate-spin" />Processando...</> : <><Zap className="h-4 w-4" />Assinar agora</>}
      </button>
    );
  }

  const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : null;

  return (
    <>
      {showUpgradeConfirm && (
        <Modal title="Confirmar upgrade para Panorama" icon={<ArrowUpCircle className="h-5 w-5 text-amber-400" />} onClose={() => setShowUpgradeConfirm(false)}
          footer={
            <>
              <button onClick={() => setShowUpgradeConfirm(false)} className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">Cancelar</button>
              <button onClick={() => { setShowUpgradeConfirm(false); executeChange('/api/subscription/upgrade', 'panorama'); }}
                disabled={loading !== null} className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {loading ? 'Redirecionando...' : 'Confirmar e ir para pagamento →'}
              </button>
            </>
          }>
          <p>O upgrade entra em vigor <strong className="text-white">imediatamente</strong> após o pagamento.</p>
          <p>Você pagará apenas a <strong className="text-white">diferença proporcional</strong> dos dias restantes no ciclo atual.</p>
          <div className="rounded-xl bg-slate-800/50 border border-slate-700 px-3 py-2">
            <p className="text-slate-400 text-xs">Você será redirecionado para o Stripe para confirmar o pagamento.</p>
          </div>
        </Modal>
      )}

      {showDowngradeConfirm && (
        <Modal title="Confirmar downgrade para Gráfico" icon={<ArrowDownCircle className="h-5 w-5 text-orange-400" />} onClose={() => setShowDowngradeConfirm(false)}
          footer={
            <>
              <button onClick={() => setShowDowngradeConfirm(false)} className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">Cancelar</button>
              <button onClick={() => { setShowDowngradeConfirm(false); executeChange('/api/subscription/downgrade', 'grafico'); }}
                disabled={loading !== null} className="flex-1 rounded-xl bg-orange-500/20 border border-orange-500/40 hover:bg-orange-500/30 py-2.5 text-sm font-bold text-orange-300 disabled:opacity-50">
                {loading ? 'Agendando...' : 'Confirmar downgrade'}
              </button>
            </>
          }>
          <p>Você continua com acesso ao plano atual até o fim do ciclo.</p>
          <p>A partir da próxima vigência, o plano <strong className="text-white">Gráfico (R$49/mês)</strong> passará a vigorar.</p>
          <p className="font-medium text-orange-400">Não há reembolso do período já pago.</p>
        </Modal>
      )}

      {showReactivateModal && (
        <Modal
          title={`Reativar e fazer ${showReactivateModal.type === 'upgrade' ? 'upgrade' : 'downgrade'}?`}
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
          onClose={() => setShowReactivateModal(null)}
          footer={
            <>
              <button onClick={() => setShowReactivateModal(null)} className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">Cancelar</button>
              <button
                onClick={() => {
                  const m = showReactivateModal;
                  setShowReactivateModal(null);
                  executeChange(`/api/subscription/${m.type}`, m.slug, true);
                }}
                disabled={loading !== null}
                className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {loading ? 'Processando...' : 'Reativar e continuar →'}
              </button>
            </>
          }>
          <p>Você tem um <strong className="text-white">cancelamento agendado</strong>
            {accessExpiresAt ? <> para <strong className="text-white">{formatDate(accessExpiresAt)}</strong></> : ''}.
          </p>
          <p>Se prosseguir, sua assinatura será <strong className="text-white">reativada automaticamente</strong> e você será levado para{' '}
            {showReactivateModal.type === 'upgrade' ? 'o Stripe para pagar a diferença proporcional' : 'confirmar o downgrade'}.
          </p>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2">
            <p className="text-amber-300 text-xs">Se quiser manter o cancelamento, clique em Cancelar.</p>
          </div>
        </Modal>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 mb-6">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 max-w-4xl mx-auto">
        {plans.map((plan) => (
          <div
            key={plan.slug}
            className={`relative rounded-2xl border-2 bg-white p-8 shadow-sm transition dark:bg-slate-900 ${
              plan.isCurrent
                ? 'border-indigo-500'
                : plan.slug === 'panorama'
                ? 'border-indigo-500 hover:shadow-lg'
                : 'border-slate-200 hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:hover:border-indigo-600'
            }`}
          >
            {plan.isCurrent && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-bold text-white">
                Plano atual
              </div>
            )}
            {currentPlanSlug !== 'panorama' && plan.slug === 'panorama' && (
              <div className="absolute -top-3 right-6 rounded-full bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-1 text-xs font-bold text-white shadow-lg">
                Mais popular
              </div>
            )}

            <div className="mb-6">
              <h2 className="text-2xl font-black">{plan.name}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{plan.description}</p>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-black">{plan.priceFormatted}</span>
              <span className="text-slate-500">/mês</span>
            </div>

            <ul className="mb-8 space-y-3">
              <li className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <span className="text-sm font-medium">{plan.limits.maxMonthlyAnalyses} análises/mês</span>
              </li>
              {plan.limits.advancedCharts && (
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <span className="text-sm font-medium">Gráficos avançados</span>
                </li>
              )}
              {plan.limits.exportPDF && (
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <span className="text-sm font-medium">Exportar PDF</span>
                </li>
              )}
              {plan.limits.exportPNG && (
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <span className="text-sm font-medium">Exportar PNG</span>
                </li>
              )}
              {plan.limits.comparativeRuns && (
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <span className="text-sm font-medium">Comparativo de runs</span>
                </li>
              )}
              <li className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <span className="text-sm">Suporte por email</span>
              </li>
            </ul>

            {renderButton(plan)}
          </div>
        ))}
      </div>
    </>
  );
}
