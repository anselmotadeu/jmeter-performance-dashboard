/**
 * plans.ts — Planos do JMeter Performance Dashboard
 *
 * Governance V6 §6.2 (inviolável):
 *   - Plano Gráfico:  R$ 49/mês | 50 análises/mês
 *   - Plano Panorama: R$ 149/mês | 250 análises/mês
 *
 * Padrão EstilOS/TestDiff.
 */

export type PlanSlug = 'grafico' | 'panorama';

export interface PlanLimits {
  maxMonthlyAnalyses: number;
  exportPDF: boolean;
  exportPNG: boolean;
  comparativeRuns: boolean;
  advancedCharts: boolean;
}

export interface Plan {
  id: string;
  slug: PlanSlug;
  name: string;
  description: string;
  priceCents: number;
  limits: PlanLimits;
  stripePriceId?: string;
}

export const GRAFICO: Plan = {
  id: 'grafico-plan-id',
  slug: 'grafico',
  name: 'Gráfico',
  description: 'Visualização essencial de performance — para times que precisam de clareza',
  priceCents: 4900,
  limits: {
    maxMonthlyAnalyses: 50,
    exportPDF: false,
    exportPNG: false,
    comparativeRuns: false,
    advancedCharts: false,
  },
  stripePriceId: process.env.STRIPE_PRICE_GRAFICO_ID,
};

export const PANORAMA: Plan = {
  id: 'panorama-plan-id',
  slug: 'panorama',
  name: 'Panorama',
  description: 'Visão completa de performance — análise avançada, comparativo e exportação',
  priceCents: 14900,
  limits: {
    maxMonthlyAnalyses: 250,
    exportPDF: true,
    exportPNG: true,
    comparativeRuns: true,
    advancedCharts: true,
  },
  stripePriceId: process.env.STRIPE_PRICE_PANORAMA_ID,
};

export const PLANS: Record<PlanSlug, Plan> = {
  grafico: GRAFICO,
  panorama: PANORAMA,
};

export const PLAN_LIST = [GRAFICO, PANORAMA];

export function getPlanBySlug(slug: string): Plan {
  return PLANS[slug as PlanSlug] ?? GRAFICO;
}

export function getPlanByStripePrice(priceId: string): Plan | undefined {
  return PLAN_LIST.find(p => p.stripePriceId === priceId);
}
