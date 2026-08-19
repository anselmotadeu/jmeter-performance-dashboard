import Papa from 'papaparse';
import type { PerformanceParser, NormalizedPoint } from './types';

// Locust exports stats CSV via `locust --csv=result` which creates
// result_stats.csv with aggregated stats (NOT per-request rows).
// This parser produces synthetic NormalizedPoints from the aggregated data.
// For full per-request detail, Locust would need a custom listener.

type LocustStatsRow = {
  Type: string;
  Name: string;
  'Request Count': string;
  'Failure Count': string;
  'Median Response Time': string;
  'Average Response Time': string;
  'Min Response Time': string;
  'Max Response Time': string;
  'Average Content Size': string;
  'Requests/s': string;
  'Failures/s': string;
  '50%': string;
  '66%': string;
  '75%': string;
  '80%': string;
  '90%': string;
  '95%': string;
  '98%': string;
  '99%': string;
  '99.9%': string;
  '99.99%': string;
  '100%': string;
};

export const locustParser: PerformanceParser = {
  name: 'locust',
  displayName: 'Locust',
  supportedExtensions: ['.csv'],

  detect(firstLines: string): boolean {
    return (
      firstLines.includes('Request Count') &&
      firstLines.includes('Failure Count') &&
      (firstLines.includes('Requests/s') || firstLines.includes('Median Response Time'))
    );
  },

  parse(content: string): NormalizedPoint[] {
    const result = Papa.parse<LocustStatsRow>(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    const points: NormalizedPoint[] = [];
    const now = Date.now();

    for (const row of result.data) {
      const name = row.Name?.trim();
      if (!name || name === 'Aggregated') continue;

      const requestCount = Number(row['Request Count']) || 0;
      const failureCount = Number(row['Failure Count']) || 0;
      const avgResponseTime = Number(row['Average Response Time']) || 0;
      const throughput = Number(row['Requests/s']) || 1;
      const avgContentSize = Number(row['Average Content Size']) || 0;

      // Synthetic: create one representative point per endpoint
      // Success requests
      const successCount = requestCount - failureCount;
      if (successCount > 0) {
        points.push({
          timestamp: now,
          label: name,
          elapsed: avgResponseTime,
          success: true,
          activeUsers: Math.round(throughput),
          latency: avgResponseTime * 0.8,
          bytesReceived: avgContentSize,
          bytesSent: 0,
          responseCode: '200',
        });
      }

      // Failure requests
      if (failureCount > 0) {
        points.push({
          timestamp: now,
          label: name,
          elapsed: avgResponseTime,
          success: false,
          activeUsers: Math.round(throughput),
          latency: avgResponseTime * 0.8,
          bytesReceived: 0,
          bytesSent: 0,
          responseCode: '500',
          responseMessage: 'Request Failed',
        });
      }
    }

    return points;
  },
};
