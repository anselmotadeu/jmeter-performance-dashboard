import { z } from "zod";

const optionalMetric = z.number().finite().nonnegative().nullable();
const aggregate = z.object({
  label: z.string().trim().min(1).max(300),
  average: z.number().finite().nonnegative(),
  median: optionalMetric,
  p90: optionalMetric,
  p95: optionalMetric,
  min: optionalMetric,
  max: optionalMetric,
  errorRate: z.number().min(0).max(100),
  throughput: z.number().finite().nonnegative(),
  count: z.number().int().nonnegative().max(1_000_000_000_000),
  averageLatency: optionalMetric,
  medianLatency: optionalMetric,
  p90Latency: optionalMetric,
  p95Latency: optionalMetric,
  bytes: optionalMetric,
  sentBytes: optionalMetric,
});

export const saveRunSchema = z.object({
  idempotencyKey: z.uuid(),
  projectId: z.uuid(),
  title: z.string().trim().min(3).max(180),
  fileSize: z
    .number()
    .int()
    .nonnegative()
    .max(5 * 1024 * 1024),
  analysis: z.object({
    schemaVersion: z.literal(2),
    framework: z.string().max(60),
    sourceFormat: z.string().max(60),
    dataQuality: z.enum(["certified", "beta"]),
    capabilities: z.record(z.string(), z.boolean()),
    diagnostics: z.array(z.string().max(500)).max(50),
    successCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    startTime: z.string(),
    endTime: z.string(),
    startTimestamp: z.number().nullable(),
    endTimestamp: z.number().nullable(),
    durationMs: z.number().int().nonnegative(),
    rampUpInfo: z.object({
      users: z.number().int().nonnegative(),
      usersPerTest: z.number().int().nonnegative(),
      duration: z.string(),
    }),
    aggregateReport: z.array(aggregate).min(1).max(500),
    timeSeriesData: z
      .array(
        z.record(
          z.string(),
          z.union([z.string(), z.number(), z.record(z.string(), z.number())]),
        ),
      )
      .max(5000),
    errorDetails: z
      .array(
        z.object({
          code: z.string().max(80),
          message: z.string().max(500),
          count: z.number().int().nonnegative(),
        }),
      )
      .max(500),
    labels: z.array(z.string().max(300)).max(500),
    checks: z
      .array(
        z.object({
          name: z.string().max(300),
          passes: z.number().int().nonnegative(),
          fails: z.number().int().nonnegative(),
        }),
      )
      .max(500),
    thresholds: z
      .array(
        z.object({
          metric: z.string().max(160),
          expression: z.string().max(300),
          passed: z.boolean(),
        }),
      )
      .max(500),
  }),
});

export type SaveRunInput = z.infer<typeof saveRunSchema>;
