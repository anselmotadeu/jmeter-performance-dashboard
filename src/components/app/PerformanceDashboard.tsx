"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AggregateReportItem,
  AnalysisCapabilities,
  ErrorDetail,
  Heatmap,
  HttpPhase,
  MetricStats,
  TimeSeriesEntry,
} from "@/lib/parsers";
import { analyzeTest, type AnalysisSummary, type Insight } from "@/lib/analysis";
import {
  BaselineComparisonChart,
  Card,
  ErrorRateBars,
  GaugeRow,
  HttpErrorsPie,
  NetworkThroughputChart,
  PercentilesChart,
  THEME_TOOLTIP,
  ThemedLegend,
  VusLatencyScatter,
  useChartTheme,
  type BaselineChange,
} from "./charts/ChartKit";
import {
  buildPercentileRows,
  buildVusLatencyScatter,
  computeGaugeMetrics,
  computeNetworkThroughput,
  estimateBucketSeconds,
  sliceErrorByCode,
} from "./charts/chartHelpers";

export type DashboardData = {
  capabilities: Partial<AnalysisCapabilities>;
  timeSeriesData: TimeSeriesEntry[];
  heatmaps: Heatmap[];
  phaseStats: MetricStats[];
  aggregateReport: AggregateReportItem[];
  labels: string[];
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  successCount?: number;
  errorCount?: number;
  errorDetails?: ErrorDetail[];
  comparisonChanges?: BaselineChange[];
};

const PHASE_ORDER: HttpPhase[] = ["duration", "blocked", "connecting", "receiving", "sending", "waiting"];

const PHASE_METRIC_NAME: Record<HttpPhase, string> = {
  duration: "http_req_duration",
  blocked: "http_req_blocked",
  connecting: "http_req_connecting",
  receiving: "http_req_receiving",
  sending: "http_req_sending",
  waiting: "http_req_waiting",
};

const OVER_TIME_SERIES = [
  { key: "Min", name: "min", color: "#94a3b8" },
  { key: "P90", name: "p90", color: "#f59e0b" },
  { key: "P95", name: "p95", color: "#3b82f6" },
  { key: "P99", name: "p99", color: "#8b5cf6" },
  { key: "Max", name: "max", color: "#22c55e" },
];

