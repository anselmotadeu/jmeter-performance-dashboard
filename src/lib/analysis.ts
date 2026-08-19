import type { AnalysisCapabilities, AnalysisResult, TimeSeriesEntry } from '@/lib/parsers';

export type Severity = 'excellent' | 'good' | 'warning' | 'critical';

export type Insight = {
  type: 'performance' | 'capacity' | 'bottleneck' | 'trend';
  severity: Severity;
  title: string;
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
};

export type AnalysisSummary = {
  overallSeverity: Severity;
  insights: Insight[];
  capacity: {
    maxConcurrentUsers: number;
    maxRequestsPerSecond: number;
    bottleneckAt?: number;
  };
  duration: {
    startTime: string;
    endTime: string;
    durationMs: number;
    durationFormatted: string;
  };
};

const THRESHOLDS = {
  errorRate: { good: 1, warning: 5, critical: 10 },
  p95: { good: 500, warning: 1000, critical: 2000 },
  p90: { good: 300, warning: 800, critical: 1500 },
  avg: { good: 200, warning: 500, critical: 1000 },
};

function formatDuration(ms: number): string {
  if (ms <= 0 || !Number.isFinite(ms)) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

type PartialAnalysisResult = Omit<AnalysisResult, 'capabilities'> & {
  capabilities: Partial<AnalysisCapabilities>;
};

function analyzeErrorRate(result: PartialAnalysisResult): Insight | null {
  const total = result.successCount + result.errorCount;
  if (total === 0) return null;
  const errorRate = (result.errorCount / total) * 100;
  
  let severity: Severity = 'excellent';
  if (errorRate >= THRESHOLDS.errorRate.critical) severity = 'critical';
  else if (errorRate >= THRESHOLDS.errorRate.warning) severity = 'warning';
  else if (errorRate >= THRESHOLDS.errorRate.good) severity = 'good';
  
  return {
    type: 'performance',
    severity,
    title: `Taxa de erro: ${errorRate.toFixed(2)}%`,
    message: severity === 'excellent'
      ? 'Taxa de erro muito baixa, aplicação estável.'
      : severity === 'good'
      ? 'Taxa de erro aceitável, mas pode ser melhorada.'
      : severity === 'warning'
      ? 'Taxa de erro alta, requer atenção.'
      : 'Taxa de erro crítica, aplicação instável.',
    metric: 'errorRate',
    value: errorRate,
    threshold: THRESHOLDS.errorRate.warning,
  };
}

function analyzeResponseTime(result: PartialAnalysisResult): Insight[] {
  const insights: Insight[] = [];
  const report = result.aggregateReport[0];
  if (!report) return insights;
  
  const p95 = report.p95;
  if (p95 !== null) {
    let severity: Severity = 'excellent';
    if (p95 >= THRESHOLDS.p95.critical) severity = 'critical';
    else if (p95 >= THRESHOLDS.p95.warning) severity = 'warning';
    else if (p95 >= THRESHOLDS.p95.good) severity = 'good';
    
    insights.push({
      type: 'performance',
      severity,
      title: `P95: ${p95.toFixed(0)}ms`,
      message: severity === 'excellent'
        ? 'Tempo de resposta excelente.'
        : severity === 'good'
        ? 'Tempo de resposta bom, mas pode ser otimizado.'
        : severity === 'warning'
        ? 'Tempo de resposta alto, usuários podem perceber lentidão.'
        : 'Tempo de resposta crítico, experiência do usuário degradada.',
      metric: 'p95',
      value: p95,
      threshold: THRESHOLDS.p95.warning,
    });
  }
  
  const avg = report.average;
  if (avg !== null && avg !== undefined) {
    let severity: Severity = 'excellent';
    if (avg >= THRESHOLDS.avg.critical) severity = 'critical';
    else if (avg >= THRESHOLDS.avg.warning) severity = 'warning';
    else if (avg >= THRESHOLDS.avg.good) severity = 'good';
    
    insights.push({
      type: 'performance',
      severity,
      title: `Tempo médio: ${avg.toFixed(0)}ms`,
      message: severity === 'excellent'
        ? 'Tempo médio excelente.'
        : severity === 'good'
        ? 'Tempo médio aceitável.'
        : severity === 'warning'
        ? 'Tempo médio alto, considere otimizações.'
        : 'Tempo médio crítico.',
      metric: 'avg',
      value: avg,
      threshold: THRESHOLDS.avg.warning,
    });
  }
  
  return insights;
}

function detectBottlenecks(timeSeries: TimeSeriesEntry[]): Insight | null {
  if (timeSeries.length < 5) return null;
  
  let maxP95 = 0;
  let maxP95Time = '';
  
  for (const entry of timeSeries) {
    const p95 = entry.durationP95;
    if (typeof p95 === 'number' && p95 > maxP95) {
      maxP95 = p95;
      maxP95Time = entry.time;
    }
  }
  
  if (maxP95 > THRESHOLDS.p95.warning && maxP95Time) {
    const time = new Date(maxP95Time);
    const formatted = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
    return {
      type: 'bottleneck',
      severity: maxP95 > THRESHOLDS.p95.critical ? 'critical' : 'warning',
      title: `Gargalo detectado às ${formatted}`,
      message: `P95 atingiu ${maxP95.toFixed(0)}ms neste momento. Isso indica degradação de performance.`,
      metric: 'p95',
      value: maxP95,
      threshold: THRESHOLDS.p95.warning,
    };
  }
  
  return null;
}

function estimateCapacity(timeSeries: TimeSeriesEntry[]): { maxConcurrentUsers: number; maxRequestsPerSecond: number; bottleneckAt?: number } {
  let maxVus = 0;
  let maxRps = 0;
  let bottleneckVus: number | undefined;
  
  for (const entry of timeSeries) {
    const vus = typeof entry.totalActiveThreads === 'number' ? entry.totalActiveThreads : 0;
    const rps = typeof entry.totalRequestsPerSecond === 'number' ? entry.totalRequestsPerSecond : 0;
    const errors = typeof entry.totalErrorsPerSecond === 'number' ? entry.totalErrorsPerSecond : 0;
    
    if (vus > maxVus) maxVus = vus;
    if (rps > maxRps) maxRps = rps;
    
    if (errors > 0 && bottleneckVus === undefined) {
      bottleneckVus = vus;
    }
  }
  
  return {
    maxConcurrentUsers: maxVus,
    maxRequestsPerSecond: maxRps,
    bottleneckAt: bottleneckVus,
  };
}

function analyzeCapacity(capacity: { maxConcurrentUsers: number; maxRequestsPerSecond: number; bottleneckAt?: number }): Insight[] {
  const insights: Insight[] = [];
  
  insights.push({
    type: 'capacity',
    severity: 'good',
    title: `Capacidade: ${capacity.maxConcurrentUsers} usuários simultâneos`,
    message: `A aplicação suportou até ${capacity.maxConcurrentUsers} usuários concorrentes com ${capacity.maxRequestsPerSecond.toFixed(1)} req/s.`,
    metric: 'maxVus',
    value: capacity.maxConcurrentUsers,
  });
  
  if (capacity.bottleneckAt !== undefined) {
    insights.push({
      type: 'capacity',
      severity: 'warning',
      title: `Limite identificado: ${capacity.bottleneckAt} usuários`,
      message: `Erros começaram a aparecer com ${capacity.bottleneckAt} usuários simultâneos. Este é o limite prático da aplicação.`,
      metric: 'bottleneckVus',
      value: capacity.bottleneckAt,
    });
  }
  
  return insights;
}

function detectMemoryLeak(timeSeries: TimeSeriesEntry[]): Insight | null {
  if (timeSeries.length < 10) return null;
  
  const firstQuarter = timeSeries.slice(0, Math.floor(timeSeries.length / 4));
  const lastQuarter = timeSeries.slice(-Math.floor(timeSeries.length / 4));
  
  const avgP95First = firstQuarter.reduce((sum, e) => {
    const p95 = e.durationP95;
    return sum + (typeof p95 === 'number' ? p95 : 0);
  }, 0) / firstQuarter.length;
  const avgP95Last = lastQuarter.reduce((sum, e) => {
    const p95 = e.durationP95;
    return sum + (typeof p95 === 'number' ? p95 : 0);
  }, 0) / lastQuarter.length;
  
  if (avgP95Last > avgP95First * 1.5 && avgP95Last > 500) {
    return {
      type: 'trend',
      severity: 'warning',
      title: 'Possível vazamento de memória',
      message: `P95 aumentou ${((avgP95Last / avgP95First - 1) * 100).toFixed(0)}% do início ao fim do teste. Isso pode indicar vazamento de memória ou degradação progressiva.`,
      metric: 'p95Trend',
      value: avgP95Last,
    };
  }
  
  return null;
}

export function analyzeTest(result: PartialAnalysisResult): AnalysisSummary {
  const insights: Insight[] = [];
  
  const errorInsight = analyzeErrorRate(result);
  if (errorInsight) insights.push(errorInsight);
  
  insights.push(...analyzeResponseTime(result));
  
  const bottleneck = detectBottlenecks(result.timeSeriesData);
  if (bottleneck) insights.push(bottleneck);
  
  const capacity = estimateCapacity(result.timeSeriesData);
  insights.push(...analyzeCapacity(capacity));
  
  const memoryLeak = detectMemoryLeak(result.timeSeriesData);
  if (memoryLeak) insights.push(memoryLeak);
  
  const severities = insights.map(i => i.severity);
  const overallSeverity: Severity = severities.includes('critical')
    ? 'critical'
    : severities.includes('warning')
    ? 'warning'
    : severities.includes('good')
    ? 'good'
    : 'excellent';
  
  return {
    overallSeverity,
    insights,
    capacity,
    duration: {
      startTime: result.startTime,
      endTime: result.endTime,
      durationMs: result.durationMs,
      durationFormatted: formatDuration(result.durationMs),
    },
  };
}
