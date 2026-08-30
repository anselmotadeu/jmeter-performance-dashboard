import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { PLAN_LIST, type PlanSlug } from '@/lib/plans';
import { getSubscriptionDetail } from '@/lib/subscription';
import PricingClient from './PricingClient';

export default async function PricingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const detail = session ? await getSubscriptionDetail(session.user.id) : null;

  const currentPlanSlug = (detail?.subscription?.status === 'active' ? detail.subscription.planSlug : null) as PlanSlug | null;
  const isCanceledScheduled = detail?.isCanceledScheduled ?? false;
  const accessExpiresAt = detail?.accessExpiresAt ?? null;

  const plans = PLAN_LIST.map((plan) => ({
    ...plan,
    isCurrent: currentPlanSlug === plan.slug,
    priceFormatted: `R$${(plan.priceCents / 100).toFixed(0)}`,
  }));

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Escolha seu plano</h1>
        <p className="text-lg text-slate-500">
          7 dias grátis para testar todos os recursos do Panorama
        </p>
      </div>

      <PricingClient
        plans={plans}
        currentPlanSlug={currentPlanSlug}
        isCanceledScheduled={isCanceledScheduled}
        accessExpiresAt={accessExpiresAt}
      />

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
