import { analyzeTest } from "@/lib/analysis";
import type { AnalysisResult } from "@/lib/parsers";

function createMockResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    schemaVersion: 2,
    framework: "Test",
    sourceFormat: "test",
    dataQuality: "certified",
    capabilities: {
      requestSamples: true,
      timeSeries: true,
      activeUsers: true,
      responseTime: true,
      waitingTime: true,
      networkBytes: false,
      checks: false,
      thresholds: false,
      errors: true,
    },
    diagnostics: [],
    successCount: 100,
    errorCount: 0,
    startTime: "2025-01-01T10:00:00.000Z",
    endTime: "2025-01-01T10:01:00.000Z",
    startTimestamp: 1735725600000,
    endTimestamp: 1735725660000,
    durationMs: 60000,
    rampUpInfo: { users: 10, usersPerTest: 10, duration: "60s" },
    aggregateReport: [
      {
        label: "Login",
        count: 100,
        average: 150,
        median: 120,
        p90: 250,
        p95: 350,
        min: 50,
        max: 600,
        errorRate: 0,
        throughput: 1.67,
        averageLatency: null,
        medianLatency: null,
        p90Latency: null,
        p95Latency: null,
        bytes: null,
        sentBytes: null,
      },
    ],
    timeSeriesData: [],
    heatmaps: [],
    phaseStats: [],
    errorDetails: [],
    labels: ["Login"],
    checks: [],
    thresholds: [],
    ...overrides,
  };
}

describe("analyzeTest", () => {
  it("returns good status for acceptable results", () => {
    const result = createMockResult();
    const analysis = analyzeTest(result);
    expect(analysis.overallSeverity).toBe("good");
    expect(analysis.duration.durationFormatted).toBe("1m 0s");
  });

  it("detects high error rate as critical", () => {
    const result = createMockResult({ successCount: 90, errorCount: 10 });
    const analysis = analyzeTest(result);
    expect(analysis.overallSeverity).toBe("critical");
    const errorInsight = analysis.insights.find(i => i.metric === "errorRate");
    expect(errorInsight).toBeDefined();
    expect(errorInsight?.severity).toBe("critical");
  });

  it("detects slow response time as warning", () => {
    const result = createMockResult({
      aggregateReport: [
        {
          label: "Login",
          count: 100,
          average: 1200,
          median: 1000,
          p90: 1800,
          p95: 2500,
          min: 500,
          max: 5000,
          errorRate: 0,
          throughput: 1.67,
          averageLatency: null,
          medianLatency: null,
          p90Latency: null,
          p95Latency: null,
          bytes: null,
          sentBytes: null,
        },
      ],
    });
    const analysis = analyzeTest(result);
    expect(analysis.overallSeverity).toBe("critical");
    const p95Insight = analysis.insights.find(i => i.metric === "p95");
    expect(p95Insight).toBeDefined();
    expect(p95Insight?.severity).toBe("critical");
  });

  it("estimates capacity from time series", () => {
    const result = createMockResult({
      timeSeriesData: [
        { time: "2025-01-01T10:00:00Z", timeStamp: 0, totalActiveThreads: 10, totalRequestsPerSecond: 5, totalChecksPerSecond: 0, totalErrorsPerSecond: 0, vus: 10, rps: 5, errs: 0, checks: 0, checksFailed: 0, bucketSeconds: 1 },
        { time: "2025-01-01T10:00:01Z", timeStamp: 1000, totalActiveThreads: 20, totalRequestsPerSecond: 10, totalChecksPerSecond: 0, totalErrorsPerSecond: 0, vus: 20, rps: 10, errs: 0, checks: 0, checksFailed: 0, bucketSeconds: 1 },
        { time: "2025-01-01T10:00:02Z", timeStamp: 2000, totalActiveThreads: 30, totalRequestsPerSecond: 15, totalChecksPerSecond: 0, totalErrorsPerSecond: 2, vus: 30, rps: 15, errs: 2, checks: 0, checksFailed: 0, bucketSeconds: 1 },
      ],
    });
    const analysis = analyzeTest(result);
    expect(analysis.capacity.maxConcurrentUsers).toBe(30);
    expect(analysis.capacity.maxRequestsPerSecond).toBe(15);
    expect(analysis.capacity.bottleneckAt).toBe(30);
  });

  it("detects bottleneck when p95 spikes", () => {
    const result = createMockResult({
      timeSeriesData: Array.from({ length: 10 }, (_, i) => ({
        time: `2025-01-01T10:00:${String(i).padStart(2, "0")}Z`,
        timeStamp: i * 1000,
        totalActiveThreads: 10,
        totalRequestsPerSecond: 5,
        totalChecksPerSecond: 0,
        totalErrorsPerSecond: 0,
        vus: 10,
        rps: 5,
        errs: 0,
        checks: 0,
        checksFailed: 0,
        bucketSeconds: 1,
        durationP95: i === 5 ? 3000 : 200,
      })),
    });
    const analysis = analyzeTest(result);
    const bottleneck = analysis.insights.find(i => i.type === "bottleneck");
    expect(bottleneck).toBeDefined();
    expect(bottleneck?.severity).toBe("critical");
  });
});
