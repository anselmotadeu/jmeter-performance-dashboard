import { sanitizeLabel, sanitizeMessage } from '@/lib/sanitize';
import type {
  AggregateReportItem, AnalysisCapabilities, AnalysisResult, ErrorDetail, Heatmap, HeatmapBin,
  HttpPhase, MetricStats, NormalizedPoint, TimeSeriesEntry,
} from './types';
import { HEATMAP_BINS, HTTP_PHASES } from './ingest-constants';

const PHASE_LABELS: Record<HttpPhase, string> = {
  duration: 'Tempo de resposta',
  blocked: 'Bloqueado',
  connecting: 'Conectando',
  sending: 'Enviando',
  waiting: 'Esperando',
  receiving: 'Recebendo',
};

const DEFAULT_CAPABILITIES: AnalysisCapabilities = {
  requestSamples: true,
  timeSeries: true,
  activeUsers: false,
  responseTime: true,
  waitingTime: false,
  networkBytes: false,
  checks: false,
  thresholds: false,
  errors: true,
};

const HTTP_ERROR_CODES: Record<string, string> = {
  '400': 'Bad Request', '401': 'Unauthorized', '403': 'Forbidden', '404': 'Not Found',
  '429': 'Too Many Requests', '500': 'Internal Server Error', '502': 'Bad Gateway',
  '503': 'Service Unavailable', '504': 'Gateway Timeout',
};

const PHASE_BIN_CAP = 512;
const MAX_GROUP_SAMPLES = 20000;
const MAX_PHASE_SAMPLES = 50000;
const MAX_TIME_BUCKETS = 2400;

type InternalNumber = number;

