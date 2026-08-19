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
  SampleCount?: string;
  ErrorCount?: string;
};

export function jmeterRowToPoint(row: JMeterRow): NormalizedPoint | null {
  if (Number(row.SampleCount ?? 1) > 1 || Number(row.ErrorCount ?? 0) > 1) {
    throw new Error('Relatórios JMeter já agregados não são aceitos como JTL request-level. Exporte os samples individuais em CSV.');
  }
  const numericTimestamp = Number(row.timeStamp);
  const timeStamp = Number.isFinite(numericTimestamp)
    ? (numericTimestamp < 1e12 ? numericTimestamp * 1000 : numericTimestamp)
    : Date.parse(row.timeStamp);
  if (!Number.isFinite(timeStamp)) return null;

  const elapsed = Number(row.elapsed) || 0;
  const latency = Number(row.Latency) || 0;
  const allThreads = Number(row.allThreads) || 0;
  const bytesReceived = Number(row.bytes) || 0;
  const bytesSent = Number(row.sentBytes) || 0;
  const success = ['true', '1', 'yes', 'ok', 'passed'].includes(String(row.success).trim().toLowerCase());

  return {
    timestamp: timeStamp,
    label: row.label || 'Unknown',
    elapsed,
    success,
    activeUsers: allThreads,
    latency: row.Latency === undefined || row.Latency === '' ? null : latency,
    bytesReceived: row.bytes === undefined || row.bytes === '' ? null : bytesReceived,
    bytesSent: row.sentBytes === undefined || row.sentBytes === '' ? null : bytesSent,
    responseCode: row.responseCode || undefined,
    responseMessage: success ? undefined : (row.responseMessage || row.failureMessage || undefined),
  };
}

export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += char;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else current += char;
  }
  fields.push(current);
  return fields;
}

export function buildJtlColumns(headerLine: string): Record<string, number> | null {
  const fields = splitCsvLine(headerLine.replace(/^\uFEFF/, ''));
  const index: Record<string, number> = {};
  fields.forEach((field, i) => { index[field.trim().toLowerCase()] = i; });
  if (!('timestamp' in index) || !('label' in index) || !('success' in index) || !('elapsed' in index || 'latency' in index)) {
    return null;
  }
  return index;
}

export function jtlLineToPoint(columns: Record<string, number>, line: string): NormalizedPoint | null {
  if (!line.trim()) return null;
  const fields = splitCsvLine(line);
  const get = (name: string) => (name in columns ? (fields[columns[name]] ?? '') : '');
  return jmeterRowToPoint({
    timeStamp: get('timestamp'),
    elapsed: get('elapsed'),
    label: get('label'),
    responseCode: get('responsecode'),
    responseMessage: get('responsemessage'),
    threadName: get('threadname'),
    dataType: get('datatype'),
    success: get('success'),
    failureMessage: get('failuremessage'),
    bytes: get('bytes'),
    sentBytes: get('sentbytes'),
    grpThreads: get('grpthreads'),
    allThreads: get('allthreads'),
    URL: get('url'),
    Latency: get('latency'),
    IdleTime: get('idletime'),
    Connect: get('connect'),
    SampleCount: get('samplecount'),
    ErrorCount: get('errorcount'),
  });
}

export const jmeterParser: PerformanceParser = {
  name: 'jmeter',
  displayName: 'Apache JMeter',
  supportedExtensions: ['.jtl', '.csv'],
  dataQuality: 'certified',
  capabilities: {
    requestSamples: true,
    timeSeries: true,
    activeUsers: true,
    responseTime: true,
    waitingTime: true,
    networkBytes: true,
    errors: true,
  },

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
      if (Number(row.SampleCount ?? 1) > 1 || Number(row.ErrorCount ?? 0) > 1) {
        throw new Error('Relatórios JMeter já agregados não são aceitos como JTL request-level. Exporte os samples individuais em CSV.');
      }
      const numericTimestamp = Number(row.timeStamp);
      const timeStamp = Number.isFinite(numericTimestamp)
        ? (numericTimestamp < 1e12 ? numericTimestamp * 1000 : numericTimestamp)
        : Date.parse(row.timeStamp);
      if (!Number.isFinite(timeStamp)) continue;

      const elapsed = Number(row.elapsed) || 0;
      const latency = Number(row.Latency) || 0;
      const allThreads = Number(row.allThreads) || 0;
      const bytesReceived = Number(row.bytes) || 0;
      const bytesSent = Number(row.sentBytes) || 0;
      const success = ['true', '1', 'yes', 'ok', 'passed'].includes(String(row.success).trim().toLowerCase());

      points.push({
        timestamp: timeStamp,
        label: row.label || 'Unknown',
        elapsed,
        success,
        activeUsers: allThreads,
        latency: row.Latency === undefined || row.Latency === '' ? null : latency,
        bytesReceived: row.bytes === undefined || row.bytes === '' ? null : bytesReceived,
        bytesSent: row.sentBytes === undefined || row.sentBytes === '' ? null : bytesSent,
        responseCode: row.responseCode || undefined,
        responseMessage: success ? undefined : (row.responseMessage || row.failureMessage || undefined),
      });
    }

    if (!points.length && result.errors.length) {
      throw new Error(`CSV JMeter inválido: ${result.errors[0].message}`);
    }

    return points;
  },
};
