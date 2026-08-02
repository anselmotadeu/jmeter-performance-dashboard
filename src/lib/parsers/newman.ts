import type { PerformanceParser, NormalizedPoint } from './types';

// Newman (Postman CLI) JSON reporter format
// Produced by: newman run collection.json --reporters json --reporter-json-export result.json
// Note: Newman is primarily a functional/contract test tool, not a load test tool.
// Results lack time-series data and VU counts. Useful for pass/fail analysis.

type NewmanExecution = {
  item?: { name?: string };
  response?: {
    responseTime?: number;
    responseSize?: number;
    code?: number;
    status?: string;
  };
  requestError?: string;
};

type NewmanReport = {
  collection?: { info?: { name?: string } };
  run?: {
    stats?: {
      requests?: { total?: number; failed?: number };
      assertions?: { total?: number; failed?: number };
    };
    timings?: { started?: number; completed?: number };
    executions?: NewmanExecution[];
  };
};

export const newmanParser: PerformanceParser = {
  name: 'newman',
  displayName: 'Newman / Postman',
  supportedExtensions: ['.json'],

  detect(firstLines: string): boolean {
    try {
      const data = JSON.parse(firstLines);
      return 'run' in data && 'collection' in data && data.run?.stats !== undefined;
    } catch {
      return firstLines.includes('"run"') && firstLines.includes('"collection"') && firstLines.includes('"stats"');
    }
  },

  parse(content: string): NormalizedPoint[] {
    let report: NewmanReport;
    try {
      report = JSON.parse(content);
    } catch {
      return [];
    }

    const points: NormalizedPoint[] = [];
    const executions = report.run?.executions ?? [];
    const startedAt = report.run?.timings?.started ?? Date.now();

    for (let i = 0; i < executions.length; i++) {
      const exec = executions[i];
      const label = exec.item?.name ?? `Request ${i + 1}`;
      const response = exec.response;

      if (!response) continue;

      const elapsed = response.responseTime ?? 0;
      const code = String(response.code ?? '0');
      const success = !exec.requestError && Number(code) < 400;

      points.push({
        timestamp: startedAt + i * 100,
        label,
        elapsed,
        success,
        activeUsers: 1,
        latency: elapsed * 0.5,
        bytesReceived: response.responseSize ?? 0,
        bytesSent: 0,
        responseCode: code,
        responseMessage: success ? undefined : (exec.requestError ?? response.status),
      });
    }

    return points;
  },
};
