import type { NormalizedPoint, PerformanceParser } from './types';

type K6JsonLine = {
  type?: string;
  metric?: string;
  data?: { time?: string; value?: number; tags?: Record<string, string> };
};

function parseLines(content: string) {
  const parsed: K6JsonLine[] = [];
  for (const line of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { parsed.push(JSON.parse(line)); } catch { /* diagnóstico final cobre arquivos sem pontos */ }
  }
  return parsed;
}

function fingerprint(item: K6JsonLine) {
  const tags = item.data?.tags ?? {};
  return [item.data?.time, tags.name || tags.url, tags.method, tags.scenario, tags.group].join('::');
}

function metricValues(items: K6JsonLine[], metric: string) {
  const result = new Map<string, number[]>();
  for (const item of items) {
    if (item.type !== 'Point' || item.metric !== metric || !Number.isFinite(item.data?.value)) continue;
    const key = fingerprint(item);
    const values = result.get(key) ?? [];
    values.push(item.data?.value ?? 0);
    result.set(key, values);
  }
  return result;
}

function gaugeAt(points: Array<[number, number]>, timestamp: number) {
  let left = 0;
  let right = points.length - 1;
  let value: number | null = null;
  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    if (points[middle][0] <= timestamp) { value = points[middle][1]; left = middle + 1; }
    else right = middle - 1;
  }
  return value;
}

export const k6JsonParser: PerformanceParser = {
  name: 'k6-ndjson',
  displayName: 'k6 NDJSON',
  supportedExtensions: ['.json'],
  dataQuality: 'certified',
  capabilities: {
    requestSamples: true,
    timeSeries: true,
    activeUsers: true,
    responseTime: true,
    waitingTime: true,
    networkBytes: false,
    errors: true,
  },

  detect(sample) {
    const firstValid = sample.replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim());
    if (!firstValid) return false;
    try {
      const item = JSON.parse(firstValid) as K6JsonLine;
      return ['Metric', 'Point'].includes(item.type ?? '') && typeof item.metric === 'string' && typeof item.data === 'object';
    } catch {
      return false;
    }
  },

  parse(content) {
    const items = parseLines(content);
    const waiting = metricValues(items, 'http_req_waiting');
    const blocked = metricValues(items, 'http_req_blocked');
    const connecting = metricValues(items, 'http_req_connecting');
    const sending = metricValues(items, 'http_req_sending');
    const receiving = metricValues(items, 'http_req_receiving');
    const failed = metricValues(items, 'http_req_failed');
    const consumed = new Map<string, number>();
    const vusBySecond = new Map<number, number>();

    for (const item of items) {
      if (item.type !== 'Point' || item.metric !== 'vus' || !item.data?.time || !Number.isFinite(item.data.value)) continue;
      const eventTimestamp = Date.parse(item.data.time);
      if (!Number.isFinite(eventTimestamp)) continue;
      const second = Math.floor(eventTimestamp / 1000) * 1000;
      vusBySecond.set(second, Math.max(vusBySecond.get(second) ?? 0, item.data.value ?? 0));
    }

    const points: NormalizedPoint[] = [];
    const vusTimeline = Array.from(vusBySecond.entries()).sort(([a], [b]) => a - b);
    for (const item of items) {
      if (item.type !== 'Point' || item.metric !== 'http_req_duration' || !item.data?.time || !Number.isFinite(item.data.value)) continue;
      const eventTimestamp = Date.parse(item.data.time);
      if (!Number.isFinite(eventTimestamp)) continue;
      const elapsed = item.data.value ?? 0;
      const timestamp = Math.max(0, eventTimestamp - elapsed);
      const tags = item.data.tags ?? {};
      const key = fingerprint(item);
      const index = consumed.get(key) ?? 0;
      consumed.set(key, index + 1);
      const failedValue = failed.get(key)?.[index];
      const expected = tags.expected_response?.toLowerCase();
      const statusNumber = Number(tags.status);
      const success = failedValue !== undefined
        ? failedValue === 0
        : expected
          ? expected === 'true'
          : !tags.error && (!tags.status || (statusNumber >= 200 && statusNumber < 400));
      const second = Math.floor(eventTimestamp / 1000) * 1000;

      points.push({
        timestamp,
        label: tags.name || tags.url || tags.scenario || 'Sem nome',
        elapsed,
        success,
        activeUsers: vusBySecond.get(second) ?? gaugeAt(vusTimeline, second),
        latency: waiting.get(key)?.[index] ?? null,
        bytesReceived: null,
        bytesSent: null,
        responseCode: tags.status,
        responseMessage: success ? undefined : (tags.error || tags.error_code || (tags.status ? `HTTP ${tags.status}` : 'Falha k6')),
        blocked: blocked.get(key)?.[index] ?? null,
        connecting: connecting.get(key)?.[index] ?? null,
        sending: sending.get(key)?.[index] ?? null,
        receiving: receiving.get(key)?.[index] ?? null,
      });
    }
    return points;
  },
};
