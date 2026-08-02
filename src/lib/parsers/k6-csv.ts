import type { PerformanceParser, NormalizedPoint } from './types';

// K6 CSV output — produced with: k6 run --out csv=result.csv
//
// Header: metric_name,timestamp,metric_value,check,error,error_code,
//         expected_response,group,method,name,proto,scenario,service,
//         status,subproto,tls_version,url,extra_tags
//
// Relevant metric_name values:
//   http_req_duration   — response time (ms)
//   http_req_waiting    — latency / TTFB (ms)
//   http_req_failed     — 1 = failed, 0 = ok
//   http_req_receiving  — receive phase (ms)
//   http_req_sending    — send phase (ms)
//   http_req_blocked    — connection blocked time (ms)
//   http_req_connecting — TCP connect time (ms)
//   vus                 — active virtual users (no name/method tags)

export const k6CsvParser: PerformanceParser = {
  name: 'k6-csv',
  displayName: 'K6 CSV',
  supportedExtensions: ['.csv'],

  detect(firstLines: string): boolean {
    return (
      firstLines.includes('metric_name') &&
      firstLines.includes('metric_value') &&
      firstLines.includes('http_req_duration')
    );
  },

  parse(content: string): NormalizedPoint[] {
    const lines = content.split('\n');
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map(h => h.trim());
    const idx = (name: string) => header.indexOf(name);

    const iMetric = idx('metric_name');
    const iTs = idx('timestamp');
    const iVal = idx('metric_value');
    const iName = idx('name');
    const iStatus = idx('status');
    const iError = idx('error');

    if (iMetric < 0 || iTs < 0 || iVal < 0) return [];

    // Aggregate rows by (second, label)
    type Bucket = {
      timestamp: number;
      label: string;
      duration: number | null;
      waiting: number | null;
      failed: number | null;
      status: string;
      error: string;
    };

    const buckets = new Map<string, Bucket>();
    const vusBySecond = new Map<number, number>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      const metric = parts[iMetric]?.trim();
      const tsRaw = parts[iTs]?.trim();
      const val = parseFloat(parts[iVal]?.trim() ?? '');

      if (!metric || !tsRaw || isNaN(val)) continue;

      // K6 CSV timestamps are Unix seconds (integer)
      const tsMs = Number(tsRaw) * 1000;
      const sec = Math.floor(tsMs / 1000) * 1000;

      if (metric === 'vus') {
        vusBySecond.set(sec, Math.max(vusBySecond.get(sec) ?? 0, val));
        continue;
      }

      if (!['http_req_duration', 'http_req_waiting', 'http_req_failed'].includes(metric)) continue;

      const name = (iName >= 0 ? parts[iName]?.trim() : '') || 'Unknown';
      const key = `${sec}::${name}`;

      if (!buckets.has(key)) {
        buckets.set(key, {
          timestamp: tsMs,
          label: name,
          duration: null,
          waiting: null,
          failed: null,
          status: iStatus >= 0 ? (parts[iStatus]?.trim() ?? '') : '',
          error: iError >= 0 ? (parts[iError]?.trim() ?? '') : '',
        });
      }

      const b = buckets.get(key)!;
      if (metric === 'http_req_duration') b.duration = val;
      if (metric === 'http_req_waiting') b.waiting = val;
      if (metric === 'http_req_failed') b.failed = val;
      if (iStatus >= 0 && parts[iStatus]?.trim()) b.status = parts[iStatus].trim();
      if (iError >= 0 && parts[iError]?.trim()) b.error = parts[iError].trim();
    }

    const points: NormalizedPoint[] = [];

    for (const b of buckets.values()) {
      if (b.duration === null) continue;

      const sec = Math.floor(b.timestamp / 1000) * 1000;
      const vus = vusBySecond.get(sec) ?? 0;
      const success = b.failed === null ? b.status === '200' || b.status === '' : b.failed === 0;
      const elapsed = b.duration;
      const latency = b.waiting ?? Math.floor(elapsed * 0.7);
      const responseCode = b.status || (success ? '200' : '500');

      points.push({
        timestamp: b.timestamp,
        label: b.label,
        elapsed,
        success,
        activeUsers: vus,
        latency,
        bytesReceived: 0,
        bytesSent: 0,
        responseCode,
        responseMessage: success ? undefined : (b.error || 'failed'),
      });
    }

    return points;
  },
};
