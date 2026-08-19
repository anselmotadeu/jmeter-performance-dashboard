export type AnalysisCapabilities = {
  requestSamples: boolean;
  timeSeries: boolean;
  activeUsers: boolean;
  responseTime: boolean;
  waitingTime: boolean;
  networkBytes: boolean;
  checks: boolean;
  thresholds: boolean;
  errors: boolean;
};

export type NormalizedPoint = {
  timestamp: number;
  label: string;
  elapsed: number;
  success: boolean;
  activeUsers: number | null;
  latency: number | null;
  bytesReceived: number | null;
  bytesSent: number | null;
  responseCode?: string;
  responseMessage?: string;
};

export type AggregateReportItem = {
  label: string;
  average: number;
  median: number | null;
  p90: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
  errorRate: number;
  throughput: number;
  count: number;
  averageLatency: number | null;
  medianLatency: number | null;
  p90Latency: number | null;
  p95Latency: number | null;
  bytes: number | null;
  sentBytes: number | null;
};

export type TimeSeriesEntry = {
  time: string;
  timeStamp: number;
  totalActiveThreads: number;
  totalRequestsPerSecond: number;
  totalChecksPerSecond: number;
  totalErrorsPerSecond: number;
  [key: string]: number | string | Record<string, number>;
};

export type ErrorDetail = { code: string; message: string; count: number };
export type ThresholdResult = { metric: string; expression: string; passed: boolean };
export type CheckResult = { name: string; passes: number; fails: number };

export type AnalysisResult = {
  schemaVersion: 2;
  framework: string;
  sourceFormat: string;
  dataQuality: 'certified' | 'beta';
  capabilities: AnalysisCapabilities;
  diagnostics: string[];
  successCount: number;
  errorCount: number;
  startTime: string;
  endTime: string;
  startTimestamp: number | null;
  endTimestamp: number | null;
  durationMs: number;
  rampUpInfo: { users: number; usersPerTest: number; duration: string };
  aggregateReport: AggregateReportItem[];
  timeSeriesData: TimeSeriesEntry[];
  errorDetails: ErrorDetail[];
  labels: string[];
  checks: CheckResult[];
  thresholds: ThresholdResult[];
};

export interface PerformanceParser {
  readonly name: string;
  readonly displayName: string;
  readonly supportedExtensions: string[];
  readonly dataQuality?: 'certified' | 'beta';
  readonly capabilities?: Partial<AnalysisCapabilities>;
  detect(firstLines: string): boolean;
  parse(content: string): NormalizedPoint[] | AnalysisResult;
}
