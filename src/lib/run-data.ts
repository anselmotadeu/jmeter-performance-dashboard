import "server-only";
import { db } from "@/lib/db";

export type RunListItem = {
  id: string;
  title: string;
  framework: string;
  sourceFormat: string;
  dataQuality: string;
  successCount: number;
  errorCount: number;
  durationMs: number;
  maxUsers: number;
  createdAt: Date;
  projectId: string;
  projectName: string;
  isBaseline: boolean;
};
export type StoredLabel = {
  label: string;
  count: number;
  average: number;
  median: number;
  p90: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
  errorRate: number;
  throughput: number;
  averageLatency: number | null;
  p95Latency: number | null;
};
export type StoredError = { code: string; message: string; count: number };
export type StoredCheck = { name: string; passes: number; fails: number };
export type StoredThreshold = {
  metric: string;
  expression: string;
  passed: boolean;
};
export type ComparisonChange = {
  label: string;
  averageChange: number;
  p95Change: number;
  errorRateChange: number;
};
export type StoredComparison = {
  verdict: "improved" | "stable" | "regressed";
  issueCount: number;
  summary: { changes?: ComparisonChange[]; regressions?: ComparisonChange[] };
};
export type ProjectOption = {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
};
export async function listProjects(userId: string) {
  const result = await db.query<ProjectOption>(
    `SELECT p.id,p.name,w.id AS "workspaceId",w.name AS "workspaceName",m.role FROM project p JOIN workspace w ON w.id=p.workspace_id JOIN workspace_member m ON m.workspace_id=w.id WHERE m.user_id=$1 ORDER BY w.name,p.name`,
    [userId],
  );
  return result.rows;
}

export async function getUserWorkspace(userId: string) {
  const result = await db.query<{
    workspaceId: string;
    workspaceName: string;
    projectId: string;
    projectName: string;
    plan: string;
    subscriptionStatus: string;
    monthlyAnalysisLimit: number;
    trialEndsAt: Date | null;
  }>(
    `SELECT w.id AS "workspaceId", w.name AS "workspaceName", p.id AS "projectId", p.name AS "projectName",
      w.plan,w.subscription_status AS "subscriptionStatus",w.monthly_analysis_limit AS "monthlyAnalysisLimit",w.trial_ends_at AS "trialEndsAt"
     FROM workspace_member m JOIN workspace w ON w.id=m.workspace_id JOIN project p ON p.workspace_id=w.id
     WHERE m.user_id=$1 ORDER BY p.created_at LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function listRuns(userId: string, limit = 50) {
  const result = await db.query<RunListItem>(
    `SELECT r.id,r.title,r.framework,r.source_format AS "sourceFormat",r.data_quality AS "dataQuality",
      r.success_count::float8 AS "successCount",r.error_count::float8 AS "errorCount",r.duration_ms::float8 AS "durationMs",
      r.max_users AS "maxUsers",r.created_at AS "createdAt",p.id AS "projectId",p.name AS "projectName",
      (b.run_id=r.id) AS "isBaseline"
     FROM analysis_run r JOIN project p ON p.id=r.project_id JOIN workspace_member m ON m.workspace_id=p.workspace_id
     LEFT JOIN baseline b ON b.project_id=p.id WHERE m.user_id=$1 ORDER BY r.created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}

export async function getOverview(userId: string) {
  const [metrics, recent, workspace] = await Promise.all([
    db.query<{
      runs: number;
      requests: number;
      errors: number;
      projects: number;
      regressions: number;
    }>(
      `SELECT count(distinct r.id)::int AS runs,coalesce(sum(r.success_count+r.error_count),0)::float8 AS requests,
       coalesce(sum(r.error_count),0)::float8 AS errors,count(distinct p.id)::int AS projects,
       (SELECT count(*)::int FROM comparison c JOIN project cp ON cp.id=c.project_id JOIN workspace_member cm ON cm.workspace_id=cp.workspace_id WHERE cm.user_id=$1 AND c.verdict='regressed') AS regressions
       FROM workspace_member m JOIN project p ON p.workspace_id=m.workspace_id LEFT JOIN analysis_run r ON r.project_id=p.id WHERE m.user_id=$1`,
      [userId],
    ),
    listRuns(userId, 5),
    getUserWorkspace(userId),
  ]);
  return { metrics: metrics.rows[0], recent, workspace };
}

export async function getRunDetail(userId: string, runId: string) {
  const run = await db.query<
    RunListItem & {
      capabilities: Record<string, boolean>;
      diagnostics: string[];
      startedAt: Date | null;
      endedAt: Date | null;
    }
  >(
    `SELECT r.id,r.title,r.framework,r.source_format AS "sourceFormat",r.data_quality AS "dataQuality",
      r.success_count::float8 AS "successCount",r.error_count::float8 AS "errorCount",r.duration_ms::float8 AS "durationMs",
      r.max_users AS "maxUsers",r.created_at AS "createdAt",r.capabilities,r.diagnostics,
      r.started_at AS "startedAt",r.ended_at AS "endedAt",p.id AS "projectId",p.name AS "projectName",(b.run_id=r.id) AS "isBaseline"
     FROM analysis_run r JOIN project p ON p.id=r.project_id JOIN workspace_member m ON m.workspace_id=p.workspace_id
     LEFT JOIN baseline b ON b.project_id=p.id WHERE m.user_id=$1 AND r.id=$2`,
    [userId, runId],
  );
  if (!run.rows[0]) return null;
  const [labels, errors, checks, thresholds, comparison] = await Promise.all([
    db.query<StoredLabel>(
      `SELECT label,request_count::float8 AS "count",average::float8,median::float8,p90::float8,p95::float8,min::float8,max::float8,error_rate::float8 AS "errorRate",throughput::float8,average_latency::float8 AS "averageLatency",p95_latency::float8 AS "p95Latency" FROM analysis_label WHERE run_id=$1 ORDER BY average DESC`,
      [runId],
    ),
    db.query<StoredError>(
      `SELECT code,message,occurrence_count::float8 AS count FROM analysis_error WHERE run_id=$1 ORDER BY occurrence_count DESC`,
      [runId],
    ),
    db.query<StoredCheck>(
      `SELECT name,passes::float8,fails::float8 FROM analysis_check WHERE run_id=$1`,
      [runId],
    ),
    db.query<StoredThreshold>(
      `SELECT metric,expression,passed FROM analysis_threshold WHERE run_id=$1`,
      [runId],
    ),
    db.query<StoredComparison>(
      `SELECT verdict,issue_count AS "issueCount",summary FROM comparison WHERE candidate_run_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [runId],
    ),
  ]);
  return {
    run: run.rows[0],
    labels: labels.rows,
    errors: errors.rows,
    checks: checks.rows,
    thresholds: thresholds.rows,
    comparison: comparison.rows[0] ?? null,
  };
}
