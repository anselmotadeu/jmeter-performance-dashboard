import type { AnalysisResult, CheckResult, PerformanceParser, ThresholdResult } from './types';

type Values = Record<string, number>;
type LegacyMetric = { values?: Values; thresholds?: Record<string, { ok?: boolean }> };

function metricValues(metrics: Record<string, LegacyMetric>, name: string): Values {
  return metrics[name]?.values ?? {};
}

function collectLegacyChecks(group: unknown, result: CheckResult[] = []): CheckResult[] {
  if (!group || typeof group !== 'object') return result;
  const value = group as { checks?: Record<string, { name?: string; passes?: number; fails?: number }> | Array<{ name?: string; passes?: number; fails?: number }>; groups?: Record<string, unknown> | unknown[] };
  for (const [key, check] of Object.entries(value.checks ?? {})) {
    result.push({ name: check.name ?? key, passes: check.passes ?? 0, fails: check.fails ?? 0 });
  }
  for (const child of Object.values(value.groups ?? {})) collectLegacyChecks(child, result);
  return result;
}

function makeResult(input: {
  framework: string;
  sourceFormat: string;
  count: number;
  errors: number;
  durationMs: number;
  generatedAt?: string;
  duration: Values;
  checks: CheckResult[];
  thresholds: ThresholdResult[];
}): AnalysisResult {
  const endTimestamp = input.generatedAt ? Date.parse(input.generatedAt) : null;
  const validEnd = endTimestamp !== null && Number.isFinite(endTimestamp) ? endTimestamp : null;
  const startTimestamp = validEnd !== null && input.durationMs > 0 ? validEnd - input.durationMs : null;
  const average = input.duration.avg ?? 0;
  const min = input.duration.min ?? null;
  const max = input.duration.max ?? null;
  const p90 = input.duration['p(90)'] ?? input.duration.p90 ?? null;
  const p95 = input.duration['p(95)'] ?? input.duration.p95 ?? null;
  const p99 = input.duration['p(99)'] ?? input.duration.p99 ?? null;

  return {
    schemaVersion: 2,
    framework: input.framework,
    sourceFormat: input.sourceFormat,
    dataQuality: 'certified',
    capabilities: {
      requestSamples: false, timeSeries: false, activeUsers: false, responseTime: true,
      waitingTime: false, networkBytes: false, checks: input.checks.length > 0,
      thresholds: input.thresholds.length > 0, errors: true,
    },
    diagnostics: [
      'Summary agregado: gráficos temporais e ramp-up não estão disponíveis.',
      ...(p90===null ? ['P90 não foi exportado pelo k6 e será exibido como indisponível.'] : []),
      ...(p95===null ? ['P95 não foi exportado pelo k6 e será exibido como indisponível.'] : []),
      ...(p99===null ? ['P99 não foi exportado pelo k6 e será exibido como indisponível.'] : []),
    ],
    successCount: Math.max(0, input.count - input.errors),
    errorCount: input.errors,
    startTime: startTimestamp === null ? '' : new Date(startTimestamp).toISOString(),
    endTime: validEnd === null ? '' : new Date(validEnd).toISOString(),
    startTimestamp,
    endTimestamp: validEnd,
    durationMs: input.durationMs,
    rampUpInfo: { users: 0, usersPerTest: 0, duration: '0s' },
    aggregateReport: [{
      label: 'Geral', average, median: input.duration.med ?? average, p90, p95, p99, min, max,
      errorRate: input.count ? Number(((input.errors / input.count) * 100).toFixed(2)) : 0,
      throughput: input.durationMs ? Number((input.count / (input.durationMs / 1000)).toFixed(2)) : 0,
      count: input.count, averageLatency: null, medianLatency: null, p90Latency: null,
      p95Latency: null, p99Latency: null, bytes: null, sentBytes: null,
    }],
    timeSeriesData: [],
    heatmaps: [],
    phaseStats: [],
    errorDetails: input.errors ? [{ code: 'K6', message: 'Requisições marcadas como falhas no summary.', count: input.errors }] : [],
    labels: ['Geral'],
    checks: input.checks,
    thresholds: input.thresholds,
  };
}

export const k6SummaryParser: PerformanceParser = {
  name: 'k6-summary',
  displayName: 'k6 Summary',
  supportedExtensions: ['.json'],
  dataQuality: 'certified',

  detect(sample) {
    const normalized = sample.replace(/^\uFEFF/, '').trim();
    return (
      normalized.startsWith('{') &&
      ((normalized.includes('"state"') && normalized.includes('"metrics"') && normalized.includes('http_req_duration')) ||
        (normalized.includes('"version"') && normalized.includes('"metadata"') && normalized.includes('"results"')))
    );
  },

  parse(content) {
    const data = JSON.parse(content.replace(/^\uFEFF/, '')) as Record<string, unknown>;
    if (data.results && typeof data.results === 'object') {
      const results = data.results as { metrics?: Array<{ name?: string; values?: Values; thresholds?: Array<{ expression?: string; passed?: boolean }> }>; checks?: { results?: Array<{ name?: string; passes?: number; fails?: number }> } };
      const metrics = results.metrics ?? [];
      const byName = new Map(metrics.map((metric) => [metric.name, metric]));
      const requests = byName.get('http_reqs')?.values ?? {};
      const failures = byName.get('http_req_failed')?.values ?? {};
      const duration = byName.get('http_req_duration')?.values ?? {};
      const count = Math.round(requests.count ?? 0);
      const errors = failures.matches !== undefined ? Math.round(failures.matches) : failures.passes !== undefined ? Math.round(failures.passes) : Math.round(count * (failures.rate ?? failures.value ?? 0));
      const metadata = data.metadata as { generatedAt?: string } | undefined;
      const config = data.config as { duration?: number } | undefined;
      const thresholds = metrics.flatMap((metric) => (metric.thresholds ?? []).map((threshold) => ({ metric: metric.name ?? 'metric', expression: threshold.expression ?? '', passed: threshold.passed !== false })));
      const checks = (results.checks?.results ?? []).map((check) => ({ name: check.name ?? 'Check', passes: check.passes ?? 0, fails: check.fails ?? 0 }));
      return makeResult({ framework: 'k6', sourceFormat: 'k6-summary-v1', count, errors, durationMs: Number(config?.duration ?? 0) * 1000, generatedAt: metadata?.generatedAt, duration, checks, thresholds });
    }

    const metrics = (data.metrics ?? {}) as Record<string, LegacyMetric>;
    const requests = metricValues(metrics, 'http_reqs');
    const failures = metricValues(metrics, 'http_req_failed');
    const count = Math.round(requests.count ?? 0);
    const errors = failures.passes !== undefined ? Math.round(failures.passes) : Math.round(count * (failures.rate ?? failures.value ?? 0));
    const thresholds = Object.entries(metrics).flatMap(([metric, definition]) => Object.entries(definition.thresholds ?? {}).map(([expression, threshold]) => ({ metric, expression, passed: threshold.ok !== false })));
    const state = data.state as { testRunDurationMs?: number } | undefined;
    return makeResult({
      framework: 'k6', sourceFormat: 'k6-summary-legacy', count, errors,
      durationMs: Number(state?.testRunDurationMs ?? 0),
      duration: metricValues(metrics, 'http_req_duration'),
      checks: collectLegacyChecks(data.root_group), thresholds,
    });
  },
};
