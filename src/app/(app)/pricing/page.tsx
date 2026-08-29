import { headers } from 'next/headers';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { auth } from '@/lib/auth';
import { PLAN_LIST, type Plan } from '@/lib/plans';
import { getActiveSubscription } from '@/lib/subscription';
import CheckoutButton from './CheckoutButton';
import PortalButton from './PortalButton';

export default async function PricingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const subscription = session ? await getActiveSubscription(session.user.id) : null;
  const currentPlan = subscription?.planSlug || null;

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Escolha seu plano</h1>
        <p className="text-lg text-slate-500">
          7 dias grátis para testar todos os recursos do Panorama
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {PLAN_LIST.map((plan: Plan) => {
          const isCurrentPlan = currentPlan === plan.slug;

          return (
            <div
              key={plan.slug}
              className={`relative rounded-2xl border-2 p-8 transition-all hover:shadow-xl ${
                isCurrentPlan
                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/20'
                  : 'border-slate-200 hover:border-indigo-300 dark:border-slate-800'
              }`}
            >
              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                  Plano Atual
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">{plan.name}</h2>
                <p className="text-slate-500 text-sm">{plan.description}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">
                    R${(plan.priceCents / 100).toFixed(0)}
                  </span>
                  <span className="text-slate-500">/mês</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>{plan.limits.maxMonthlyAnalyses}</strong> análises/mês
                  </span>
                </li>
                {plan.limits.advancedCharts && (
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <span>Gráficos avançados (todos os tipos)</span>
                  </li>
                )}
                {plan.limits.exportPDF && (
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <span>Exportar PDF</span>
                  </li>
                )}
                {plan.limits.exportPNG && (
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <span>Exportar PNG</span>
                  </li>
                )}
                {plan.limits.comparativeRuns && (
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <span>Comparativo de runs</span>
                  </li>
                )}
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                  <span>Suporte por email</span>
                </li>
              </ul>

              {isCurrentPlan ? (
                <button
                  disabled
                  className="w-full rounded-xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-400 cursor-not-allowed"
                >
                  Plano Atual
                </button>
              ) : (
                <CheckoutButton
                  planSlug={plan.slug}
                  isLoggedIn={!!session}
                  hasCurrentPlan={!!currentPlan}
                />
              )}
            </div>
          );
        })}
      </div>

      {currentPlan && (
        <div className="text-center mt-12">
          <PortalButton />
        </div>
      )}

      <div className="text-center mt-12 text-sm text-slate-500">
        <p>Todos os planos incluem:</p>
        <ul className="inline-flex flex-wrap justify-center gap-4 mt-2">
          <li>✓ Suporte a JMeter, K6, Locust, Artillery, Gatling, Vegeta</li>
          <li>✓ Dashboard interativo</li>
          <li>✓ Armazenamento seguro</li>
        </ul>
      </div>
    </div>
  );
}
