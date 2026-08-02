import type { PerformanceParser, NormalizedPoint } from './types';

type K6JsonLine = {
  type: 'Metric' | 'Point';
  data: {
    name?: string;
    time?: string;
    value?: number;
    tags?: Record<string, string>;
    type?: string;
    contains?: string;
  };
  metric: string;
};

// Correlation key: ISO timestamp + label name
// K6 emits all metrics for a single HTTP request with the same nanosecond timestamp,
// so (time, name) uniquely identifies a request.
type PendingPoint = {
  timestamp: number;
  label: string;
  elapsed?: number;
  failed?: boolean;
  latency?: number;
  status?: string;
  bytesReceived?: number;
  bytesSent?: number;
};

export const k6JsonParser: PerformanceParser = {
  name: 'k6-json',
  displayName: 'k6 (JSON)',
  supportedExtensions: ['.json'],

  detect(firstLines: string): boolean {
    const trimmed = firstLines.trim();
    return (
      (trimmed.startsWith('{"type":"Metric"') || trimmed.startsWith('{"type":"Point"')) &&
      trimmed.includes('"metric"')
    );
  },

  parse(content: string): NormalizedPoint[] {
    const lines = content.split('\n').filter(l => l.trim());

    // Two-pass: collect pending points keyed by (time, label)
    // then merge metrics per request.
    const pending = new Map<string, PendingPoint>();
    const completed: NormalizedPoint[] = [];
    // VUs are a global metric without per-label tags; track by second.
    const vusBySecond = new Map<number, number>();

    for (const line of lines) {
      let parsed: K6JsonLine;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (parsed.type !== 'Point') continue;

      const { metric, data } = parsed;
      const isoTime = data.time;
      const value = data.value ?? 0;
      const tags = data.tags ?? {};

      // Track VUs by second (global metric, no label)
      if (metric === 'vus' && isoTime) {
        const sec = Math.floor(new Date(isoTime).getTime() / 1000) * 1000;
        const current = vusBySecond.get(sec) ?? 0;
        vusBySecond.set(sec, Math.max(current, value));
        continue;
      }

      // Only process HTTP metrics with a name tag
      const label = tags.name || tags.url;
      if (!label || !isoTime) continue;

      const correlationKey = `${isoTime}::${label}`;

      if (metric === 'http_req_duration') {
        const ts = new Date(isoTime).getTime();
        pending.set(correlationKey, {
          timestamp: ts,
          label,
          elapsed: value,
          failed: false,
          status: tags.status,
        });
      } else if (metric === 'http_req_failed') {
        const entry = pending.get(correlationKey);
        if (entry) {
          entry.failed = value === 1;
        }
      } else if (metric === 'http_req_waiting') {
        const entry = pending.get(correlationKey);
        if (entry) {
          entry.latency = value;
        }
      } else if (metric === 'http_req_receiving') {
        const entry = pending.get(correlationKey);
        if (entry) {
          entry.bytesReceived = value;
        }
      } else if (metric === 'http_req_sending') {
        const entry = pending.get(correlationKey);
        if (entry) {
          entry.bytesSent = value;
        }
      }
    }

    // Convert pending map to NormalizedPoints, enriching with VU count
    for (const p of pending.values()) {
      if (p.elapsed === undefined) continue;

      const sec = Math.floor(p.timestamp / 1000) * 1000;
      const activeUsers = vusBySecond.get(sec) ?? 0;

      completed.push({
        timestamp: p.timestamp,
        label: p.label,
        elapsed: p.elapsed,
        success: !p.failed,
        activeUsers,
        latency: p.latency ?? 0,
        bytesReceived: p.bytesReceived ?? 0,
        bytesSent: p.bytesSent ?? 0,
        responseCode: p.status,
        responseMessage: p.failed ? `HTTP ${p.status ?? 'Error'}` : undefined,
      });
    }

    return completed;
  },
};
