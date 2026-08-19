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

const SERIES_COLORS = [
  "#4f46e5",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

const PHASE_SERIES_COLORS: Record<string, string> = {
  duration: "#4f46e5",
  blocked: "#ef4444",
  connecting: "#06b6d4",
  sending: "#10b981",
  waiting: "#f59e0b",
  receiving: "#8b5cf6",
};

function formatMs(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/D";
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

export default function PerformanceDashboard({ data }: { data: DashboardData }) {
  const { timeSeriesData, heatmaps, phaseStats, aggregateReport, labels, capabilities } = data;
  const hasTime = capabilities.timeSeries && timeSeriesData.length > 0;
  const activePhases = phaseStats.filter((phase) => phase.count > 0);
  const durationStats = phaseStats.find((phase) => phase.metric === "duration");
  const hasVus = capabilities.activeUsers && timeSeriesData.some((item) => Number(item.vus || item.totalActiveThreads) > 0);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {activePhases.length > 0 ? (
          activePhases.map((phase) => (
            <PhaseCard key={phase.metric} phase={phase} />
          ))
        ) : (
          <div className="col-span-full rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
            Estatísticas por fase indisponíveis para este formato.
          </div>
        )}
      </section>

      {hasTime ? (
        <section className="grid gap-5 xl:grid-cols-2">
          {hasVus ? (
            <Panel title="Usuários virtuais (over time)" unit="vus">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={timeSeriesData}>
                  <defs>
                    <linearGradient id="vusGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" hide />
                  <YAxis />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="vus"
                    name="VUs"
                    stroke="#4f46e5"
                    fill="url(#vusGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          ) : (
            <Panel title="Requisições por segundo">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" hide />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="rps" name="req/s" stroke="#06b6d4" fill="#06b6d433" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {hasVus ? (
            <Panel title="Requisições por segundo (over time)">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" hide />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="rps" name="req/s" stroke="#06b6d4" fill="#06b6d433" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          ) : (
            <Panel title="Erros por segundo">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" hide />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="errs" name="Erros" stroke="#ef4444" fill="#ef444433" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {hasVus && (
            <Panel title="Erros por segundo (over time)">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" hide />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="errs" name="Erros" stroke="#ef4444" fill="#ef444433" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          )}

          <Panel title="Tempo de resposta (over time)">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" hide />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="durationAvg" name="Média" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="durationP90" name="P90" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="durationP95" name="P95" stroke="#4f46e5" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="durationMax" name="Máx" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </section>
      ) : !durationStats ? null : (
        <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
          Séries temporais não disponíveis para este formato agregado.
        </div>
      )}

      <PhaseOverTimePanels timeSeriesData={timeSeriesData} activePhases={activePhases} hasTime={hasTime} />

      {heatmaps.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-black">Distribuição de latência (heatmap)</h2>
          <div className="grid gap-5 xl:grid-cols-2">
            {heatmaps.map((heatmap) => (
              <Panel title={`${heatmap.label} — heatmap`} key={heatmap.metric}>
                <HeatmapChart heatmap={heatmap} />
              </Panel>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="Tempo médio por endpoint">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={aggregateReport}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" hide />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="average" name="Média (ms)" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              <Bar dataKey="p95" name="P95 (ms)" fill="#06b6d4" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        {labels.length > 1 && (
          <Panel title="Evolução do tempo de resposta por endpoint">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" hide />
                <YAxis />
                <Tooltip />
                <Legend />
                {labels.slice(0, 8).map((label, index) => (
                  <Line
                    key={label}
                    type="monotone"
                    dataKey={`elapsed_${label}`}
                    name={label}
                    stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                    strokeWidth={1.5}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        )}
      </section>
    </div>
  );
}

function PhaseCard({ phase }: { phase: MetricStats }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: PHASE_SERIES_COLORS[phase.metric] }}
        />
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {phase.label}
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Média</span>
          <strong>{formatMs(phase.mean)}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Mediana</span>
          <strong>{formatMs(phase.median)}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">P95</span>
          <strong className="text-indigo-600 dark:text-indigo-300">{formatMs(phase.p95)}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">P90</span>
          <strong>{formatMs(phase.p90)}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Máx</span>
          <strong className="text-red-600">{formatMs(phase.max)}</strong>
        </div>
      </div>
    </div>
  );
}

function PhaseOverTimePanels({
  timeSeriesData,
  activePhases,
  hasTime,
}: {
  timeSeriesData: TimeSeriesEntry[];
  activePhases: MetricStats[];
  hasTime: boolean;
}) {
  const phases = activePhases.filter((phase) => phase.metric !== "duration");
  if (!hasTime || !phases.length) return null;
  return (
    <section>
      <h2 className="mb-4 text-xl font-black">Fases da requisição (over time)</h2>
      <div className="grid gap-5 xl:grid-cols-2">
        {phases.map((phase) => (
          <Panel key={phase.metric} title={`${phase.label} (over time)`}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" hide />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey={`${phase.metric}Avg`}
                  name="Média"
                  stroke={PHASE_SERIES_COLORS[phase.metric]}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey={`${phase.metric}P95`}
                  name="P95"
                  stroke="#4f46e5"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function HeatmapChart({ heatmap }: { heatmap: Heatmap }) {
  const { buckets, series } = heatmap;
  const maxCount = Math.max(1, ...series.flatMap((bin) => bin.counts));
  const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const binLabels = buckets.map((_, i) => {
    if (i === 0) return `< ${buckets[0]}ms`;
    if (i === buckets.length) return `> ${buckets[buckets.length - 1]}ms`;
    return `${buckets[i - 1]}–${buckets[i]}ms`;
  });

  if (!series.length) {
    return <p className="py-10 text-center text-sm text-slate-500">Sem dados de distribuição.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `96px repeat(${series.length}, ${Math.max(18, Math.min(30, 720 / series.length))}px)`,
          gridTemplateRows: `repeat(${buckets.length + 1}, 18px)`,
        }}
      >
        <div />
        {series.map((bin) => (
          <div key={bin.t0} className="flex items-end justify-center text-[9px] text-slate-400">
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
                    title={`${label} · ${timeFormat.format(bin.t0)} · ${count} req`}
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
  return `hsla(${hue}, 75%, 45%, ${0.35 + 0.65 * ratio})`;
}

function Panel({ title, unit, children }: { title: string; unit?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-4 text-lg font-black">
        {title}
        {unit && <span className="ml-2 text-xs font-bold uppercase tracking-wide text-slate-400">{unit}</span>}
      </h3>
      {children}
    </div>
  );
}