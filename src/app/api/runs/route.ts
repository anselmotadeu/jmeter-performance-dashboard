import { createHash } from "node:crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { readJsonWithLimit, RequestTooLargeError } from "@/lib/request";
import { saveRunSchema } from "@/lib/run-schema";
import { listRuns } from "@/lib/run-data";
import { sanitizeLabel, sanitizeMessage } from "@/lib/sanitize";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  return Response.json({ runs: await listRuns(session.user.id) });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  let body: unknown;
  try {
    body = await readJsonWithLimit(request, 3 * 1024 * 1024);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof RequestTooLargeError
            ? "Análise excede 3 MB."
            : "JSON inválido.",
      },
      { status: error instanceof RequestTooLargeError ? 413 : 400 },
    );
  }
  const parsed = saveRunSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Dados de análise inválidos.", details: parsed.error.flatten() },
      { status: 400 },
    );
  const input = parsed.data;
  if (
    input.analysis.timeSeriesData.length * input.analysis.labels.length >
    5000
  ) {
    return Response.json(
      {
        error:
          "Série temporal excede o limite do histórico. Reduza a duração ou cardinalidade.",
      },
      { status: 400 },
    );
  }
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const previous = await client.query<{ id: string; payloadHash: string }>(
      'SELECT id,payload_hash AS "payloadHash" FROM analysis_run WHERE created_by=$1 AND idempotency_key=$2',
      [session.user.id, input.idempotencyKey],
    );
    if (previous.rows[0]) {
      if (previous.rows[0].payloadHash !== payloadHash) {
        await client.query("ROLLBACK");
        return Response.json(
          { error: "Chave já utilizada com dados diferentes." },
          { status: 409 },
        );
      }
      await client.query("COMMIT");
      return Response.json({ id: previous.rows[0].id, duplicate: true });
    }

    const project = await client.query<{
      id: string;
      workspaceId: string;
      role: string;
    }>(
      `SELECT p.id,p.workspace_id AS "workspaceId",m.role FROM project p JOIN workspace_member m ON m.workspace_id=p.workspace_id
       WHERE m.user_id=$1 AND m.role IN ('owner','admin','member') AND p.id=$2 LIMIT 1`,
      [session.user.id, input.projectId],
    );
    if (!project.rows[0]) {
      await client.query("ROLLBACK");
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      project.rows[0].workspaceId,
    ]);
    const concurrent = await client.query<{ id:string;payloadHash:string }>('SELECT id,payload_hash AS "payloadHash" FROM analysis_run WHERE created_by=$1 AND idempotency_key=$2',[session.user.id,input.idempotencyKey]);
    if(concurrent.rows[0]){
      if(concurrent.rows[0].payloadHash!==payloadHash){await client.query('ROLLBACK');return Response.json({error:'Chave já utilizada com dados diferentes.'},{status:409});}
      await client.query('COMMIT');
      return Response.json({id:concurrent.rows[0].id,duplicate:true});
    }
    const quota = await client.query<{ used: number; limit: number }>(
      `SELECT count(*)::int AS used,w.monthly_analysis_limit AS limit FROM workspace w
       LEFT JOIN usage_event u ON u.workspace_id=w.id AND u.event_type='analysis_saved'
         AND u.created_at>=date_trunc('month',now()) WHERE w.id=$1 GROUP BY w.id`,
      [project.rows[0].workspaceId],
    );
    if (quota.rows[0] && quota.rows[0].used >= quota.rows[0].limit) {
      await client.query("ROLLBACK");
      return Response.json(
        { error: "Limite mensal de análises atingido para o plano atual." },
        { status: 402 },
      );
    }
    const analysis = input.analysis;
    const safeAggregates = analysis.aggregateReport.map((item) => ({ ...item, label: sanitizeLabel(item.label) }));
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO analysis_run (project_id,created_by,idempotency_key,payload_hash,title,framework,source_format,data_quality,
        original_file_name,file_size,schema_version,capabilities,diagnostics,success_count,error_count,started_at,ended_at,duration_ms,max_users,analysis_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (created_by,idempotency_key) DO NOTHING RETURNING id`,
      [
        project.rows[0].id,
        session.user.id,
        input.idempotencyKey,
        payloadHash,
        input.title,
        analysis.framework,
        analysis.sourceFormat,
        analysis.dataQuality,
        null,
        input.fileSize,
        analysis.schemaVersion,
        analysis.capabilities,
        JSON.stringify(analysis.diagnostics.map(sanitizeMessage)),
        analysis.successCount,
        analysis.errorCount,
        analysis.startTimestamp ? new Date(analysis.startTimestamp) : null,
        analysis.endTimestamp ? new Date(analysis.endTimestamp) : null,
        analysis.durationMs,
        analysis.rampUpInfo.users,
        JSON.stringify({
          aggregateReport: safeAggregates,
          timeSeriesData: analysis.timeSeriesData,
          heatmaps: analysis.heatmaps,
          phaseStats: analysis.phaseStats,
        }),
      ],
    );
    if (!inserted.rows[0]) {
      const existing=await client.query<{id:string;payloadHash:string}>('SELECT id,payload_hash AS "payloadHash" FROM analysis_run WHERE created_by=$1 AND idempotency_key=$2',[session.user.id,input.idempotencyKey]);
      if(existing.rows[0]?.payloadHash===payloadHash){await client.query('COMMIT');return Response.json({id:existing.rows[0].id,duplicate:true});}
      throw new Error("Conflito inesperado de idempotência.");
    }
    const runId = inserted.rows[0].id;

    if (safeAggregates.length) {
      await client.query(
        `INSERT INTO analysis_label (run_id,label,request_count,average,median,p90,p95,min,max,error_rate,throughput,average_latency,p95_latency,average_bytes,average_sent_bytes)
         SELECT $1,* FROM unnest($2::text[],$3::bigint[],$4::numeric[],$5::numeric[],$6::numeric[],$7::numeric[],$8::numeric[],$9::numeric[],$10::numeric[],$11::numeric[],$12::numeric[],$13::numeric[],$14::numeric[],$15::numeric[])`,
        [
          runId,
          safeAggregates.map((item) => item.label),
          safeAggregates.map((item) => item.count),
          safeAggregates.map((item) => item.average),
          safeAggregates.map((item) => item.median),
          safeAggregates.map((item) => item.p90),
          safeAggregates.map((item) => item.p95),
          safeAggregates.map((item) => item.min),
          safeAggregates.map((item) => item.max),
          safeAggregates.map((item) => item.errorRate),
          safeAggregates.map((item) => item.throughput),
          safeAggregates.map((item) => item.averageLatency),
          safeAggregates.map((item) => item.p95Latency),
          safeAggregates.map((item) => item.bytes),
          safeAggregates.map((item) => item.sentBytes),
        ],
      );
    }
    const timeBuckets: Array<{
      at: Date;
      label: string;
      requests: number;
      errors: number;
      elapsed: number;
      latency: number | null;
      users: number | null;
      bytes: number | null;
      sent: number | null;
    }> = [];
    for (const entry of analysis.timeSeriesData) {
      for (const label of analysis.labels) {
        const requests = Number(entry[`requestsPerSecond_${label}`] ?? 0);
        if (!requests) continue;
        const errors = Number(entry[`errorsPerSecond_${label}`] ?? 0);
        timeBuckets.push({
          at: new Date(Number(entry.timeStamp)),
          label: sanitizeLabel(label),
          requests,
          errors,
          elapsed: Number(entry[`elapsed_${label}`] ?? 0),
          latency: analysis.capabilities.waitingTime
            ? Number(entry[`latency_${label}`] ?? 0)
            : null,
          users: analysis.capabilities.activeUsers
            ? Number(entry[`activeThreads_${label}`] ?? 0)
            : null,
          bytes: analysis.capabilities.networkBytes
            ? Number(entry[`bytes_${label}`] ?? 0)
            : null,
          sent: analysis.capabilities.networkBytes
            ? Number(entry[`sentBytes_${label}`] ?? 0)
            : null,
        });
      }
    }
    if (timeBuckets.length)
      await client.query(
        `INSERT INTO analysis_time_bucket (run_id,bucket_at,label,request_count,error_count,success_count,average_elapsed,average_latency,active_users,bytes_received,bytes_sent) SELECT $1,* FROM unnest($2::timestamptz[],$3::text[],$4::integer[],$5::integer[],$6::integer[],$7::numeric[],$8::numeric[],$9::integer[],$10::bigint[],$11::bigint[])`,
        [
          runId,
          timeBuckets.map((x) => x.at),
          timeBuckets.map((x) => x.label),
          timeBuckets.map((x) => x.requests),
          timeBuckets.map((x) => x.errors),
          timeBuckets.map((x) => x.requests - x.errors),
          timeBuckets.map((x) => x.elapsed),
          timeBuckets.map((x) => x.latency),
          timeBuckets.map((x) => x.users),
          timeBuckets.map((x) => x.bytes),
          timeBuckets.map((x) => x.sent),
        ],
      );
    if (analysis.errorDetails.length)
      await client.query(
        "INSERT INTO analysis_error (run_id,code,message,occurrence_count) SELECT $1,* FROM unnest($2::text[],$3::text[],$4::bigint[])",
        [
          runId,
          analysis.errorDetails.map((x) => sanitizeMessage(x.code)),
          analysis.errorDetails.map((x) => sanitizeMessage(x.message)),
          analysis.errorDetails.map((x) => x.count),
        ],
      );
    if (analysis.checks.length)
      await client.query(
        "INSERT INTO analysis_check (run_id,name,passes,fails) SELECT $1,* FROM unnest($2::text[],$3::bigint[],$4::bigint[])",
        [
          runId,
          analysis.checks.map((x) => sanitizeMessage(x.name)),
          analysis.checks.map((x) => x.passes),
          analysis.checks.map((x) => x.fails),
        ],
      );
    if (analysis.thresholds.length)
      await client.query(
        "INSERT INTO analysis_threshold (run_id,metric,expression,passed) SELECT $1,* FROM unnest($2::text[],$3::text[],$4::boolean[])",
        [
          runId,
          analysis.thresholds.map((x) => sanitizeMessage(x.metric)),
          analysis.thresholds.map((x) => sanitizeMessage(x.expression)),
          analysis.thresholds.map((x) => x.passed),
        ],
      );

    const baseline = await client.query<{
      runId: string;
      framework: string;
      dataQuality: string;
    }>(
      `SELECT b.run_id AS "runId",r.framework,r.data_quality AS "dataQuality" FROM baseline b JOIN analysis_run r ON r.id=b.run_id WHERE b.project_id=$1`,
      [project.rows[0].id],
    );
    if (
      baseline.rows[0] &&
      baseline.rows[0].runId !== runId &&
      baseline.rows[0].framework === analysis.framework &&
      baseline.rows[0].dataQuality === "certified" &&
      analysis.dataQuality === "certified"
    ) {
      const baseMetrics = await client.query<{
        label: string;
        average: number;
        p95: number | null;
        errorRate: number;
      }>(
        'SELECT label,average::float8,p95::float8,error_rate::float8 AS "errorRate" FROM analysis_label WHERE run_id=$1',
        [baseline.rows[0].runId],
      );
      const baseMap = new Map(
        baseMetrics.rows.map((item) => [item.label, item]),
      );
      const overlap = safeAggregates.filter((item) =>
        baseMap.has(item.label),
      ).length;
      if (
        overlap / Math.max(safeAggregates.length, baseMap.size) <
        0.5
      ) {
        await client.query(
          "INSERT INTO usage_event (workspace_id,user_id,event_type,quantity,metadata) VALUES ($1,$2,$3,$4,$5)",
          [
            project.rows[0].workspaceId,
            session.user.id,
            "comparison_skipped",
            1,
            JSON.stringify({ reason: "incompatible_labels" }),
          ],
        );
      } else {
        const changes = safeAggregates.flatMap((item) => {
          const base = baseMap.get(item.label);
          if (!base || base.average <= 0) return [];
          return [
            {
              label: item.label,
              averageChange:
                ((item.average - base.average) / base.average) * 100,
              p95Change:
                base.p95 && item.p95 !== null
                  ? ((item.p95 - base.p95) / base.p95) * 100
                  : 0,
              errorRateChange: item.errorRate - base.errorRate,
            },
          ];
        });
        const regressions = changes.filter(
          (item) =>
            item.averageChange > 10 ||
            item.p95Change > 10 ||
            item.errorRateChange > 1,
        );
        const improvements = changes.filter(
          (item) => item.averageChange < -10 && item.p95Change < -10,
        );
        const verdict = regressions.length
          ? "regressed"
          : improvements.length
            ? "improved"
            : "stable";
        await client.query(
          "INSERT INTO comparison (project_id,baseline_run_id,candidate_run_id,created_by,verdict,issue_count,summary) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [
            project.rows[0].id,
            baseline.rows[0].runId,
            runId,
            session.user.id,
            verdict,
            regressions.length,
            JSON.stringify({
              changes: changes
                .sort((a, b) => b.averageChange - a.averageChange)
                .slice(0, 20),
              regressions,
            }),
          ],
        );
      }
    }
    await client.query(
      "INSERT INTO usage_event (workspace_id,user_id,event_type,quantity,metadata) VALUES ($1,$2,$3,$4,$5)",
      [
        project.rows[0].workspaceId,
        session.user.id,
        "analysis_saved",
        analysis.successCount + analysis.errorCount,
        JSON.stringify({ framework: analysis.framework }),
      ],
    );
    await client.query("COMMIT");
    return Response.json({ id: runId }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Falha ao salvar análise:", error);
    return Response.json(
      { error: "Não foi possível salvar a análise." },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
