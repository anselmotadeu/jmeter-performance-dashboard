/**
 * plans.ts — Planos do Performance Dashboard
 * Monitor: R$79/mês, 50 análises/mês
 * Radar:   R$149/mês, 250 análises/mês
 * Padrão EstilOS/TestDiff.
 */

export type PlanSlug = 'monitor' | 'radar';

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

export const MONITOR: Plan = {
  id: 'monitor-plan-id',
  slug: 'monitor',
  name: 'Monitor',
  description: 'Monitoramento essencial de performance',
  priceCents: 7900,
  limits: {
    maxMonthlyAnalyses: 50,
    exportPDF: false,
    exportPNG: false,
    comparativeRuns: false,
    advancedCharts: false,
  },
  stripePriceId: process.env.STRIPE_PRICE_MONITOR_ID,
};

export const RADAR: Plan = {
  id: 'radar-plan-id',
  slug: 'radar',
  name: 'Radar',
  description: 'Visão completa de performance',
  priceCents: 14900,
  limits: {
    maxMonthlyAnalyses: 250,
    exportPDF: true,
    exportPNG: true,
    comparativeRuns: true,
    advancedCharts: true,
  },
  stripePriceId: process.env.STRIPE_PRICE_RADAR_ID,
};

export const PLANS: Record<PlanSlug, Plan> = {
  monitor: MONITOR,
  radar: RADAR,
};

export const PLAN_LIST = [MONITOR, RADAR];

export function getPlanBySlug(slug: string): Plan {
  return PLANS[slug as PlanSlug] ?? MONITOR;
}

export function getPlanByStripePrice(priceId: string): Plan | undefined {
  return PLAN_LIST.find(p => p.stripePriceId === priceId);
}