function formatMs(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/D";
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

function formatAxisLabel(value: unknown) {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatNumber(value: number) {
  return Number(value.toFixed(1)).toLocaleString("pt-BR");
}

function severityColor(severity: string): string {
  switch (severity) {
    case "excellent": return "#10b981";
    case "good": return "#3b82f6";
    case "warning": return "#f59e0b";
    case "critical": return "#ef4444";
    default: return "#64748b";
  }
}

function severityBg(severity: string): string {
  switch (severity) {
    case "excellent": return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900";
    case "good": return "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900";
    case "warning": return "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900";
    case "critical": return "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900";
    default: return "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700";
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case "excellent": return "Excelente";
    case "good": return "Bom";
    case "warning": return "Atenção";
    case "critical": return "Crítico";
    default: return severity;
  }
}

export default function PerformanceDashboard({ data }: { data: DashboardData }) {
  const { timeSeriesData, heatmaps, phaseStats, aggregateReport, capabilities, labels, startTime, endTime, durationMs, successCount, errorCount, errorDetails, comparisonChanges } = data;
  const theme = useChartTheme();
  const themeTooltip = THEME_TOOLTIP(theme);
  const hasTime = Boolean(capabilities.timeSeries && timeSeriesData.length > 0);
  const hasVus = hasTime && timeSeriesData.some((item) => Number(item.vus) > 0);
  const hasRps = hasTime && timeSeriesData.some((item) => Number(item.rps) > 0);
  const hasErrors = hasTime && timeSeriesData.some((item) => Number(item.errs) > 0);
  const hasChecks = hasTime && timeSeriesData.some((item) => Number(item.checks) > 0 || Number(item.checksFailed) > 0);
  const hasNetwork =
    hasTime &&
    labels.some((label) => timeSeriesData.some((item) => item[`bytes_${label}`] !== undefined || item[`sentBytes_${label}`] !== undefined));
  const hasErrorCodes = (errorDetails ?? []).length > 0;
  const hasComparison = (comparisonChanges ?? []).length > 0;

  const gauge = computeGaugeMetrics({ timeSeriesData, aggregateReport, durationMs, successCount, errorCount });
  const scatterPoints = buildVusLatencyScatter(timeSeriesData);
  const hasScatter = scatterPoints.some((point) => point.latency > 0);
  const errorSlices = sliceErrorByCode(errorDetails ?? []);
  const networkPoints = computeNetworkThroughput(timeSeriesData, labels, estimateBucketSeconds(timeSeriesData));
  const percentileRows = buildPercentileRows(aggregateReport);

  const phaseStatsMap = new Map(phaseStats.map((phase) => [phase.metric, phase]));
  const heatmapMap = new Map(heatmaps.map((heatmap) => [heatmap.metric, heatmap]));

  const metricPhases = PHASE_ORDER.filter((phase) => {
    const stats = phaseStatsMap.get(phase);
    if (stats && stats.count > 0) return true;
    return hasTime && timeSeriesData.some((item) => item[`${phase}Avg`] !== undefined);
  });

  const analysis: AnalysisSummary | null = (successCount !== undefined && errorCount !== undefined && durationMs !== undefined)
    ? analyzeTest({
        schemaVersion: 2,
        framework: "",
        sourceFormat: "",
        dataQuality: "certified",
        capabilities,
        diagnostics: [],
        successCount,
        errorCount,
        startTime: startTime || "",
        endTime: endTime || "",
        startTimestamp: null,
        endTimestamp: null,
        durationMs: durationMs || 0,
        rampUpInfo: { users: 0, usersPerTest: 0, duration: "" },
        aggregateReport,
        timeSeriesData,
        heatmaps,
        phaseStats,
        errorDetails: [],
        labels,
        checks: [],
        thresholds: [],
      })
    : null;

  return (
    <div className="space-y-6">
      {analysis && <AnalysisSection analysis={analysis} />}

      <div>
        <h2 className="text-xl font-black">Visão geral</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {hasVus && (
            <StatPanel metric="vus" title="Virtual Users">
              <TimeSeriesArea data={timeSeriesData} dataKey="vus" color="#4f46e5" name="VUs" />
            </StatPanel>
          )}
          {hasRps && (
            <StatPanel metric="rps" title="Requests per Second">
              <TimeSeriesArea data={timeSeriesData} dataKey="rps" color="#0ea5e9" name="req/s" />
            </StatPanel>
          )}
          {hasErrors && (
            <StatPanel metric="errs" title="Errors per Second" danger>
              <TimeSeriesArea data={timeSeriesData} dataKey="errs" color="#ef4444" name="erros" />
            </StatPanel>
          )}
          {hasChecks ? (
            <StatPanel metric="checks" title="Checks per Second">
              <TimeSeriesArea data={timeSeriesData} dataKey="checks" color="#10b981" name="checks" />
            </StatPanel>
          ) : hasTime ? (
            <StatPanel metric="checks" title="Checks per Second">
              <div className="flex h-[120px] items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400 dark:bg-slate-800">
                Métrica não presente no arquivo
              </div>
            </StatPanel>
          ) : null}
        </div>
      </div>

      {hasVus && timeSeriesData.length > 1 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-4 text-lg font-black">Rampa de usuários virtuais</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={timeSeriesData}>
              <defs>
                <linearGradient id="vusGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
              <XAxis dataKey="time" tickFormatter={formatAxisLabel} tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
              <YAxis tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
              <Tooltip formatter={(value) => formatNumber(Number(value))} labelFormatter={formatAxisLabel} {...themeTooltip} />
              <Area type="monotone" dataKey="vus" name="VUs" stroke="#4f46e5" fill="url(#vusGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      )}

      {metricPhases.length > 0 && (
        <div>
          <h2 className="text-xl font-black">Métricas de latência</h2>
          <div className="mt-4 space-y-6">
            {metricPhases.map((phase) => (
              <MetricRow
                key={phase}
                phase={phase}
                metricName={PHASE_METRIC_NAME[phase]}
                phaseLabel={phaseStatsMap.get(phase)?.label ?? phase}
                hasTime={hasTime}
                timeSeriesData={timeSeriesData}
                heatmap={heatmapMap.get(phase)}
              />
            ))}
          </div>
        </div>
      )}

      {aggregateReport.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-4 text-lg font-black">Tempo médio por endpoint</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={aggregateReport}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
              <XAxis dataKey="label" hide />
              <YAxis tickFormatter={(value) => formatMs(value)} tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
              <Tooltip formatter={(value) => formatMs(Number(value))} {...themeTooltip} />
              <Legend content={<ThemedLegend theme={theme} />} />
              <Bar dataKey="average" name="Média (ms)" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              <Bar dataKey="p95" name="P95 (ms)" fill="#06b6d4" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {labels.length > 1 && (
            <div className="mt-6">
              <h3 className="mb-4 text-lg font-black">Evolução do tempo de resposta por endpoint</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                  <XAxis dataKey="time" tickFormatter={formatAxisLabel} tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
                  <YAxis tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
                  <Tooltip {...themeTooltip} />
                  <Legend content={<ThemedLegend theme={theme} />} />
                  {labels.slice(0, 8).map((label, index) => (
                    <Line
                      key={label}
                      type="monotone"
                      dataKey={`elapsed_${label}`}
                      name={label}
                      stroke={["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b"][index]}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      {(hasTime || percentileRows.length > 0 || hasComparison) && (
        <div className="space-y-6">
          <h2 className="text-xl font-black">Visão analítica</h2>
          <GaugeRow gauge={gauge} />

          <div className="grid gap-6 xl:grid-cols-2">
            {hasScatter && (
              <Card title="Concorrência vs latência" subtitle="Relação entre usuários ativos e tempo médio de resposta">
                <VusLatencyScatter points={scatterPoints} theme={theme} />
              </Card>
            )}
            {hasErrorCodes && (
              <Card title="Erros por código HTTP" subtitle="Distribuição das falhas registradas">
                <HttpErrorsPie slices={errorSlices} theme={theme} />
              </Card>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            {aggregateReport.some((item) => item.errorRate > 0) && (
              <Card title="Taxa de erro por endpoint" subtitle="Percentual de falhas por fluxo">
                <ErrorRateBars rows={aggregateReport} theme={theme} />
              </Card>
            )}
            {hasNetwork && (
              <Card title="Throughput de rede" subtitle="Bytes trafegados por segundo (recebido/enviado)">
                <NetworkThroughputChart points={networkPoints} theme={theme} />
              </Card>
            )}
          </div>

          {percentileRows.length > 0 && (
            <Card title="Distribuição dos tempos de resposta" subtitle="Média, mediana e percentis por endpoint">
              <PercentilesChart rows={percentileRows} theme={theme} />
            </Card>
          )}

          {hasComparison && (
            <Card title="Comparativo com a baseline" subtitle="Variação percentual em relação à execução de referência">
              <BaselineComparisonChart changes={comparisonChanges ?? []} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function AnalysisSection({ analysis }: { analysis: AnalysisSummary }) {
  const { overallSeverity, insights, capacity, duration } = analysis;

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border-2 p-5 ${severityBg(overallSeverity)}`}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-black">Análise do teste</h2>
            <p className="mt-1 text-sm opacity-80">
              {duration.startTime && duration.endTime && (
                <>
                  <strong>Início:</strong> {new Date(duration.startTime).toLocaleString("pt-BR")} ·{" "}
                  <strong>Fim:</strong> {new Date(duration.endTime).toLocaleString("pt-BR")} ·{" "}
                  <strong>Duração:</strong> {duration.durationFormatted}
                </>
              )}
            </p>
          </div>
          <div className="rounded-xl bg-white/80 px-4 py-2 text-center dark:bg-slate-900/80">
            <div className="text-xs font-bold uppercase opacity-70">Status</div>
            <div className="text-lg font-black" style={{ color: severityColor(overallSeverity) }}>
              {severityLabel(overallSeverity)}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-white/60 p-3 dark:bg-slate-900/60">
            <div className="text-xs font-bold uppercase opacity-70">Capacidade máxima</div>
            <div className="text-2xl font-black">{capacity.maxConcurrentUsers}</div>
            <div className="text-xs opacity-70">usuários simultâneos</div>
          </div>
          <div className="rounded-xl bg-white/60 p-3 dark:bg-slate-900/60">
            <div className="text-xs font-bold uppercase opacity-70">Throughput máximo</div>
            <div className="text-2xl font-black">{capacity.maxRequestsPerSecond.toFixed(1)}</div>
            <div className="text-xs opacity-70">req/s</div>
          </div>
          {capacity.bottleneckAt !== undefined && (
            <div className="rounded-xl bg-white/60 p-3 dark:bg-slate-900/60">
              <div className="text-xs font-bold uppercase opacity-70">Limite identificado</div>
              <div className="text-2xl font-black" style={{ color: severityColor("warning") }}>
                {capacity.bottleneckAt}
              </div>
              <div className="text-xs opacity-70">usuários (erros começam aqui)</div>
            </div>
          )}
        </div>
      </div>

      {insights.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {insights.map((insight, index) => (
            <InsightCard key={index} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className={`rounded-xl border p-4 ${severityBg(insight.severity)}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-2 w-2 rounded-full flex-shrink-0" style={{ background: severityColor(insight.severity) }} />
        <div className="flex-1">
          <h4 className="font-bold">{insight.title}</h4>
          <p className="mt-1 text-sm opacity-80">{insight.message}</p>
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  phase,
  metricName,
  phaseLabel,
  hasTime,
  timeSeriesData,
  heatmap,
}: {
  phase: HttpPhase;
  metricName: string;
  phaseLabel: string;
  hasTime: boolean;
  timeSeriesData: TimeSeriesEntry[];
  heatmap?: Heatmap;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-3">
        <span className="h-3 w-3 rounded-full" style={{ background: phaseColor(phase) }} />
        <h3 className="text-lg font-black">{metricName}</h3>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold uppercase text-slate-500 dark:bg-slate-800">
          {phaseLabel}
        </span>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div>
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{metricName} (over time)</h4>
          {hasTime ? (
            <ResponseTimeOverTime data={timeSeriesData} phase={phase} />
          ) : (
            <EmptyMetric />
          )}
        </div>
        <div>
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{metricName} (over time) · Heatmap</h4>
          {heatmap ? <HeatmapChart heatmap={heatmap} /> : <EmptyMetric />}
        </div>
      </div>
    </section>
  );
}

function ResponseTimeOverTime({ data, phase }: { data: TimeSeriesEntry[]; phase: HttpPhase }) {
  const theme = useChartTheme();
  const themeTooltip = THEME_TOOLTIP(theme);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
        <XAxis dataKey="time" tickFormatter={formatAxisLabel} tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
        <YAxis tickFormatter={(value) => formatMs(value)} tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
        <Tooltip formatter={(value) => formatMs(Number(value))} labelFormatter={formatAxisLabel} {...themeTooltip} />
        <Legend content={<ThemedLegend theme={theme} />} />
        {OVER_TIME_SERIES.map((series) => (
          <Line
            key={series.key}
            type="monotone"
            dataKey={`${phase}${series.key}`}
            name={series.name}
            stroke={series.color}
            strokeWidth={series.key === "Max" ? 2 : 1.5}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function TimeSeriesArea({ data, dataKey, color, name }: { data: TimeSeriesEntry[]; dataKey: string; color: string; name: string }) {
  const gradientId = `grad-${dataKey}`;
  const theme = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.45} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="time" hide />
        <YAxis hide />
        <Tooltip formatter={(value) => formatNumber(Number(value))} labelFormatter={formatAxisLabel} {...THEME_TOOLTIP(theme)} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} fill={`url(#${gradientId})`} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function StatPanel({ title, metric, danger, children }: { title: string; metric: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className={"mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wide " + (danger ? "text-red-600" : "text-slate-500")}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: danger ? "#ef4444" : phaseColor(metric as HttpPhase) }} />
        {title}
      </div>
      {children}
    </div>
  );
}

function EmptyMetric() {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400 dark:bg-slate-800">
      Sem dados para este formato.
    </div>
  );
}

function HeatmapChart({ heatmap }: { heatmap: Heatmap }) {
  const { buckets, series } = heatmap;
  const maxCount = Math.max(1, ...series.flatMap((bin) => bin.counts));
  const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const binLabels = buckets.map((_, i) => {
    if (i === 0) return `<${buckets[0]}ms`;
    if (i === buckets.length) return `>${buckets[buckets.length - 1]}ms`;
    return `${buckets[i - 1]}–${buckets[i]}ms`;
  });

  if (!series.length) return <EmptyMetric />;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `84px repeat(${series.length}, ${Math.max(14, Math.min(26, 720 / series.length))}px)`,
          gridTemplateRows: `repeat(${buckets.length + 1}, 18px)`,
        }}
      >
        <div />
        {series.map((bin) => (
          <div key={bin.t0} className="flex items-end justify-center text-[8px] text-slate-400">
            {timeFormat.format(bin.t0)}
          </div>
        ))}
        {[...binLabels].reverse().map((label, rowIndex) => {
          const valueBinIndex = buckets.length - rowIndex;
          return (
            <div key={label} className="contents">
              <div className="flex items-center justify-end pr-2 text-[10px] text-slate-500">{label}</div>
              {series.map((bin) => {
                const count = bin.counts[valueBinIndex] ?? 0;
                return (
                  <div
                    key={`${label}-${bin.t0}`}
                    className="group relative m-px rounded-[3px]"
                    style={{ background: cellColor(count, maxCount) }}
                  >
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-100 dark:text-slate-900">
                      <div className="font-bold">{label}</div>
                      <div>{timeFormat.format(bin.t0)}</div>
                      <div className="mt-1 font-black">{count} requisições</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function cellColor(value: number, max: number) {
  if (value <= 0) return "#f1f5f9";
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const hue = 120 - ratio * 120;
  return `hsla(${hue}, 75%, 46%, ${0.35 + 0.65 * ratio})`;
}

function phaseColor(phase: HttpPhase | "vus" | "rps" | "errs" | "checks" | string) {
  switch (phase) {
    case "duration": return "#4f46e5";
    case "blocked": return "#ef4444";
    case "connecting": return "#06b6d4";
    case "receiving": return "#10b981";
    case "sending": return "#f59e0b";
    case "waiting": return "#f43f5e";
    case "vus": return "#4f46e5";
    case "rps": return "#0ea5e9";
    case "errs": return "#ef4444";
    case "checks": return "#10b981";
    default: return "#64748b";
  }
}
