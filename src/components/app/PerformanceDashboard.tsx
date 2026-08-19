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
  Heatmap,
  HttpPhase,
  MetricStats,
  TimeSeriesEntry,
} from "@/lib/parsers";

export type DashboardData = {
  capabilities: Record<string, boolean>;
  timeSeriesData: TimeSeriesEntry[];
  heatmaps: Heatmap[];
  phaseStats: MetricStats[];
  aggregateReport: AggregateReportItem[];
  labels: string[];
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

// Grafana-style series colors: max=green, p95=blue, p90=gold, min=slate
const OVER_TIME_SERIES = [
  { key: "Min", name: "min", color: "#94a3b8" },
  { key: "P90", name: "p90", color: "#f59e0b" },
  { key: "P95", name: "p95", color: "#3b82f6" },
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

export default function PerformanceDashboard({ data }: { data: DashboardData }) {
  const { timeSeriesData, heatmaps, phaseStats, aggregateReport, capabilities, labels } = data;
  const hasTime = capabilities.timeSeries && timeSeriesData.length > 0;
  const hasVus = hasTime && timeSeriesData.some((item) => Number(item.vus) > 0);
  const hasRps = hasTime && timeSeriesData.some((item) => Number(item.rps) > 0);
  const hasErrors = hasTime && timeSeriesData.some((item) => Number(item.errs) > 0);
  const hasChecks =
    hasTime && timeSeriesData.some((item) => Number(item.checks) > 0 || Number(item.checksFailed) > 0);

  const phaseStatsMap = new Map(phaseStats.map((phase) => [phase.metric, phase]));
  const heatmapMap = new Map(heatmaps.map((heatmap) => [heatmap.metric, heatmap]));

  const metricPhases = PHASE_ORDER.filter((phase) => {
    const stats = phaseStatsMap.get(phase);
    if (stats && stats.count > 0) return true;
    return hasTime && timeSeriesData.some((item) => item[`${phase}Avg`] !== undefined);
  });

  return (
    <div className="space-y-6">
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
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" hide />
              <YAxis tickFormatter={(value) => formatMs(value)} />
              <Tooltip formatter={(value) => formatMs(Number(value))} />
              <Legend />
              <Bar dataKey="average" name="Média (ms)" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              <Bar dataKey="p95" name="P95 (ms)" fill="#06b6d4" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {labels.length > 1 && (
            <div className="mt-6">
              <h3 className="mb-4 text-lg font-black">Evolução do tempo de resposta por endpoint</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tickFormatter={formatAxisLabel} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
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
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" tickFormatter={formatAxisLabel} />
        <YAxis tickFormatter={(value) => formatMs(value)} />
        <Tooltip formatter={(value) => formatMs(Number(value))} labelFormatter={formatAxisLabel} />
        <Legend />
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
        <Tooltip formatter={(value) => formatNumber(Number(value))} labelFormatter={formatAxisLabel} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} fill={`url(#${gradientId})`} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function formatNumber(value: number) {
  return Number(value.toFixed(1)).toLocaleString("pt-BR");
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
                    title={`${label} · ${timeFormat.format(bin.t0)} · ${count}`}
                    className="m-px rounded-[3px]"
                    style={{ background: cellColor(count, maxCount) }}
                  />
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