import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import BaselineButton from "@/components/app/BaselineButton";
import PerformanceDashboard, {
  type DashboardData,
} from "@/components/app/PerformanceDashboard";
import { auth } from "@/lib/auth";
import { getRunDetail } from "@/lib/run-data";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await getRunDetail(session.user.id, id);
  if (!detail) notFound();
  const { run, labels, errors, checks, thresholds, comparison, snapshot } = detail;

  const dashboardData: DashboardData | null = snapshot
    ? {
        capabilities: run.capabilities,
        timeSeriesData: (snapshot.timeSeriesData ?? []) as DashboardData["timeSeriesData"],
        heatmaps: (snapshot.heatmaps ?? []) as DashboardData["heatmaps"],
        phaseStats: (snapshot.phaseStats ?? []) as DashboardData["phaseStats"],
        aggregateReport: (snapshot.aggregateReport ??
          labels) as DashboardData["aggregateReport"],
        labels: labels.map((label) => label.label),
      }
    : null;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Resultado"
        title={run.title}
        description={`${run.projectName} · ${run.framework} · ${new Date(run.createdAt).toLocaleString("pt-BR")}`}
        actions={<BaselineButton id={run.id} active={run.isBaseline} />}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Requisições"
          value={(run.successCount + run.errorCount).toLocaleString("pt-BR")}
        />
        <Metric
          label="Erros"
          value={run.errorCount.toLocaleString("pt-BR")}
          danger={run.errorCount > 0}
        />
        <Metric
          label="Duração"
          value={`${Math.round(run.durationMs / 1000)}s`}
        />
        <Metric
          label="Usuários máximos"
          value={run.capabilities.activeUsers ? String(run.maxUsers) : "N/D"}
        />
      </section>
      {comparison && (
        <section
          className={
            "rounded-2xl border p-5 " +
            (comparison.verdict === "regressed"
              ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20"
              : comparison.verdict === "improved"
                ? "border-emerald-200 bg-emerald-50"
                : "border-slate-200 bg-white dark:bg-slate-900")
          }
        >
          <div className="flex items-center gap-3">
            {comparison.verdict === "regressed" ? (
              <AlertTriangle className="h-6 w-6 text-red-600" />
            ) : (
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            )}
            <div>
              <h2 className="text-lg font-black">
                {comparison.verdict === "regressed"
                  ? "Regressão detectada"
                  : comparison.verdict === "improved"
                    ? "Melhoria detectada"
                    : "Estável em relação à baseline"}
              </h2>
              <p className="text-sm text-slate-600">
                {comparison.issueCount} ponto(s) acima dos limiares.
              </p>
            </div>
          </div>
          {comparison.summary.regressions?.length ? (
            <div className="mt-4 space-y-3">
              {comparison.summary.regressions.slice(0, 5).map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl bg-white/80 p-4 text-sm dark:bg-slate-900/70"
                >
                  <div className="font-black">{item.label}</div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    Média {item.averageChange.toFixed(1)}%, P95{" "}
                    {item.p95Change.toFixed(1)}%, erro{" "}
                    {item.errorRateChange.toFixed(2)} p.p.
                  </p>
                  <p className="mt-2 text-indigo-700 dark:text-indigo-300">
                    <strong>Ação sugerida:</strong> revise queries, dependências
                    externas, saturação e mudanças de infraestrutura neste
                    fluxo.
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}
      {dashboardData ? (
        <PerformanceDashboard data={dashboardData} />
      ) : (
        <div className="rounded-2xl border border-dashed bg-white p-6 text-center text-sm text-slate-500 dark:bg-slate-900">
          Gráficos indisponíveis para esta análise (execução antiga ou sem snapshot).
        </div>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xl font-black">Métricas por endpoint</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-500">
                <th className="p-3">Label</th>
                <th className="p-3">Amostras</th>
                <th className="p-3">Média</th>
                <th className="p-3">P90</th>
                <th className="p-3">P95</th>
                <th className="p-3">Erro</th>
                <th className="p-3">Req/s</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((item) => (
                <tr key={item.label} className="border-b dark:border-slate-800">
                  <td className="p-3 font-black">{item.label}</td>
                  <td className="p-3">{item.count}</td>
                  <td className="p-3">{item.average} ms</td>
                  <td className="p-3">{item.p90 === null ? "N/D" : `${item.p90} ms`}</td>
                  <td className="p-3">{item.p95 === null ? "N/D" : `${item.p95} ms`}</td>
                  <td className="p-3">{item.errorRate}%</td>
                  <td className="p-3">{item.throughput}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {errors.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/20">
          <h2 className="text-xl font-black text-red-700">Erros agrupados</h2>
          <div className="mt-4 space-y-2">
            {errors.map((item) => (
              <div
                key={`${item.code}-${item.message}`}
                className="rounded-xl bg-white p-3 text-sm dark:bg-slate-900"
              >
                <strong>{item.code}</strong> · {item.message}
                <span className="float-right font-black">{item.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {(checks.length > 0 || thresholds.length > 0) && (
        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
            <h2 className="font-black">Checks</h2>
            {checks.map((item) => (
              <p key={item.name} className="mt-2 text-sm">
                {item.name}:{" "}
                <strong>
                  {item.passes} passou / {item.fails} falhou
                </strong>
              </p>
            ))}
          </div>
          <div className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
            <h2 className="font-black">Thresholds</h2>
            {thresholds.map((item) => (
              <p
                key={`${item.metric}-${item.expression}`}
                className="mt-2 text-sm"
              >
                {item.metric} {item.expression}:{" "}
                <strong>{item.passed ? "Aprovado" : "Reprovado"}</strong>
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div
        className={"mt-2 text-2xl font-black " + (danger ? "text-red-600" : "")}
      >
        {value}
      </div>
    </div>
  );
}