function percentile(sorted: number[], ratio: number) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function median(sorted: number[]) {
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function reservoirPush(values: number[], value: number, cap: number) {
  if (values.length < cap) {
    values.push(value);
    return;
  }
  const index = Math.floor(Math.random() * (values.length + 1));
  if (index < cap) values[index] = value;
}

function sortUnique(values: number[]) {
  return values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
}

function phaseValue(point: NormalizedPoint, phase: HttpPhase): number | null {
  switch (phase) {
    case 'duration': return point.elapsed;
    case 'blocked': return point.blocked ?? null;
    case 'connecting': return point.connecting ?? null;
    case 'sending': return point.sending ?? null;
    case 'waiting': return point.latency ?? null;
    case 'receiving': return point.receiving ?? null;
  }
}

function binIndex(value: number) {
  if (value < HEATMAP_BINS[0]) return 0;
  for (let i = 0; i < HEATMAP_BINS.length; i++) {
    if (value < HEATMAP_BINS[i]) return i;
  }
  return HEATMAP_BINS.length;
}

type Group = {
  label: string;
  count: number;
  totalElapsed: number;
  totalLatency: number;
  latencyCount: number;
  totalBytes: number;
  bytesCount: number;
  totalSentBytes: number;
  sentBytesCount: number;
  min: InternalNumber;
  max: InternalNumber;
  errors: number;
  responseReservoir: number[];
  latencyReservoir: number[];
  firstTimestamp: number;
  lastTimestamp: number;
};

type BucketLabel = {
  requests: number;
  errors: number;
  successes: number;
  elapsedSum: number;
  latencySum: number;
  latencyCount: number;
  bytes: number;
  sentBytes: number;
  activeUsers: number;
  errorsByMessage: Map<string, number>;
};

type GlobalSecond = {
  requests: number;
  errors: number;
  vus: number;
  checksPassed: number;
  checksFailed: number;
  avg: Partial<Record<HttpPhase, { sum: number; n: number }>>;
  samples: Partial<Record<HttpPhase, number[]>>;
};

function emptyPhaseAgg() {
  return { sum: 0, n: 0 };
}

function formatDuration(ms: number) {
  if (ms <= 0 || !Number.isFinite(ms)) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export type AnalysisAccumulator = {
  add(point: NormalizedPoint): void;
  finalize(): AnalysisResult;
};

export function createAnalysisAccumulator(
  framework: string,
  sourceFormat = 'unknown',
  capabilities: Partial<AnalysisCapabilities> = {},
  dataQuality: 'certified' | 'beta' = 'beta',
): AnalysisAccumulator {
  const resolvedCapabilities = { ...DEFAULT_CAPABILITIES, ...capabilities };

  let minTime = Infinity;
  let maxTime = -Infinity;
  let successCount = 0;
  let errorCount = 0;
  const groups = new Map<string, Group>();
  const buckets = new Map<number, Map<string, BucketLabel>>();
  const errorTotals = new Map<string, number>();

  const globalSeconds = new Map<number, GlobalSecond>();
  const heatCounts: Partial<Record<HttpPhase, Map<number, Map<number, number>>>> = {};
  const phaseTotals: Partial<Record<HttpPhase, { sum: number; n: number }>> = {};
  const phaseSamples: Partial<Record<HttpPhase, number[]>> = {};
  const globalChecks = new Map<string, { passes: number; fails: number }>();
  for (const phase of HTTP_PHASES) {
    heatCounts[phase] = new Map();
    phaseTotals[phase] = { sum: 0, n: 0 };
    phaseSamples[phase] = [];
  }

  function add(point: NormalizedPoint) {
    if (point.checks !== undefined) {
      const bucketTime = Math.floor(point.timestamp / 1000) * 1000;
      let globalSecond = globalSeconds.get(bucketTime);
      if (!globalSecond) {
        globalSecond = { requests: 0, errors: 0, vus: 0, checksPassed: 0, checksFailed: 0, avg: {}, samples: {} };
        globalSeconds.set(bucketTime, globalSecond);
      }
      if (point.checks > 0) globalSecond.checksPassed++;
      else globalSecond.checksFailed++;
      const entry = globalChecks.get(point.label) ?? { passes: 0, fails: 0 };
      if (point.checks > 0) entry.passes++;
      else entry.fails++;
      globalChecks.set(point.label, entry);
      return;
    }
    if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.elapsed) || point.elapsed < 0) return;
    minTime = Math.min(minTime, point.timestamp);
    const pointEnd = point.timestamp + point.elapsed;
    maxTime = Math.max(maxTime, pointEnd);
    if (point.success) successCount++; else errorCount++;

    const safeLabel = sanitizeLabel(point.label);
    const safeMessage = point.responseMessage ? sanitizeMessage(point.responseMessage) : undefined;
    let group = groups.get(safeLabel);
    if (!group) {
      group = {
        label: safeLabel, count: 0, totalElapsed: 0, totalLatency: 0, latencyCount: 0,
        totalBytes: 0, bytesCount: 0, totalSentBytes: 0, sentBytesCount: 0,
        min: Infinity, max: -Infinity, errors: 0, responseReservoir: [], latencyReservoir: [],
        firstTimestamp: point.timestamp, lastTimestamp: point.timestamp,
      };
      groups.set(safeLabel, group);
    }
    group.count++;
    group.totalElapsed += point.elapsed;
    group.min = Math.min(group.min, point.elapsed);
    group.max = Math.max(group.max, point.elapsed);
    group.firstTimestamp = Math.min(group.firstTimestamp, point.timestamp);
    group.lastTimestamp = Math.max(group.lastTimestamp, pointEnd);
    reservoirPush(group.responseReservoir, point.elapsed, MAX_GROUP_SAMPLES);
    if (!point.success) group.errors++;
    if (point.latency !== null) {
      group.totalLatency += point.latency;
      group.latencyCount++;
      reservoirPush(group.latencyReservoir, point.latency, MAX_GROUP_SAMPLES);
    }
    if (point.bytesReceived !== null) { group.totalBytes += point.bytesReceived; group.bytesCount++; }
    if (point.bytesSent !== null) { group.totalSentBytes += point.bytesSent; group.sentBytesCount++; }

    const bucketTime = Math.floor(point.timestamp / 1000) * 1000;
    let bucket = buckets.get(bucketTime);
    if (!bucket) { bucket = new Map(); buckets.set(bucketTime, bucket); }
    let labelBucket = bucket.get(safeLabel);
    if (!labelBucket) {
      labelBucket = { requests: 0, errors: 0, successes: 0, elapsedSum: 0, latencySum: 0, latencyCount: 0, bytes: 0, sentBytes: 0, activeUsers: 0, errorsByMessage: new Map() };
      bucket.set(safeLabel, labelBucket);
    }
    labelBucket.requests++;
    labelBucket.elapsedSum += point.elapsed;
    if (point.success) labelBucket.successes++; else labelBucket.errors++;
    if (point.latency !== null) { labelBucket.latencySum += point.latency; labelBucket.latencyCount++; }
    if (point.bytesReceived !== null) labelBucket.bytes += point.bytesReceived;
    if (point.bytesSent !== null) labelBucket.sentBytes += point.bytesSent;
    if (point.activeUsers !== null) labelBucket.activeUsers = Math.max(labelBucket.activeUsers, point.activeUsers);

    if (!point.success) {
      const code = point.responseCode || '000';
      const message = safeMessage || HTTP_ERROR_CODES[code] || 'Error';
      const key = `${code}: ${message}`;
      labelBucket.errorsByMessage.set(key, (labelBucket.errorsByMessage.get(key) ?? 0) + 1);
      errorTotals.set(key, (errorTotals.get(key) ?? 0) + 1);
    }

    let globalSecond = globalSeconds.get(bucketTime);
    if (!globalSecond) {
      globalSecond = { requests: 0, errors: 0, vus: 0, checksPassed: 0, checksFailed: 0, avg: {}, samples: {} };
      globalSeconds.set(bucketTime, globalSecond);
    }
    globalSecond.requests++;
    if (!point.success) globalSecond.errors++;
    if (point.activeUsers !== null)
      globalSecond.vus = Math.max(globalSecond.vus, point.activeUsers);

    for (const phase of HTTP_PHASES) {
      const value = phaseValue(point, phase);
      if (value === null || !Number.isFinite(value) || value < 0) continue;
      const totals = phaseTotals[phase]!;
      totals.sum += value;
      totals.n++;
      reservoirPush(phaseSamples[phase]!, value, MAX_PHASE_SAMPLES);
      const agg = (globalSecond.avg[phase] ??= emptyPhaseAgg());
      agg.sum += value;
      agg.n++;
      if (!globalSecond.samples[phase]) globalSecond.samples[phase] = [];
      reservoirPush(globalSecond.samples[phase]!, value, PHASE_BIN_CAP);
      const index = binIndex(value);
      const binCounts = heatCounts[phase]!.get(bucketTime) ?? new Map<number, number>();
      binCounts.set(index, (binCounts.get(index) ?? 0) + 1);
      heatCounts[phase]!.set(bucketTime, binCounts);
    }
  }

  function finalize(): AnalysisResult {
    if (!Number.isFinite(minTime) || !groups.size) {
      return {
        schemaVersion: 2, framework, sourceFormat, dataQuality, capabilities: resolvedCapabilities,
        diagnostics: ['Nenhuma amostra válida encontrada.'], successCount: 0, errorCount: 0,
        startTime: '', endTime: '', startTimestamp: null, endTimestamp: null, durationMs: 0,
        rampUpInfo: { users: 0, usersPerTest: 0, duration: '0s' }, aggregateReport: [],
        timeSeriesData: [], heatmaps: [], phaseStats: [], errorDetails: [], labels: [], checks: [], thresholds: [],
      };
    }
    const durationMs = Math.max(0, maxTime - minTime);
    const labels = Array.from(groups.keys()).sort();

    const aggregateReport: AggregateReportItem[] = Array.from(groups.values()).map((group) => {
      const responseSorted = sortUnique(group.responseReservoir);
      const latencySorted = sortUnique(group.latencyReservoir);
      const activeSeconds = Math.max(0.001, (group.lastTimestamp - group.firstTimestamp) / 1000);
      return {
        label: group.label,
        average: Number((group.totalElapsed / group.count).toFixed(2)),
        median: Number(median(responseSorted).toFixed(2)),
        p90: Number(percentile(responseSorted, 0.9).toFixed(2)),
        p95: Number(percentile(responseSorted, 0.95).toFixed(2)),
        p99: Number(percentile(responseSorted, 0.99).toFixed(2)),
        min: Number(group.min.toFixed(2)), max: Number(group.max.toFixed(2)),
        errorRate: Number(((group.errors / group.count) * 100).toFixed(2)),
        throughput: Number((group.count / activeSeconds).toFixed(2)),
        count: group.count,
        averageLatency: group.latencyCount ? Number((group.totalLatency / group.latencyCount).toFixed(2)) : null,
        medianLatency: group.latencyCount ? Number(median(latencySorted).toFixed(2)) : null,
        p90Latency: group.latencyCount ? Number(percentile(latencySorted, 0.9).toFixed(2)) : null,
        p95Latency: group.latencyCount ? Number(percentile(latencySorted, 0.95).toFixed(2)) : null,
        p99Latency: group.latencyCount ? Number(percentile(latencySorted, 0.99).toFixed(2)) : null,
        bytes: group.bytesCount ? Number((group.totalBytes / group.bytesCount).toFixed(2)) : null,
        sentBytes: group.sentBytesCount ? Number((group.totalSentBytes / group.sentBytesCount).toFixed(2)) : null,
      };
    });

    const rawSeconds = Array.from(globalSeconds.keys()).sort((a, b) => a - b);
    const binWidthMs =
      rawSeconds.length > MAX_TIME_BUCKETS
        ? Math.ceil(rawSeconds.length / MAX_TIME_BUCKETS) * 1000
        : 1000;
    const mergedBuckets = new Map<number, Map<string, BucketLabel>>();
    const mergedGlobal = new Map<number, GlobalSecond>();
    const mergedKeys: number[] = [];
    for (const second of rawSeconds) {
      const binKey = binWidthMs <= 1000 ? second : Math.floor(second / binWidthMs) * binWidthMs;
      if (!mergedKeys.includes(binKey)) mergedKeys.push(binKey);
      const global = globalSeconds.get(second);
      if (global) {
        let target = mergedGlobal.get(binKey);
        if (!target) {
          target = { requests: 0, errors: 0, vus: 0, checksPassed: 0, checksFailed: 0, avg: {}, samples: {} };
          mergedGlobal.set(binKey, target);
        }
        target.requests += global.requests;
        target.errors += global.errors;
        target.vus = Math.max(target.vus, global.vus);
        target.checksPassed += global.checksPassed;
        target.checksFailed += global.checksFailed;
        for (const phase of HTTP_PHASES) {
          const agg = global.avg[phase];
          if (agg && agg.n) {
            const tAgg = (target.avg[phase] ??= emptyPhaseAgg());
            tAgg.sum += agg.sum;
            tAgg.n += agg.n;
          }
          const samples = global.samples[phase];
          if (samples && samples.length) {
            if (!target.samples[phase]) target.samples[phase] = [];
            target.samples[phase]!.push(...samples);
            if (target.samples[phase]!.length > PHASE_BIN_CAP * 2) {
              const tmp = sortUnique(target.samples[phase]!);
              const trimmed: number[] = [];
              for (let i = 0; i < tmp.length; i++) reservoirPush(trimmed, tmp[i], PHASE_BIN_CAP);
              target.samples[phase] = trimmed;
            }
          }
        }
      }
      const bucket = buckets.get(second);
      if (bucket) {
        let target = mergedBuckets.get(binKey);
        if (!target) { target = new Map(); mergedBuckets.set(binKey, target); }
        for (const [label, item] of bucket.entries()) {
          const tItem = target.get(label);
          if (!tItem) {
            target.set(label, {
              requests: item.requests, errors: item.errors, successes: item.successes,
              elapsedSum: item.elapsedSum, latencySum: item.latencySum, latencyCount: item.latencyCount,
              bytes: item.bytes, sentBytes: item.sentBytes, activeUsers: item.activeUsers,
              errorsByMessage: new Map(item.errorsByMessage),
            });
            continue;
          }
          tItem.requests += item.requests;
          tItem.errors += item.errors;
          tItem.successes += item.successes;
          tItem.elapsedSum += item.elapsedSum;
          tItem.latencySum += item.latencySum;
          tItem.latencyCount += item.latencyCount;
          tItem.bytes += item.bytes;
          tItem.sentBytes += item.sentBytes;
          tItem.activeUsers = Math.max(tItem.activeUsers, item.activeUsers);
          for (const [k, v] of item.errorsByMessage) tItem.errorsByMessage.set(k, (tItem.errorsByMessage.get(k) ?? 0) + v);
        }
      }
    }

    const timeSeriesData: TimeSeriesEntry[] = mergedKeys.sort((a, b) => a - b).map((timestamp) => {
      const bucket = mergedBuckets.get(timestamp) ?? new Map<string, BucketLabel>();
      const entry: TimeSeriesEntry = {
        time: new Date(timestamp).toISOString(), timeStamp: timestamp, totalActiveThreads: 0,
        totalRequestsPerSecond: 0, totalChecksPerSecond: 0, totalErrorsPerSecond: 0,
        rps: 0, vus: 0, errs: 0, checks: 0, checksFailed: 0,
        bucketSeconds: binWidthMs / 1000,
      };
      const global = mergedGlobal.get(timestamp);
      if (global) {
        entry.rps = global.requests / (binWidthMs / 1000);
        entry.vus = global.vus;
        entry.errs = global.errors / (binWidthMs / 1000);
        entry.checks = global.checksPassed / (binWidthMs / 1000);
        entry.checksFailed = global.checksFailed / (binWidthMs / 1000);
        for (const phase of HTTP_PHASES) {
          const agg = global.avg[phase];
          if (agg && agg.n) entry[`${phase}Avg`] = Number((agg.sum / agg.n).toFixed(3));
          const samples = sortUnique(global.samples[phase] ?? []);
          if (samples.length) {
            entry[`${phase}Min`] = samples[0];
            entry[`${phase}Max`] = samples[samples.length - 1];
            entry[`${phase}P90`] = percentile(samples, 0.9);
            entry[`${phase}P95`] = percentile(samples, 0.95);
            entry[`${phase}P99`] = percentile(samples, 0.99);
          }
        }
      }
      for (const label of labels) {
        const item = bucket.get(label);
        if (!item) continue;
        const seconds = binWidthMs / 1000;
        const requests = item.requests;
        const errors = item.errors;
        entry[`requestsPerSecond_${label}`] = requests > 0 ? requests / seconds : 0;
        entry[`errorsPerSecond_${label}`] = errors > 0 ? errors / seconds : 0;
        entry[`activeThreads_${label}`] = item.activeUsers;
        entry[`bytes_${label}`] = item.bytes;
        entry[`sentBytes_${label}`] = item.sentBytes;
        entry[`elapsed_${label}`] = requests ? item.elapsedSum / requests : 0;
        entry[`latency_${label}`] = item.latencyCount ? item.latencySum / item.latencyCount : 0;
        entry[`checksPerSecond_${label}`] = item.successes / seconds;
        entry[`errorDetails_${label}`] = Object.fromEntries(item.errorsByMessage);
        entry.totalActiveThreads = Math.max(entry.totalActiveThreads, item.activeUsers);
        entry.totalRequestsPerSecond += requests / seconds;
        entry.totalChecksPerSecond += item.successes / seconds;
        entry.totalErrorsPerSecond += errors / seconds;
      }
      return entry;
    });

    const heatmaps: Heatmap[] = [];
    for (const phase of HTTP_PHASES) {
      const counts = heatCounts[phase]!;
      if (!phaseTotals[phase]!.n || !counts.size) continue;
      const seconds = Array.from(counts.keys()).sort((a, b) => a - b);
      const spanMs = Math.max(1000, (seconds[seconds.length - 1] - seconds[0]) + 1000);
      const numBins = Math.min(24, Math.max(6, Math.round(spanMs / 5000)));
      const binSize = spanMs / numBins;
      const series: HeatmapBin[] = Array.from({ length: numBins }, (_, i) => ({
        t0: seconds[0] + i * binSize,
        t1: seconds[0] + (i + 1) * binSize,
        counts: new Array<number>(HEATMAP_BINS.length + 1).fill(0),
      }));
      for (const [second, valueBins] of counts.entries()) {
        const binIndexNow = Math.min(numBins - 1, Math.max(0, Math.floor((second - seconds[0]) / binSize)));
        const target = series[binIndexNow];
        for (const [valueBin, count] of valueBins.entries()) target.counts[valueBin] += count;
      }
      heatmaps.push({ metric: phase, label: PHASE_LABELS[phase], unit: 'ms', buckets: HEATMAP_BINS, series });
    }

    const phaseStats: MetricStats[] = HTTP_PHASES.map((phase) => {
      const sorted = sortUnique(phaseSamples[phase] ?? []);
      if (!sorted.length) return { metric: phase, label: PHASE_LABELS[phase], mean: null, median: null, p90: null, p95: null, p99: null, min: null, max: null, count: 0 };
      return {
        metric: phase,
        label: PHASE_LABELS[phase],
        mean: Number(((phaseTotals[phase]!.sum) / phaseTotals[phase]!.n).toFixed(3)),
        median: median(sorted),
        p90: percentile(sorted, 0.9),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        count: phaseTotals[phase]!.n,
      };
    });

    const errorDetails: ErrorDetail[] = Array.from(errorTotals.entries()).map(([key, count]) => {
      const [code, ...message] = key.split(': ');
      return { code, message: message.join(': '), count };
    }).sort((a, b) => b.count - a.count);

    const maxUsers = timeSeriesData.reduce((max, item) => Math.max(max, item.totalActiveThreads), 0);
    const firstActive = timeSeriesData.find((item) => item.totalActiveThreads > 0)?.timeStamp ?? null;
    const maxActive = timeSeriesData.find((item) => item.totalActiveThreads === maxUsers)?.timeStamp ?? null;

    return {
      schemaVersion: 2, framework, sourceFormat, dataQuality, capabilities: resolvedCapabilities,
      diagnostics: dataQuality === 'beta' ? ['Parser em modo Beta: valide as métricas com a ferramenta de origem.'] : [],
      successCount, errorCount, startTime: new Date(minTime).toISOString(), endTime: new Date(maxTime).toISOString(),
      startTimestamp: minTime, endTimestamp: maxTime, durationMs,
      rampUpInfo: { users: maxUsers, usersPerTest: maxUsers, duration: formatDuration(firstActive !== null && maxActive !== null ? maxActive - firstActive : 0) },
      aggregateReport, timeSeriesData, heatmaps, phaseStats, errorDetails,
      labels,
      checks: Array.from(globalChecks.entries()).map(([name, totals]) => ({ name, passes: totals.passes, fails: totals.fails })),
      thresholds: [],
    };
  }

  return { add, finalize };
}