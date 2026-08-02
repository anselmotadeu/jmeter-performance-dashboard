export type NormalizedPoint = {
  timestamp: number;
  label: string;
  elapsed: number;
  success: boolean;
  activeUsers: number;
  latency: number;
  bytesReceived: number;
  bytesSent: number;
  responseCode?: string;
  responseMessage?: string;
};

export type AggregateReportItem = {
  label: string;
  average: number;
  median: number;
  p90: number;
  p95: number;
  min: number;
  max: number;
  errorRate: number;
  throughput: number;
  count: number;
  averageLatency: number;
  medianLatency: number;
  bytes: number;
  sentBytes: number;
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

export type ErrorDetail = {
  code: string;
  message: string;
  count: number;
};

export type AnalysisResult = {
  framework: string;
  successCount: number;
  errorCount: number;
  startTime: string;
  endTime: string;
  rampUpInfo: {
    users: number;
    usersPerTest: number;
    duration: string;
  };
  aggregateReport: AggregateReportItem[];
  timeSeriesData: TimeSeriesEntry[];
  errorDetails: ErrorDetail[];
  labels: string[];
};

export interface PerformanceParser {
  readonly name: string;
  readonly displayName: string;
  readonly supportedExtensions: string[];
  detect(firstLines: string): boolean;
  parse(content: string): NormalizedPoint[];
}
