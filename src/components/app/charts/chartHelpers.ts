import type { AggregateReportItem, ErrorDetail, TimeSeriesEntry } from "@/lib/parsers";

/** Estima o intervalo médio entre buckets a partir dos timestamps. */
export function estimateBucketSeconds(timeSeriesData: TimeSeriesEntry[]): number {
  const stamps = timeSeriesData
    .map((entry) => Number(entry.timeStamp))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (stamps.length < 2) return 1;
  let sum = 0;
  let count = 0;
  for (let i = 1; i < stamps.length; i++) {
    const diff = stamps[i] - stamps[i - 1];
    if (diff > 0) {
      sum += diff;
      count++;
    }
  }
  return count > 0 ? sum / count : 1;
}

export type NetworkPoint = {
  time: string;
  timeStamp: number;
  /** bytes/s recebidos */
  down: number;
  /** bytes/s enviados */
  up: number;
};

/**
 * Derivados os gráficos. Funções puras, testáveis com Jest sem DOM.
 */

/** Bytes por segundo de rede, somando todos os labels do bucket. */
export function computeNetworkThroughput(
  timeSeriesData: TimeSeriesEntry[],
  labels: string[],
  bucketSeconds: number,
): NetworkPoint[] {
  const seconds = bucketSeconds > 0 ? bucketSeconds : 1;
  return timeSeriesData.map((entry) => {
    let downBytes = 0;
    let upBytes = 0;
    for (const label of labels) {
      downBytes += Number(entry[`bytes_${label}`] ?? 0);
      upBytes += Number(entry[`sentBytes_${label}`] ?? 0);
    }
    return {
      time: String(entry.time),
      timeStamp: Number(entry.timeStamp),
      down: downBytes / seconds,
      up: upBytes / seconds,
    };
  });
}

export type GaugeMetrics = {
  maxRps: number;
  avgRps: number;
  maxConcurrentUsers: number;
  errorRate: number;
  p95: number | null;
  durationMs: number;
};

export function computeGaugeMetrics(input: {
  timeSeriesData: TimeSeriesEntry[];
  aggregateReport: AggregateReportItem[];
  durationMs?: number;
  successCount?: number;
  errorCount?: number;
}): GaugeMetrics {
  const { timeSeriesData, aggregateReport } = input;
  let maxRps = 0;
  let rpsSum = 0;
  let maxConcurrentUsers = 0;
  for (const entry of timeSeriesData) {
    maxRps = Math.max(maxRps, Number(entry.rps ?? 0));
    rpsSum += Number(entry.rps ?? 0);
    maxConcurrentUsers = Math.max(maxConcurrentUsers, Number(entry.vus ?? 0));
  }
  const avgRps = timeSeriesData.length ? rpsSum / timeSeriesData.length : 0;
  const total = aggregateReport.reduce((sum, item) => sum + item.count, 0);
  const errorCount =
    input.errorCount ??
    aggregateReport.reduce((sum, item) => sum + Math.round(item.errorRate * item.count) / 100, 0);
  const errorRate = total > 0 ? (errorCount / total) * 100 : 0;
  const p95 = aggregateReport.length
    ? Math.max(...aggregateReport.map((item) => item.p95 ?? 0))
    : null;
  return {
    maxRps,
    avgRps,
    maxConcurrentUsers,
    errorRate,
    p95,
    durationMs: input.durationMs ?? 0,
  };
}

export type ErrorCodeSlice = { code: string; count: number; total: number; label: string };

/** Agrupa erros por código HTTP, mantendo no máximo `top` fatias e agregando o resto em "Outros". */
export function sliceErrorByCode(errorDetails: ErrorDetail[], top = 6): ErrorCodeSlice[] {
  const total = errorDetails.reduce((sum, item) => sum + item.count, 0);
  if (!total) return [];
  const sorted = [...errorDetails].sort((a, b) => b.count - a.count);
  const head = sorted.slice(0, top).map((item) => ({
    code: item.code,
    count: item.count,
    total,
    label: item.code === "000" ? "Sem código" : item.code,
  }));
  const rest = sorted.slice(top).reduce((sum, item) => sum + item.count, 0);
  if (rest > 0) head.push({ code: "otros", count: rest, total, label: "Outros" });
  return head;
}

/** Painel de percentis por endpoint (média/mediana/p90/p95/p99). */
export type PercentileRow = {
  label: string;
  average: number;
  median: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
};

export function buildPercentileRows(aggregateReport: AggregateReportItem[]): PercentileRow[] {
  return aggregateReport
    .filter((item) => item.average > 0)
    .sort((a, b) => b.average - a.average)
    .slice(0, 12);
}

export type ScatterPoint = { vus: number; latency: number; time: string };

/** Pontos de dispersão VUs × latência (média de resposta por bucket). */
export function buildVusLatencyScatter(timeSeriesData: TimeSeriesEntry[]): ScatterPoint[] {
  return timeSeriesData
    .map((entry) => ({
      vus: Number(entry.vus ?? 0),
      latency: Number(entry.durationAvg ?? NaN),
      time: String(entry.time),
    }))
    .filter((point) => point.vus > 0 && Number.isFinite(point.latency));
}

export function formatBytesPerSecond(value: number): string {
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(2)} MB/s`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${Math.round(value)} B/s`;
}