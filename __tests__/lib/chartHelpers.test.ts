import {
  buildPercentileRows,
  buildVusLatencyScatter,
  computeGaugeMetrics,
  computeNetworkThroughput,
  estimateBucketSeconds,
  formatBytesPerSecond,
  sliceErrorByCode,
} from "@/components/app/charts/chartHelpers";

const T = 1_760_000_000_000;

const baseEntry = (extra: Record<string, unknown>) => ({
  time: new Date(T).toISOString(),
  timeStamp: T,
  vus: 5,
  rps: 10,
  errs: 0,
  durationAvg: 120,
  ...extra,
});

describe("chartHelpers.network throughput", () => {
  it("soma bytes de todos os labels e divide pelo intervalo do bucket", () => {
    const points = computeNetworkThroughput(
      [baseEntry({ bytes_a: 2048, bytes_b: 1024, sentBytes_a: 512 })],
      ["a", "b"],
      2,
    );
    expect(points[0]).toMatchObject({ down: 1536, up: 256 });
  });

  it("trata bucket inválido/zero como 1 segundo", () => {
    const points = computeNetworkThroughput([baseEntry({ bytes_a: 512 })], ["a"], 0);
    expect(points[0].down).toBe(512);
  });

  it("tolera chaves ausentes e labels vazios sem NaN", () => {
    const points = computeNetworkThroughput([baseEntry({})], ["x", "y", "z"], 1);
    expect(Number.isFinite(points[0].down)).toBe(true);
    expect(points[0].up).toBe(0);
  });
});

describe("chartHelpers.estimateBucketSeconds", () => {
  it("estima intervalo médio entre timestamps", () => {
    expect(
      estimateBucketSeconds([
        baseEntry({ timeStamp: T }),
        baseEntry({ timeStamp: T + 1000 }),
        baseEntry({ timeStamp: T + 3000 }),
      ]),
    ).toBe(1500);
  });

  it("tolerância extrema: listas vazias ou de um único ponto", () => {
    expect(estimateBucketSeconds([])).toBe(1);
    expect(estimateBucketSeconds([baseEntry({})])).toBe(1);
    expect(estimateBucketSeconds([baseEntry({ timeStamp: NaN }), baseEntry({ timeStamp: T })])).toBe(1);
    expect(estimateBucketSeconds([baseEntry({ timeStamp: T }), baseEntry({ timeStamp: T })])).toBe(1);
  });
});

describe("chartHelpers.gauge metrics", () => {
  it("agrega pico de RPS/VUs, média de RPS e taxa de erro", () => {
    const gauge = computeGaugeMetrics({
      timeSeriesData: [baseEntry({ rps: 10 }), baseEntry({ rps: 40 }), baseEntry({ rps: 40 })],
      aggregateReport: [{ count: 100, errorRate: 2 } as never],
      successCount: 98,
      errorCount: 2,
    });
    expect(gauge.maxRps).toBe(40);
    expect(gauge.avgRps).toBe(30);
    expect(gauge.maxConcurrentUsers).toBe(5);
    expect(gauge.errorRate).toBe(2);
  });

  it("erro absoluto: usa errorCount explícito e nunca produz NaN", () => {
    const gauge = computeGaugeMetrics({
      timeSeriesData: [],
      aggregateReport: [],
      successCount: 0,
      errorCount: 0,
    });
    expect(Number.isFinite(gauge.avgRps)).toBe(true);
    expect(gauge.errorRate).toBe(0);
    expect(gauge.p95).toBeNull();
    expect(gauge.maxRps).toBe(0);
  });

  it("suporta duração e recupera p95 pelo maior endpoint", () => {
    const gauge = computeGaugeMetrics({
      timeSeriesData: [baseEntry({})],
      aggregateReport: [
        { count: 5, errorRate: 1, p95: 300 } as never,
        { count: 5, errorRate: 2, p95: 620 } as never,
      ],
      durationMs: 42_000,
    });
    expect(gauge.durationMs).toBe(42_000);
    expect(gauge.p95).toBe(620);
  });
});

describe("chartHelpers.error slices", () => {
  it("agrupa por código mantendo dado de total e fatia o top 6 com Outros", () => {
    const slices = sliceErrorByCode(
      Array.from({ length: 8 }, (_, i) => ({ code: `${i}`, message: "x", count: i + 1 })),
    );
    expect(slices.length).toBe(7);
    expect(slices[0].code).toBe("7");
    expect(slices[6].label).toBe("Outros");
    expect(slices[0].total).toBe(36);
  });

  it("entrada vazia retorna lista vazia e total zero não gera divisão inválida", () => {
    expect(sliceErrorByCode([])).toEqual([]);
    expect(sliceErrorByCode([{ code: "500", message: "e", count: 0 }])).toEqual([]);
  });
});

describe("chartHelpers.percentile rows", () => {
  it("filtra, ordena pela média e limita aos 12 primeiros", () => {
    const rows = buildPercentileRows(
      Array.from({ length: 15 }, (_, i) => ({
        label: `L${i}`,
        average: 1000 - i * 10,
        count: 1,
      }) as never),
    );
    expect(rows.length).toBe(12);
    expect(rows[0].label).toBe("L0");
    expect(rows[0].average).toBe(1000);
  });

  it("descarta endpoints sem amostras válidas (average <= 0)", () => {
    const rows = buildPercentileRows([
      { label: "ok", average: 50, count: 1 } as never,
      { label: "vazio", average: 0, count: 0 } as never,
      { label: "negativo", average: -5, count: 1 } as never,
    ]);
    expect(rows.map((row) => row.label)).toEqual(["ok"]);
  });
});

describe("chartHelpers.scatter VUs × latência", () => {
  it("mantém pontos com VUs > 0 e latência finita", () => {
    const points = buildVusLatencyScatter([
      baseEntry({ vus: 3, durationAvg: 80 }),
      baseEntry({ vus: 0, durationAvg: 999 }),
      baseEntry({ vus: 5, durationAvg: Number.NaN }),
      baseEntry({ vus: 2, durationAvg: 150 }),
    ]);
    expect(points).toEqual([
      { vus: 3, latency: 80, time: expect.any(String) },
      { vus: 2, latency: 150, time: expect.any(String) },
    ]);
  });

  it("entrada vazia não quebra", () => {
    expect(buildVusLatencyScatter([])).toEqual([]);
  });
});

describe("chartHelpers.formatBytesPerSecond", () => {
  it("formata B/s, KB/s e MB/s", () => {
    expect(formatBytesPerSecond(500)).toBe("500 B/s");
    expect(formatBytesPerSecond(2048)).toBe("2.0 KB/s");
    expect(formatBytesPerSecond(2_621_440)).toBe("2.50 MB/s");
  });
});