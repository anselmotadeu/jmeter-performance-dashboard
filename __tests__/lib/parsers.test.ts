import fs from "node:fs";
import path from "node:path";
import { parseAndAnalyze } from "@/lib/parsers";

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
