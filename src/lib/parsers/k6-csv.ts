import Papa from 'papaparse';
import type { NormalizedPoint, PerformanceParser } from './types';

type K6CsvRow = Record<string, string>;

function normalizeTimestamp(value: string) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 1e17) return numeric / 1e6;
    if (numeric >= 1e14) return numeric / 1e3;
    if (numeric >= 1e11) return numeric;
    return numeric * 1000;
  }
  return Date.parse(value);
}

function fingerprint(row: K6CsvRow) {
  return [row.timestamp, row.name || row.url, row.method, row.scenario, row.group].join('::');
}

function valuesByKey(rows: K6CsvRow[], metric: string) {
  const result = new Map<string, number[]>();
  for (const row of rows) {
    if (row.metric_name !== metric) continue;
    const value = Number(row.metric_value);
    if (!Number.isFinite(value)) continue;
    const key = fingerprint(row);
    const values = result.get(key) ?? [];
    values.push(value);
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

export const k6CsvParser: PerformanceParser = {
  name: 'k6-csv',
  displayName: 'k6 CSV',
  supportedExtensions: ['.csv'],
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
    const header = sample.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0].toLowerCase();
    return header.includes('metric_name') && header.includes('timestamp') && header.includes('metric_value');
  },

  parse(content) {
    const parsed = Papa.parse<K6CsvRow>(content.replace(/^\uFEFF/, ''), {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
    });
    const rows = parsed.data;
    const waiting = valuesByKey(rows, 'http_req_waiting');
    const blocked = valuesByKey(rows, 'http_req_blocked');
    const connecting = valuesByKey(rows, 'http_req_connecting');
    const sending = valuesByKey(rows, 'http_req_sending');
    const receiving = valuesByKey(rows, 'http_req_receiving');
    const failed = valuesByKey(rows, 'http_req_failed');
    const consumed = new Map<string, number>();
    const vusBySecond = new Map<number, number>();

    for (const row of rows) {
      if (row.metric_name !== 'vus') continue;
      const timestamp = normalizeTimestamp(row.timestamp);
      const value = Number(row.metric_value);
      if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
      const second = Math.floor(timestamp / 1000) * 1000;
      vusBySecond.set(second, Math.max(vusBySecond.get(second) ?? 0, value));
    }

    const points: NormalizedPoint[] = [];
    const vusTimeline = Array.from(vusBySecond.entries()).sort(([a], [b]) => a - b);
    for (const row of rows) {
      if (row.metric_name !== 'http_req_duration') continue;
      const eventTimestamp = normalizeTimestamp(row.timestamp);
      const elapsed = Number(row.metric_value);
      if (!Number.isFinite(eventTimestamp) || !Number.isFinite(elapsed)) continue;
      const timestamp = Math.max(0, eventTimestamp - elapsed);
      const key = fingerprint(row);
      const index = consumed.get(key) ?? 0;
      consumed.set(key, index + 1);
      const failedValue = failed.get(key)?.[index];
      const expectedResponse = row.expected_response?.toLowerCase();
      const status = row.status || undefined;
      const statusNumber = Number(status);
      const success = failedValue !== undefined
        ? failedValue === 0
        : expectedResponse
          ? expectedResponse === 'true'
          : !row.error && (!status || (statusNumber >= 200 && statusNumber < 400));
      const second = Math.floor(eventTimestamp / 1000) * 1000;

      points.push({
        timestamp,
        label: row.name || row.url || row.scenario || 'Sem nome',
        elapsed,
        success,
        activeUsers: vusBySecond.get(second) ?? gaugeAt(vusTimeline, second),
        latency: waiting.get(key)?.[index] ?? null,
        bytesReceived: null,
        bytesSent: null,
        responseCode: status,
        responseMessage: success ? undefined : (row.error || row.error_code || (status ? `HTTP ${status}` : 'Falha k6')),
        blocked: blocked.get(key)?.[index] ?? null,
        connecting: connecting.get(key)?.[index] ?? null,
        sending: sending.get(key)?.[index] ?? null,
        receiving: receiving.get(key)?.[index] ?? null,
      });
    }

    for (const row of rows) {
      if (row.metric_name !== 'checks') continue;
      const timestamp = normalizeTimestamp(row.timestamp);
      const value = Number(row.metric_value);
      if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
      const passed = value > 0.5;
      points.push({
        timestamp,
        label: row.check || row.name || 'checks',
        elapsed: 0,
        success: passed,
        activeUsers: null,
        latency: null,
        bytesReceived: null,
        bytesSent: null,
        checks: passed ? 1 : 0,
      });
    }

    if (!points.length && parsed.errors.length) throw new Error(`CSV k6 inválido: ${parsed.errors[0].message}`);
    return points;
  },
};
