import { jmeterParser } from './jmeter';
import { k6JsonParser } from './k6';
import { k6CsvParser } from './k6-csv';
import { k6SummaryParser } from './k6-summary';
import { locustParser } from './locust';
import { artilleryParser } from './artillery';
import { newmanParser } from './newman';
import { gatlingParser } from './gatling';
import { vegetaParser } from './vegeta';
import type {
  AggregateReportItem, AnalysisCapabilities, AnalysisResult, ErrorDetail, NormalizedPoint,
  PerformanceParser, TimeSeriesEntry,
} from './types';
import { sanitizeLabel, sanitizeMessage } from '@/lib/sanitize';

export type { AggregateReportItem, AnalysisCapabilities, AnalysisResult, NormalizedPoint, PerformanceParser, TimeSeriesEntry };

const PARSERS: PerformanceParser[] = [
  jmeterParser,
  k6SummaryParser,
  k6JsonParser,
  k6CsvParser,
  locustParser,
  artilleryParser,
  newmanParser,
  gatlingParser,
  vegetaParser,
];

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

export function detectParser(content: string): PerformanceParser | null {
  const sample = content.slice(0, 16_384).replace(/^\uFEFF/, '');
  return PARSERS.find((parser) => parser.detect(sample)) ?? null;
}

export function getParserByName(name: string) {
  return PARSERS.find((parser) => parser.name === name) ?? null;
}

export function listParsers() {
  return PARSERS.map((parser) => ({
    name: parser.name,
    displayName: parser.displayName,
    extensions: parser.supportedExtensions,
    dataQuality: parser.dataQuality ?? 'beta',
  }));
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
  min: number;
  max: number;
  errors: number;
  responseTimes: number[];
  latencyTimes: number[];
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

export function computeAnalysis(
  points: NormalizedPoint[],
  framework: string,
  sourceFormat = 'unknown',
  capabilities: Partial<AnalysisCapabilities> = {},
  dataQuality: 'certified' | 'beta' = 'beta',
): AnalysisResult {
  const resolvedCapabilities = { ...DEFAULT_CAPABILITIES, ...capabilities };
  if (!points.length) {
    return {
      schemaVersion: 2, framework, sourceFormat, dataQuality, capabilities: resolvedCapabilities,
      diagnostics: ['Nenhuma amostra válida encontrada.'], successCount: 0, errorCount: 0,
      startTime: '', endTime: '', startTimestamp: null, endTimestamp: null, durationMs: 0,
      rampUpInfo: { users: 0, usersPerTest: 0, duration: '0s' }, aggregateReport: [],
      timeSeriesData: [], errorDetails: [], labels: [], checks: [], thresholds: [],
    };
  }

  let minTime = Infinity;
  let maxTime = -Infinity;
  let successCount = 0;
  let errorCount = 0;
  const groups = new Map<string, Group>();
  const buckets = new Map<number, Map<string, BucketLabel>>();
  const errorTotals = new Map<string, number>();

  for (const point of points) {
    if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.elapsed) || point.elapsed < 0) continue;
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
        min: Infinity, max: -Infinity, errors: 0, responseTimes: [], latencyTimes: [],
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
    group.responseTimes.push(point.elapsed);
    if (!point.success) group.errors++;
    if (point.latency !== null) {
      group.totalLatency += point.latency;
      group.latencyCount++;
      group.latencyTimes.push(point.latency);
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
  }

  if (!Number.isFinite(minTime) || !groups.size) return computeAnalysis([], framework, sourceFormat, capabilities, dataQuality);
  const durationMs = Math.max(0, maxTime - minTime);
  const labels = Array.from(groups.keys()).sort();

  const aggregateReport: AggregateReportItem[] = Array.from(groups.values()).map((group) => {
    group.responseTimes.sort((a, b) => a - b);
    group.latencyTimes.sort((a, b) => a - b);
    const activeSeconds = Math.max(0.001, (group.lastTimestamp - group.firstTimestamp) / 1000);
    return {
      label: group.label,
      average: Number((group.totalElapsed / group.count).toFixed(2)),
      median: Number(median(group.responseTimes).toFixed(2)),
      p90: Number(percentile(group.responseTimes, 0.9).toFixed(2)),
      p95: Number(percentile(group.responseTimes, 0.95).toFixed(2)),
      min: Number(group.min.toFixed(2)), max: Number(group.max.toFixed(2)),
      errorRate: Number(((group.errors / group.count) * 100).toFixed(2)),
      throughput: Number((group.count / activeSeconds).toFixed(2)),
      count: group.count,
      averageLatency: group.latencyCount ? Number((group.totalLatency / group.latencyCount).toFixed(2)) : null,
      medianLatency: group.latencyCount ? Number(median(group.latencyTimes).toFixed(2)) : null,
      p90Latency: group.latencyCount ? Number(percentile(group.latencyTimes, 0.9).toFixed(2)) : null,
      p95Latency: group.latencyCount ? Number(percentile(group.latencyTimes, 0.95).toFixed(2)) : null,
      bytes: group.bytesCount ? Number((group.totalBytes / group.bytesCount).toFixed(2)) : null,
      sentBytes: group.sentBytesCount ? Number((group.totalSentBytes / group.sentBytesCount).toFixed(2)) : null,
    };
  });

  const timeSeriesData: TimeSeriesEntry[] = Array.from(buckets.entries()).sort(([a], [b]) => a - b).map(([timestamp, bucket]) => {
    const entry: TimeSeriesEntry = {
      time: new Date(timestamp).toISOString(), timeStamp: timestamp, totalActiveThreads: 0,
      totalRequestsPerSecond: 0, totalChecksPerSecond: 0, totalErrorsPerSecond: 0,
    };
    for (const label of labels) {
      const item = bucket.get(label);
      const requests = item?.requests ?? 0;
      entry[`requestsPerSecond_${label}`] = requests;
      entry[`errorsPerSecond_${label}`] = item?.errors ?? 0;
      entry[`activeThreads_${label}`] = item?.activeUsers ?? 0;
      entry[`bytes_${label}`] = item?.bytes ?? 0;
      entry[`sentBytes_${label}`] = item?.sentBytes ?? 0;
      entry[`elapsed_${label}`] = requests ? (item?.elapsedSum ?? 0) / requests : 0;
      entry[`latency_${label}`] = item?.latencyCount ? item.latencySum / item.latencyCount : 0;
      entry[`checksPerSecond_${label}`] = item?.successes ?? 0;
      entry[`errorDetails_${label}`] = Object.fromEntries(item?.errorsByMessage ?? []);
      entry.totalActiveThreads = Math.max(entry.totalActiveThreads, item?.activeUsers ?? 0);
      entry.totalRequestsPerSecond += requests;
      entry.totalChecksPerSecond += item?.successes ?? 0;
      entry.totalErrorsPerSecond += item?.errors ?? 0;
    }
    return entry;
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
    aggregateReport, timeSeriesData, errorDetails, labels, checks: [], thresholds: [],
  };
}

export function parseAndAnalyze(content: string, forcedParser?: string): AnalysisResult {
  const parser = forcedParser ? getParserByName(forcedParser) : detectParser(content);
  if (!parser) throw new Error('Formato não reconhecido. Use JMeter JTL/CSV ou K6 CSV, NDJSON ou summary JSON.');
  const parsed = parser.parse(content);
  if (!Array.isArray(parsed)) return parsed;
  if (!parsed.length) throw new Error(`Nenhuma amostra válida foi encontrada pelo parser ${parser.displayName}.`);
  return computeAnalysis(parsed, parser.displayName, parser.name, parser.capabilities, parser.dataQuality ?? 'beta');
}
