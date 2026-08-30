"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { useTheme } from "@/context/ThemeContext";
import type { ErrorCodeSlice, GaugeMetrics, NetworkPoint, PercentileRow, ScatterPoint } from "./chartHelpers";
import { formatBytesPerSecond } from "./chartHelpers";

export type ChartTheme = {
  grid: string;
  axis: string;
  legend: string;
  tooltip: { background: string; color: string; border: string };
};

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    grid: dark ? "#1e293b" : "#e2e8f0",
    axis: dark ? "#94a3b8" : "#64748b",
    legend: dark ? "#cbd5e1" : "#334155",
    tooltip: dark
      ? { background: "#0f172a", color: "#e2e8f0", border: "#475569" }
      : { background: "#ffffff", color: "#0f172a", border: "#e2e8f0" },
  };
}

export const THEME_TOOLTIP = (theme: ChartTheme) => ({
  contentStyle: {
    background: theme.tooltip.background,
    color: theme.tooltip.color,
    border: `1px solid ${theme.tooltip.border}`,
    borderRadius: 12,
    fontSize: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,.12)",
  },
  labelStyle: { color: theme.tooltip.color, fontWeight: 800, marginBottom: 4 },
  itemStyle: { color: theme.tooltip.color },
});

export function ThemedLegend({ theme, payload }: { theme: ChartTheme; payload?: Array<{ value?: string | number; color?: string; payload?: { fill?: string } }> }) {
  return (
    <ul
      style={{
        listStyle: "none",
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        justifyContent: "center",
        padding: 0,
        margin: "8px 0 0",
        color: theme.legend,
      }}
    >
      {(payload ?? []).map((entry, index) => (
        <li key={`${entry.value}-${index}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: entry.color || entry.payload?.fill || "#64748b" }} />
          <span>{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}

export const GAUGE_COLORS = {
  good: "#10b981",
  warn: "#f59e0b",
  bad: "#ef4444",
  info: "#3b82f6",
};

export type BaselineChange = {
  label: string;
  averageChange: number;
  p95Change: number;
  errorRateChange: number;
};

function Card({ title, subtitle, children, full }: { title: string; subtitle?: string; children: React.ReactNode; full?: boolean }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${full ? "xl:col-span-2" : ""}`}>
      <h3 className="text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function NoData({ label, height = 260 }: { label: string; height?: number }) {
  return (
    <div style={{ height }} className="flex items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400 dark:bg-slate-800">
      {label}
    </div>
  );
}

export function GaugeRow({ gauge }: { gauge: GaugeMetrics }) {
  const latencyP95 = gauge.p95 ?? 0;
  const latencyTone = latencyP95 <= 500 ? GAUGE_COLORS.good : latencyP95 <= 1000 ? GAUGE_COLORS.warn : GAUGE_COLORS.bad;
  const errorTone = gauge.errorRate <= 1 ? GAUGE_COLORS.good : gauge.errorRate <= 5 ? GAUGE_COLORS.warn : GAUGE_COLORS.bad;
  const rpsRatio = gauge.maxRps > 0 ? Math.min(1, gauge.avgRps / gauge.maxRps) : 0;
  const usersRatio = gauge.maxConcurrentUsers > 0 ? 1 : 0;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <GaugeFigure
        label="Throughput"
        value={`${gauge.avgRps.toFixed(1)} req/s`}
        detail={`pico de ${gauge.maxRps.toFixed(1)} req/s`}
        ratio={rpsRatio}
        bar={GAUGE_COLORS.info}
      />
      <GaugeFigure
        label="Latência P95"
        value={gauge.p95 === null ? "N/D" : gauge.p95 >= 1000 ? `${(gauge.p95 / 1000).toFixed(2)}s` : `${Math.round(gauge.p95)}ms`}
        detail={gauge.p95 === null ? "métrica indisponível" : "percentil de resposta"}
        ratio={latencyP95 > 0 ? Math.min(1, latencyP95 / 2000) : 0}
        bar={latencyTone}
      />
      <GaugeFigure
        label="Concorrência máxima"
        value={`${gauge.maxConcurrentUsers} VUs`}
        detail="usuários simultâneos"
        ratio={usersRatio}
        bar={GAUGE_COLORS.info}
      />
      <GaugeFigure
        label="Taxa de erro"
        value={`${gauge.errorRate.toFixed(2)}%`}
        detail={gauge.errorRate === 0 ? "zero falhas" : "falhas na execução"}
        ratio={Math.min(1, gauge.errorRate / 10)}
        bar={errorTone}
      />
    </div>
  );
}

function GaugeFigure({ label, value, detail, ratio, bar }: { label: string; value: string; detail: string; ratio: number; bar: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{detail}</div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, ratio * 100)}%`, background: bar }} />
      </div>
    </div>
  );
}

export function VusLatencyScatter({ points, theme }: { points: ScatterPoint[]; theme: ChartTheme }) {
  if (!points.length) return <NoData label="Sem dados de latência por volume de usuários." />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
        <XAxis
          type="number"
          dataKey="vus"
          name="VUs"
          tick={{ fill: theme.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: theme.grid }}
        />
        <YAxis
          type="number"
          dataKey="latency"
          name="ms"
          tick={{ fill: theme.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: theme.grid }}
        />
        <ZAxis range={[28, 64]} />
        <Tooltip
          formatter={(value: number, name: string) => (name === "ms" ? formatMs(value) : value)}
          labelFormatter={() => ""}
          {...THEME_TOOLTIP(theme)}
        />
        <Scatter name="Latência média" data={points} fill="#8b5cf6" fillOpacity={0.55} stroke="#7c3aed" strokeWidth={1} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function HttpErrorsPie({ slices, theme }: { slices: ErrorCodeSlice[]; theme: ChartTheme }) {
  if (!slices.length) return <NoData label="Nenhum erro agrupado registrado." />;
  return (
    <div className="grid gap-1 md:grid-cols-2">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="count"
            nameKey="label"
            innerRadius={52}
            outerRadius={88}
            paddingAngle={2}
            stroke="#fff"
            strokeWidth={1}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.code} fill={PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => `${value.toLocaleString("pt-BR")} erros`} {...THEME_TOOLTIP(theme)} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="space-y-2 self-center">
        {slices.map((slice, index) => (
          <li key={slice.code} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
            <span className="font-bold">{slice.code}</span>
            <span className="text-xs opacity-60">{((slice.count / slice.total) * 100).toFixed(1)}%</span>
            <span className="ml-auto font-black">{slice.count.toLocaleString("pt-BR")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PIE_COLORS = ["#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b", "#3b82f6"];

export function ErrorRateBars({ rows, theme }: { rows: Array<{ label: string; errorRate: number }>; theme: ChartTheme }) {
  const data = rows
    .filter((item) => item.errorRate > 0)
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 12);
  if (!data.length) return <NoData label="Nenhuma taxa de erro registrada por endpoint." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={false} />
        <XAxis type="number" unit="%" tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
        <YAxis type="category" dataKey="label" width={150} tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} {...THEME_TOOLTIP(theme)} />
        <Bar dataKey="errorRate" name="Erro (%)" radius={[0, 6, 6, 0]}>
          {data.map((item) => (
            <Cell key={item.label} fill={item.errorRate <= 1 ? "#10b981" : item.errorRate <= 5 ? "#f59e0b" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NetworkThroughputChart({ points, theme }: { points: NetworkPoint[]; theme: ChartTheme }) {
  if (!points.some((point) => point.down > 0 || point.up > 0)) {
    return <NoData label="A métrica de rede não está presente no arquivo." />;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <defs>
          <linearGradient id="netDown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="netUp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
        <XAxis dataKey="time" tickFormatter={formatAxisLabel} tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
        <YAxis tickFormatter={(value) => formatBytesPerSecond(Number(value))} tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
        <Tooltip formatter={(value: number) => formatBytesPerSecond(Number(value))} labelFormatter={formatAxisLabel} {...THEME_TOOLTIP(theme)} />
        <Legend content={<ThemedLegend theme={theme} />} />
        <Area type="monotone" dataKey="down" name="Recebido" stroke="#06b6d4" fill="url(#netDown)" strokeWidth={2} />
        <Area type="monotone" dataKey="up" name="Enviado" stroke="#f59e0b" fill="url(#netUp)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PercentilesChart({ rows, theme }: { rows: PercentileRow[]; theme: ChartTheme }) {
  if (!rows.length) return <NoData label="Sem dados de latência por endpoint." />;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 48, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
        <XAxis dataKey="label" interval={0} angle={-28} textAnchor="end" height={64} tick={{ fill: theme.axis, fontSize: 10 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
        <YAxis tickFormatter={(value) => formatMs(value)} tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.grid }} />
        <Tooltip formatter={(value: number) => formatMs(value)} {...THEME_TOOLTIP(theme)} cursor={{ fill: theme.grid, opacity: 0.4 }} />
        <Legend content={<ThemedLegend theme={theme} />} />
        <Bar dataKey="median" name="Mediana" fill="#94a3b8" radius={[4, 4, 0, 0]} />
        <Bar dataKey="average" name="Média" fill="#4f46e5" radius={[4, 4, 0, 0]} />
        <Bar dataKey="p90" name="P90" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="p95" name="P95" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="p99" name="P99" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BaselineComparisonChart({ changes }: { changes: BaselineChange[] }) {
  if (!changes.length) return <NoData label="Nenhum comparativo com a baseline disponível." />;
  return (
    <ul className="space-y-4">
      {changes.slice(0, 6).map((item) => (
        <li key={item.label}>
          <div className="text-sm font-black">{item.label}</div>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            <ChangeBar label="Média" value={item.averageChange} unit="%" inverted />
            <ChangeBar label="P95" value={item.p95Change} unit="%" inverted />
            <ChangeBar label="Erro" value={item.errorRateChange} unit=" p.p." inverted />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChangeBar({ label, value, unit, inverted }: { label: string; value: number; unit: string; inverted?: boolean }) {
  const positiveIsBad = inverted ?? false;
  const worsening = positiveIsBad ? value > 0 : value > 0;
  const color = Math.abs(value) < 0.001 ? "#64748b" : worsening ? "#ef4444" : "#10b981";
  return (
    <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        <span style={{ color }}>
          {value > 0 ? "+" : ""}
          {value.toFixed(value > -1 && value < 1 ? 2 : 1)}
          {unit}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.abs(value))}%`,
            background: color,
            marginLeft: value <= 0 ? "50%" : 0,
          }}
        />
      </div>
    </div>
  );
}

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

export { Card };