import { jmeterParser } from './jmeter';
import { k6JsonParser } from './k6';
import { k6CsvParser } from './k6-csv';
import { locustParser } from './locust';
import { artilleryParser } from './artillery';
import { newmanParser } from './newman';
import { gatlingParser } from './gatling';
import { vegetaParser } from './vegeta';
import type { PerformanceParser, NormalizedPoint, AnalysisResult, AggregateReportItem, TimeSeriesEntry, ErrorDetail } from './types';

export type { PerformanceParser, NormalizedPoint, AnalysisResult };

const PARSERS: PerformanceParser[] = [
  jmeterParser,
  k6JsonParser,
  k6CsvParser,
  locustParser,
  artilleryParser,
  newmanParser,
  gatlingParser,
  vegetaParser,
];

const HTTP_ERROR_CODES: Record<string, string> = {
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '403': 'Forbidden',
  '404': 'Not Found',
  '429': 'Too Many Requests',
  '500': 'Internal Server Error',
  '502': 'Bad Gateway',
  '503': 'Service Unavailable',
  '504': 'Gateway Timeout',
};

export function detectParser(content: string): PerformanceParser | null {
  const firstLines = content.slice(0, 2048);
  for (const parser of PARSERS) {
    if (parser.detect(firstLines)) return parser;
  }
  return null;
}

export function getParserByName(name: string): PerformanceParser | null {
  return PARSERS.find(p => p.name === name) ?? null;
}

export function listParsers(): Array<{ name: string; displayName: string; extensions: string[] }> {
  return PARSERS.map(p => ({
    name: p.name,
    displayName: p.displayName,
    extensions: p.supportedExtensions,
  }));
}

// ---

function formatDuration(ms: number): string {
  if (ms <= 0 || isNaN(ms)) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.floor(sorted.length * p)] ?? 0;
}

function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Takes NormalizedPoint[] (output of any parser) and returns the full
 * AnalysisResult that the dashboard frontend expects.
 */
