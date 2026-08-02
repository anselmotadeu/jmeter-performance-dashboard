import Papa from 'papaparse';
import type { PerformanceParser, NormalizedPoint } from './types';

type JMeterRow = {
  timeStamp: string;
  elapsed: string;
  label: string;
  responseCode: string;
  responseMessage: string;
  threadName: string;
  dataType: string;
  success: string;
  failureMessage: string;
  bytes: string;
  sentBytes: string;
  grpThreads: string;
  allThreads: string;
  URL: string;
  Latency: string;
  IdleTime: string;
  Connect: string;
};

export const jmeterParser: PerformanceParser = {
  name: 'jmeter',
  displayName: 'Apache JMeter',
  supportedExtensions: ['.jtl', '.csv'],

  detect(firstLines: string): boolean {
    const lower = firstLines.toLowerCase();
    return (
      lower.includes('timestamp') &&
      (lower.includes('elapsed') || lower.includes('latency')) &&
      lower.includes('label') &&
      lower.includes('success')
    );
  },

  parse(content: string): NormalizedPoint[] {
    const points: NormalizedPoint[] = [];

    const result = Papa.parse<JMeterRow>(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    for (const row of result.data) {
      const timeStamp = Number(row.timeStamp);
      if (!timeStamp || isNaN(timeStamp)) continue;

      const elapsed = Number(row.elapsed) || 0;
      const latency = Number(row.Latency) || 0;
      const allThreads = Number(row.allThreads) || 0;
      const bytesReceived = Number(row.bytes) || 0;
      const bytesSent = Number(row.sentBytes) || 0;
      const success = row.success === 'true';

      points.push({
        timestamp: timeStamp,
        label: row.label || 'Unknown',
        elapsed,
        success,
        activeUsers: allThreads,
        latency,
        bytesReceived,
        bytesSent,
        responseCode: row.responseCode || undefined,
        responseMessage: success ? undefined : (row.responseMessage || row.failureMessage || undefined),
      });
    }

    return points;
  },
};
