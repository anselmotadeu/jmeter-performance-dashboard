import type { PerformanceParser, NormalizedPoint } from './types';

// Artillery JSON report format (produced by `artillery run --output result.json`)
// Contains "aggregate" section with overall stats and "intermediate" for time buckets.

type ArtilleryReport = {
  aggregate?: {
    timestamp?: string;
    counters?: Record<string, number>;
    rates?: Record<string, number>;
    summaries?: Record<string, {
      min: number;
      max: number;
      mean: number;
      p50: number;
      p75: number;
      p95: number;
      p99: number;
      count: number;
    }>;
    errors?: Record<string, number>;
  };
  intermediate?: Array<{
    timestamp?: string;
    counters?: Record<string, number>;
    rates?: Record<string, number>;
    summaries?: Record<string, {
      min: number;
      max: number;
      mean: number;
      p50: number;
      p75: number;
      p95: number;
      p99: number;
      count: number;
    }>;
  }>;
};

export const artilleryParser: PerformanceParser = {
  name: 'artillery',
  displayName: 'Artillery',
  supportedExtensions: ['.json'],

  detect(firstLines: string): boolean {
    try {
      const data = JSON.parse(firstLines);
      return 'aggregate' in data && ('intermediate' in data || 'phases' in data);
    } catch {
      return firstLines.includes('"aggregate"') && firstLines.includes('"counters"');
    }
  },

  parse(content: string): NormalizedPoint[] {
    let report: ArtilleryReport;
    try {
      report = JSON.parse(content);
    } catch {
      return [];
    }

    const points: NormalizedPoint[] = [];

    // Use intermediate buckets for time series; fall back to aggregate if not present
    const buckets = report.intermediate ?? (report.aggregate ? [report.aggregate] : []);

    for (const bucket of buckets) {
      const ts = bucket.timestamp ? new Date(bucket.timestamp).getTime() : Date.now();
      const counters = bucket.counters ?? {};
      const summaries = bucket.summaries ?? {};
      const rates = bucket.rates ?? {};

      const totalRequests = counters['http.requests'] ?? 0;
      const totalErrors = counters['http.request_rate'] ?? 0;
      const vus = Math.round(rates['http.request_rate'] ?? 0);

      // Extract per-scenario or global http response time
      for (const [key, summary] of Object.entries(summaries)) {
        if (!key.includes('response_time') && !key.includes('http.response_time')) continue;

        const label = key.replace(/^(plugins\.)?http\.response_time/, 'HTTP').replace(/_/g, ' ').trim() || 'Artillery';

        if (totalRequests > 0) {
          points.push({
            timestamp: ts,
            label,
            elapsed: summary.mean,
            success: true,
            activeUsers: vus,
            latency: summary.p50,
            bytesReceived: 0,
            bytesSent: 0,
            responseCode: '200',
          });
        }

        if (totalErrors > 0) {
          points.push({
            timestamp: ts,
            label,
            elapsed: summary.mean,
            success: false,
            activeUsers: vus,
            latency: summary.p50,
            bytesReceived: 0,
            bytesSent: 0,
            responseCode: '500',
            responseMessage: 'Error',
          });
        }
      }
    }

    return points;
  },
};