export function computeAnalysis(points: NormalizedPoint[], framework: string): AnalysisResult {
  if (!points.length) {
    return {
      framework,
      successCount: 0,
      errorCount: 0,
      startTime: '',
      endTime: '',
      rampUpInfo: { users: 0, usersPerTest: 0, duration: '0s' },
      aggregateReport: [],
      timeSeriesData: [],
      errorDetails: [],
      labels: [],
    };
  }

  let minTime = Infinity;
  let maxTime = -Infinity;
  let successCount = 0;
  let errorCount = 0;

  const grouped: Record<string, {
    label: string;
    count: number;
    totalElapsed: number;
    totalLatency: number;
    totalBytes: number;
    totalSentBytes: number;
    min: number;
    max: number;
    errors: number;
    responseTimes: number[];
    latencyTimes: number[];
  }> = {};

  const intervalMs = 1000;
  const timeSeries: Record<number, Record<string, number | Record<string, number>>> = {};
  const labelsSet = new Set<string>();
  const threadsByLabel: Record<string, number> = {};
  const threadsByTimestamp: Record<number, Record<string, number>> = {};
  const allErrorDetails: Record<string, number> = {};

  for (const p of points) {
    if (!p.timestamp || isNaN(p.timestamp)) continue;

    minTime = Math.min(minTime, p.timestamp);
    maxTime = Math.max(maxTime, p.timestamp);

    if (p.success) successCount++;
    else errorCount++;

    const label = p.label;
    labelsSet.add(label);

    if (!grouped[label]) {
      grouped[label] = {
        label,
        count: 0,
        totalElapsed: 0,
        totalLatency: 0,
        totalBytes: 0,
        totalSentBytes: 0,
        min: Infinity,
        max: -Infinity,
        errors: 0,
        responseTimes: [],
        latencyTimes: [],
      };
    }

    const g = grouped[label];
    g.count++;
    g.totalElapsed += p.elapsed;
    g.totalLatency += p.latency;
    g.totalBytes += p.bytesReceived;
    g.totalSentBytes += p.bytesSent;
    g.min = Math.min(g.min, p.elapsed);
    g.max = Math.max(g.max, p.elapsed);
    if (!p.success) g.errors++;
    g.responseTimes.push(p.elapsed);
    g.latencyTimes.push(p.latency);

    // Time series bucket (1s intervals)
    const bucket = Math.floor(p.timestamp / intervalMs) * intervalMs;

    if (!timeSeries[bucket]) {
      timeSeries[bucket] = {};
    }
    const ts = timeSeries[bucket];

    const rpsKey = `requestsPerSecond_${label}`;
    const errKey = `errorsPerSecond_${label}`;
    const thrKey = `activeThreads_${label}`;
    const bytKey = `bytes_${label}`;
    const sbyKey = `sentBytes_${label}`;
    const elpKey = `elapsed_${label}`;
    const latKey = `latency_${label}`;
    const chkKey = `checksPerSecond_${label}`;
    const detKey = `errorDetails_${label}`;

    ts[rpsKey] = ((ts[rpsKey] as number) || 0) + 1;
    if (!p.success) {
      ts[errKey] = ((ts[errKey] as number) || 0) + 1;
      const code = p.responseCode || '000';
      const msg = p.responseMessage || HTTP_ERROR_CODES[code] || 'Error';
      const errorKey = `${code}: ${msg}`;
      if (!ts[detKey]) ts[detKey] = {};
      (ts[detKey] as Record<string, number>)[errorKey] = ((ts[detKey] as Record<string, number>)[errorKey] || 0) + 1;
      allErrorDetails[errorKey] = (allErrorDetails[errorKey] || 0) + 1;
    } else {
      ts[chkKey] = ((ts[chkKey] as number) || 0) + 1;
    }
    ts[thrKey] = Math.max((ts[thrKey] as number) || 0, p.activeUsers);
    ts[bytKey] = ((ts[bytKey] as number) || 0) + p.bytesReceived;
    ts[sbyKey] = ((ts[sbyKey] as number) || 0) + p.bytesSent;
    ts[elpKey] = p.elapsed;
    ts[latKey] = p.latency;

    // Track threads for ramp-up calculation
    if (p.activeUsers > 0) {
      if (!threadsByTimestamp[p.timestamp]) threadsByTimestamp[p.timestamp] = {};
      threadsByTimestamp[p.timestamp][label] = Math.max(
        threadsByTimestamp[p.timestamp][label] || 0,
        p.activeUsers,
      );
      threadsByLabel[label] = Math.max(threadsByLabel[label] || 0, p.activeUsers);
    }
  }

  // Build aggregate report
  const durationSeconds = (maxTime - minTime) / 1000 || 1;
  const labels = Array.from(labelsSet);

  const aggregateReport: AggregateReportItem[] = Object.values(grouped).map(g => {
    g.responseTimes.sort((a, b) => a - b);
    g.latencyTimes.sort((a, b) => a - b);
    const avg = g.totalElapsed / g.count;
    const avgLatency = g.totalLatency / g.count;
    return {
      label: g.label,
      average: Number(avg.toFixed(2)),
      median: Number(median(g.responseTimes).toFixed(2)),
      p90: Number(percentile(g.responseTimes, 0.9).toFixed(2)),
      p95: Number(percentile(g.responseTimes, 0.95).toFixed(2)),
      min: Number(g.min.toFixed(2)),
      max: Number(g.max.toFixed(2)),
      errorRate: Number(((g.errors / g.count) * 100).toFixed(2)),
      throughput: Number((g.count / durationSeconds).toFixed(2)),
      count: g.count,
      averageLatency: Number(avgLatency.toFixed(2)),
      medianLatency: Number(median(g.latencyTimes).toFixed(2)),
      bytes: Number((g.totalBytes / g.count).toFixed(2)),
      sentBytes: Number((g.totalSentBytes / g.count).toFixed(2)),
    };
  });

  // Build time series data
  const seriesData: TimeSeriesEntry[] = Object.entries(timeSeries)
    .map(([bucketStr, ts]) => {
      const bucket = Number(bucketStr);
      const entry: TimeSeriesEntry = {
        time: new Date(bucket).toLocaleTimeString('pt-BR', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        timeStamp: bucket,
        totalActiveThreads: 0,
        totalRequestsPerSecond: 0,
        totalChecksPerSecond: 0,
        totalErrorsPerSecond: 0,
      };

      for (const label of labels) {
        entry[`requestsPerSecond_${label}`] = (ts[`requestsPerSecond_${label}`] as number) || 0;
        entry[`errorsPerSecond_${label}`] = (ts[`errorsPerSecond_${label}`] as number) || 0;
        entry[`activeThreads_${label}`] = (ts[`activeThreads_${label}`] as number) || 0;
        entry[`bytes_${label}`] = (ts[`bytes_${label}`] as number) || 0;
        entry[`sentBytes_${label}`] = (ts[`sentBytes_${label}`] as number) || 0;
        entry[`elapsed_${label}`] = (ts[`elapsed_${label}`] as number) || 0;
        entry[`latency_${label}`] = (ts[`latency_${label}`] as number) || 0;
        entry[`checksPerSecond_${label}`] = (ts[`checksPerSecond_${label}`] as number) || 0;
        entry[`errorDetails_${label}`] = (ts[`errorDetails_${label}`] as Record<string, number>) || {};

        entry.totalActiveThreads += (ts[`activeThreads_${label}`] as number) || 0;
        entry.totalRequestsPerSecond += (ts[`requestsPerSecond_${label}`] as number) || 0;
        entry.totalChecksPerSecond += (ts[`checksPerSecond_${label}`] as number) || 0;
        entry.totalErrorsPerSecond += (ts[`errorsPerSecond_${label}`] as number) || 0;
      }

      return entry;
    })
    .sort((a, b) => (a.timeStamp as number) - (b.timeStamp as number));

  // Error details sorted by frequency
  const errorDetails: ErrorDetail[] = Object.entries(allErrorDetails)
    .map(([message, count]) => {
      const [code, ...msgParts] = message.split(': ');
      return { code, message: msgParts.join(': '), count };
    })
    .sort((a, b) => b.count - a.count);

  // Ramp-up calculation
  const sortedTs = Object.keys(threadsByTimestamp).map(Number).sort((a, b) => a - b);
  let maxUsers = 0;
  let rampStart: number | null = null;
  let rampEnd: number | null = null;

  for (const ts of sortedTs) {
    const total = Object.values(threadsByTimestamp[ts]).reduce((s, n) => s + n, 0);
    if (rampStart === null && total > 0) rampStart = ts;
    if (total > maxUsers) maxUsers = total;
  }
  for (const ts of sortedTs) {
    const total = Object.values(threadsByTimestamp[ts]).reduce((s, n) => s + n, 0);
    if (total === maxUsers) { rampEnd = ts; break; }
  }

  const maxUsersPerTest = Object.values(threadsByLabel).length
    ? Math.max(...Object.values(threadsByLabel))
    : 0;

  return {
    framework,
    successCount,
    errorCount,
    startTime: new Date(minTime).toLocaleString('pt-BR'),
    endTime: new Date(maxTime).toLocaleString('pt-BR'),
    rampUpInfo: {
      users: maxUsers,
      usersPerTest: maxUsersPerTest,
      duration: formatDuration(rampEnd && rampStart ? rampEnd - rampStart : 0),
    },
    aggregateReport,
    timeSeriesData: seriesData,
    errorDetails,
    labels,
  };
}

/**
 * Auto-detects the framework and parses the content.
 * Returns the full AnalysisResult ready to render.
 */
export function parseAndAnalyze(content: string, forcedParser?: string): AnalysisResult {
  const parser = forcedParser
    ? getParserByName(forcedParser)
    : detectParser(content);

  if (!parser) {
    throw new Error('Formato de arquivo não reconhecido. Suportados: JMeter (.jtl/.csv), K6 (.json/.csv), Locust (_stats.csv), Artillery (.json), Newman (.json), Gatling (.log), Vegeta (.json).');
  }

  const points = parser.parse(content);
  return computeAnalysis(points, parser.displayName);
}
