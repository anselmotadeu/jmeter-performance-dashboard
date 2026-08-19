import fs from "node:fs";
import path from "node:path";
import { parseAndAnalyze } from "@/lib/parsers";
import { createStreamParser } from "@/lib/parsers/stream";
import { buildJtlColumns, jtlLineToPoint, splitCsvLine } from "@/lib/parsers/jmeter";

function fixture(name: string) {
  return fs.readFileSync(path.join(process.cwd(), "Tests", name), "utf8");
}

describe("certified parsers", () => {
  it("processes JMeter JTL with exact totals and per-label metrics", () => {
    const result = parseAndAnalyze(fixture("jmeter-sample.jtl"));
    expect(result.framework).toBe("Apache JMeter");
    expect(result.dataQuality).toBe("certified");
    expect(result.successCount).toBe(5);
    expect(result.errorCount).toBe(1);
    expect(result.rampUpInfo.users).toBe(4);
    expect(result.durationMs).toBe(1600);
    expect(result.endTimestamp).toBe(1760000001600);
    expect(
      result.aggregateReport.find((item) => item.label === "Login"),
    ).toMatchObject({ count: 3, average: 110, p95: 120 });
    expect(
      result.aggregateReport.find((item) => item.label === "Checkout"),
    ).toMatchObject({ count: 3, errorRate: 33.33 });
  });

  it("does not collapse K6 CSV requests in the same second", () => {
    const result = parseAndAnalyze(fixture("k6-sample.csv"));
    expect(result.framework).toBe("k6 CSV");
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(1);
    expect(result.aggregateReport[0]).toMatchObject({
      count: 3,
      average: 173.33,
      p95: 300,
      errorRate: 33.33,
    });
    expect(result.timeSeriesData[0].totalRequestsPerSecond).toBe(3);
    expect(result.timeSeriesData[0].totalActiveThreads).toBe(3);
    expect(result.durationMs).toBe(300);
    expect(result.endTimestamp).toBe(1760000000000);
  });

  it("processes K6 NDJSON without treating phase duration as bytes", () => {
    const result = parseAndAnalyze(fixture("k6-sample.ndjson"));
    expect(result.framework).toBe("k6 NDJSON");
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.aggregateReport[0].bytes).toBeNull();
    expect(result.aggregateReport[0].averageLatency).toBe(115);
    expect(result.durationMs).toBe(210);
  });

  it("processes K6 aggregate summary with explicit capabilities", () => {
    const result = parseAndAnalyze(fixture("k6-summary.json"));
    expect(result.sourceFormat).toBe("k6-summary-legacy");
    expect(result.successCount).toBe(980);
    expect(result.errorCount).toBe(20);
    expect(result.aggregateReport[0]).toMatchObject({
      count: 1000,
      average: 180,
      p95: 450,
    });
    expect(result.capabilities.timeSeries).toBe(false);
    expect(result.thresholds[0]).toMatchObject({
      expression: "p(95)<500",
      passed: true,
    });
  });

  it("processes K6 machine-readable summary duration in seconds", () => {
    const result = parseAndAnalyze(fixture("k6-summary-v1.json"));
    expect(result.sourceFormat).toBe("k6-summary-v1");
    expect(result.durationMs).toBe(60_000);
    expect(result.successCount).toBe(980);
    expect(result.errorCount).toBe(20);
    expect(result.aggregateReport[0].throughput).toBeCloseTo(16.67, 2);
    expect(result.checks[0]).toMatchObject({
      name: "status is 200",
      passes: 980,
      fails: 20,
    });
  });

  it("streams JMeter JTL with chunked input matching the batch result", () => {
    const batch = parseAndAnalyze(fixture("jmeter-sample.jtl"));
    const source = fixture("jmeter-sample.jtl").replace(/^\uFEFF/, "");
    const handle = createStreamParser({
      name: "jmeter",
      displayName: "Apache JMeter",
      sourceFormat: "jmeter",
      capabilities: { requestSamples: true, timeSeries: true, activeUsers: true, responseTime: true, waitingTime: true, networkBytes: true, errors: true },
      dataQuality: "certified",
    });
    for (let i = 0; i < source.length; i += 7) {
      handle.ingest(source.slice(i, i + 7));
    }
    const streamed = handle.end();
    expect(streamed.framework).toBe("Apache JMeter");
    expect(streamed.successCount).toBe(batch.successCount);
    expect(streamed.errorCount).toBe(batch.errorCount);
    expect(streamed.aggregateReport).toEqual(batch.aggregateReport);
    expect(streamed.durationMs).toBe(1600);
    expect(streamed.timeSeriesData[0].totalRequestsPerSecond).toBe(
      batch.timeSeriesData[0].totalRequestsPerSecond,
    );
    expect(streamed.labels).toEqual(batch.labels);
  });

  it("splits CSV respecting quoted commas and quotes", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(splitCsvLine('"he said ""hi""",2')).toEqual(['he said "hi"', "2"]);
  });

  it("builds JTL columns and maps a data line to a normalized point", () => {
    const columns = buildJtlColumns("timeStamp,elapsed,label,responseCode,success,allThreads,Latency,bytes");
    expect(columns).not.toBeNull();
    expect(columns?.["label"]).toBe(2);
    const point = jtlLineToPoint(columns!, "1760000000000,120,Login,200,true,4,95,512");
    expect(point).toMatchObject({
      timestamp: 1760000000000,
      elapsed: 120,
      label: "Login",
      success: true,
      activeUsers: 4,
      latency: 95,
      bytesReceived: 512,
    });
    expect(buildJtlColumns("foo,bar")).toBeNull();
  });

  it("extracts HTTP phases, heatmaps and per-second p95 from K6 NDJSON", () => {
    const result = parseAndAnalyze(fixture("k6-sample-full.ndjson"));
    expect(result.framework).toBe("k6 NDJSON");
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(1);
    const duration = result.phaseStats.find((item) => item.metric === "duration");
    expect(duration?.count).toBe(3);
    expect(duration?.mean).toBeCloseTo(666.7, 1);
    expect(duration?.p95).toBe(1200);
    expect(result.phaseStats.filter((item) => item.count > 0).length).toBe(6);
    const heatmapCount = result.heatmaps.length;
    expect(heatmapCount).toBeGreaterThanOrEqual(6);
    expect(result.heatmaps[0].series.length).toBeGreaterThan(0);
    const first = result.timeSeriesData[0];
    expect(first.vus).toBe(15);
    expect(first.rps).toBe(1);
    expect(first.durationP95).toBeDefined();
    expect(first.blockedAvg).toBeDefined();
  });

  it("rejects unrecognized and empty inputs", () => {
    expect(() => parseAndAnalyze("not a performance file")).toThrow(
      /Formato não reconhecido/,
    );
    expect(() =>
      parseAndAnalyze("metric_name,timestamp,metric_value\n", "k6-csv"),
    ).toThrow(/Nenhuma amostra válida/);
  });

  it("keeps missing summary percentiles unavailable", () => {
    const result = parseAndAnalyze(
      JSON.stringify({
        state: { testRunDurationMs: 1000 },
        metrics: {
          http_reqs: { values: { count: 1 } },
          http_req_failed: { values: { rate: 0 } },
          http_req_duration: { values: { avg: 100 } },
        },
        root_group: {},
      }),
      "k6-summary",
    );
    expect(result.aggregateReport[0].p90).toBeNull();
    expect(result.aggregateReport[0].p95).toBeNull();
    expect(result.diagnostics.join(" ")).toMatch(/P90.*P95/);
  });
});
