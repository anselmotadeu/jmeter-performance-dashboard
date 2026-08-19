import type { PerformanceParser, NormalizedPoint } from './types';

// Vegeta load testing tool JSON dump output.
// Produced with: vegeta attack ... | vegeta dump -dumper json
//
// Each line is a JSON object:
// {
//   "seq": 0,
//   "attack": "my-attack",
//   "seq": 1,
//   "timestamp": "2024-01-15T10:00:01.123456789Z",
//   "elapsed": 150234567,   // nanoseconds
//   "bytes_out": 256,
//   "bytes_in": 1024,
//   "status": 200,
//   "error": "",
//   "body": "...",
//   "method": "GET",
//   "url": "http://api.example.com/users",
//   "headers": {...},
//   "latencies": {
//     "total": 150234567,
//     "mean": 148000000,
//     "50th": 148000000,
//     "95th": 150000000,
//     "99th": 150234567,
//     "max": 150234567,
//     "min": 148000000
//   }
// }
//
// Vegeta also produces binary results and HDR histogram dumps.
// This parser handles the JSON dump format only.

type VegetaRecord = {
  seq?: number;
  attack?: string;
  timestamp?: string;
  elapsed?: number;
  bytes_out?: number;
  bytes_in?: number;
  status?: number;
  error?: string;
  method?: string;
  url?: string;
  latencies?: {
    total?: number;
    mean?: number;
  };
};

function extractLabel(record: VegetaRecord): string {
  if (record.attack) return record.attack;
  if (record.method && record.url) {
    try {
      const u = new URL(record.url);
      return `${record.method} ${u.pathname}`;
    } catch {
      return `${record.method} ${record.url}`;
    }
  }
  return 'Unknown';
}

export const vegetaParser: PerformanceParser = {
  name: 'vegeta',
  displayName: 'Vegeta',
  supportedExtensions: ['.json'],

  detect(firstLines: string): boolean {
    // Vegeta JSON dump: each line is a JSON object with "elapsed" in nanoseconds
    // and "bytes_in"/"bytes_out" fields (distinct from K6 which has "type":"Point")
    try {
      const firstLine = firstLines.split('\n').find(l => l.trim().startsWith('{'));
      if (!firstLine) return false;
      const obj = JSON.parse(firstLine);
      return (
        typeof obj.elapsed === 'number' &&
        obj.elapsed > 1_000_000 && // nanoseconds — even 1ms = 1_000_000 ns
        (typeof obj.bytes_in === 'number' || typeof obj.bytes_out === 'number') &&
        typeof obj.status === 'number' &&
        !obj.type // K6 JSON has "type" field; Vegeta does not
      );
    } catch {
      return false;
    }
  },

  parse(content: string): NormalizedPoint[] {
    const lines = content.split('\n');
    const points: NormalizedPoint[] = [];

    // Pass 1: find min timestamp to compute relative VU windows
    let minTs = Infinity;
    const records: VegetaRecord[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      try {
        const r: VegetaRecord = JSON.parse(trimmed);
        if (!r.timestamp || !r.elapsed) continue;
        const ts = new Date(r.timestamp).getTime();
        if (!isNaN(ts)) {
          minTs = Math.min(minTs, ts);
          records.push(r);
        }
      } catch {
        continue;
      }
    }

    if (!records.length) return [];

    // Vegeta by default runs with a fixed request rate so VU count = concurrency.
    // We estimate active users per second as the count of requests in that second.
    const requestsPerSec = new Map<number, number>();
    for (const r of records) {
      const ts = new Date(r.timestamp!).getTime();
      const sec = Math.floor(ts / 1000) * 1000;
      requestsPerSec.set(sec, (requestsPerSec.get(sec) ?? 0) + 1);
    }

    for (const r of records) {
      const ts = new Date(r.timestamp!).getTime();
      const sec = Math.floor(ts / 1000) * 1000;

      // Vegeta elapsed is in nanoseconds
      const elapsed = Math.round((r.elapsed ?? 0) / 1_000_000);
      const latencyNs = r.latencies?.total ?? r.elapsed ?? 0;
      const latency = Math.round(latencyNs / 1_000_000);
      const success = (r.status ?? 0) >= 200 && (r.status ?? 0) < 400;
      const activeUsers = requestsPerSec.get(sec) ?? 1;

      points.push({
        timestamp: ts,
        label: extractLabel(r),
        elapsed,
        success,
        activeUsers,
        latency,
        bytesReceived: r.bytes_in ?? 0,
        bytesSent: r.bytes_out ?? 0,
        responseCode: r.status?.toString() ?? (success ? '200' : '500'),
        responseMessage: success ? undefined : (r.error || undefined),
      });
    }

    return points;
  },
};
