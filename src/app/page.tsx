"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
  PieChart, Pie, BarChart, Bar, AreaChart, Area, Cell, ComposedChart, Scatter,
  ScatterChart
} from "recharts";

const COLORS = [
  "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
  "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC"
];

type AggregateReportItem = {
  label: string;
  average: number;
  median: number;
  p90: number;
  p95: number;
  min: number;
  max: number;
  errorRate: number;
  throughput: number;
  count: number;
  averageLatency: number;
  medianLatency: number;
  bytes: number;
  sentBytes: number;
};

export default function PerformanceDashboard() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [chartFilter, setChartFilter] = useState<string>("all");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [rampUpInfo, setRampUpInfo] = useState<{ users: number; usersPerTest: number; duration: string }>({ users: 0, usersPerTest: 0, duration: "0s" });
  const [successCount, setSuccessCount] = useState<number>(0);
  const [errorCount, setErrorCount] = useState<number>(0);
  const [aggregateReport, setAggregateReport] = useState<AggregateReportItem[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
  const [errorDetails, setErrorDetails] = useState<{ code: string; message: string; count: number }[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fileSizeWarning, setFileSizeWarning] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [processingTime, setProcessingTime] = useState<number>(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);

  const formatProcessingTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const themeStyles = {
    dark: {
      bg: "#1a1a1a",
      text: "#fff",
      cardBg: "#2c2c2c",
      border: "#444",
      gridStroke: "#444",
      success: "#59A14F",
      error: "#E15759",
      areaFill: "rgba(89, 161, 79, 0.3)",
      lineStroke: "#59A14F",
      heatmap: ["#003087", "#21908d", "#5bc862", "#f7e11e", "#ff7e00", "#d62728"]
    },
    light: {
      bg: "#f5f5f5",
      text: "#333",
      cardBg: "#fff",
      border: "#ddd",
      gridStroke: "#eee",
      success: "#388E3C",
      error: "#D32F2F",
      areaFill: "rgba(56, 142, 60, 0.3)",
      lineStroke: "#388E3C",
      heatmap: ["#e6f0ff", "#b3d9ff", "#80bfff", "#ffcc99", "#ff9966", "#ff3333"]
    }
  };

  const formatDuration = (ms: number) => {
    if (ms <= 0 || isNaN(ms)) return "0s";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;

    if (hours > 0) return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
    if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
    return `${seconds}s`;
  };

  const formatValueWithUnit = (value: number, type: string = "time") => {
    if (value === undefined || value === null || isNaN(value)) return "N/A";
    if (type === "time") {
      if (value >= 60000) return `${(value / 60000).toFixed(2)} min`;
      if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
      return `${value.toFixed(2)} ms`;
    } else if (type === "bytes") {
      if (value >= 1048576) return `${(value / 1048576).toFixed(2)} MB`;
      if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`;
      return `${value.toFixed(2)} B`;
    }
    return value.toFixed(2);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div style={{
        padding: "10px",
        backgroundColor: themeStyles[theme].cardBg,
        color: themeStyles[theme].text,
        border: `1px solid ${themeStyles[theme].border}`,
        borderRadius: "5px",
        boxShadow: "0px 0px 10px rgba(0,0,0,0.1)"
      }}>
        <p style={{ fontWeight: "bold", marginBottom: "5px" }}>{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={`tooltip-${index}`} style={{ margin: "3px 0", color: entry.color }}>
            {entry.name}: {entry.name.includes("latency") || entry.name.includes("elapsed")
              ? formatValueWithUnit(entry.value, "time")
              : entry.name.includes("bytes")
                ? formatValueWithUnit(entry.value, "bytes")
                : entry.value}
          </p>
        ))}
      </div>
    );
  };

  const HeatmapTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const entry = payload[0].payload;
    return (
      <div style={{
        padding: "10px",
        backgroundColor: themeStyles[theme].cardBg,
        color: themeStyles[theme].text,
        border: `1px solid ${themeStyles[theme].border}`,
        borderRadius: "5px",
        boxShadow: "0px 0px 10px rgba(0,0,0,0.1)"
      }}>
        <p style={{ fontWeight: "bold", marginBottom: "5px" }}>Detalhes</p>
        <p style={{ margin: "3px 0" }}>Horário: {entry.time}</p>
        <p style={{ margin: "3px 0" }}>Valor: {formatValueWithUnit(entry.value, "time")}</p>
        <p style={{ margin: "3px 0" }}>Contagem: {entry.count}</p>
      </div>
    );
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setFileSizeWarning("");
    setErrorMessage("");
    setProcessingTime(0);

    const interval = setInterval(() => {
      setProcessingTime(prev => prev + 1);
    }, 1000);
    setTimerInterval(interval);

    if (file.size > 50 * 1024 * 1024) {
      setFileSizeWarning(`Arquivo grande (${(file.size / (1024 * 1024)).toFixed(2)} MB). O processamento pode demorar.`);
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/process-jtl", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Erro ao processar o arquivo na API.");
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setSuccessCount(result.successCount);
      setErrorCount(result.errorCount);
      setStartTime(result.startTime);
      setEndTime(result.endTime);

      const updatedTimeSeriesData = result.timeSeriesData.map((entry: any) => {
        const activeThreadsKeys = Object.keys(entry).filter(key => key.startsWith("activeThreads_"));
        let totalActiveThreads = 0;
        activeThreadsKeys.forEach(key => {
          totalActiveThreads += entry[key] || 0;
        });
        return { ...entry, totalActiveThreads };
      });

      const maxTotalUsers = Math.max(...updatedTimeSeriesData.map((entry: any) => entry.totalActiveThreads));
      const activeThreadsKeys = Object.keys(result.timeSeriesData[0] || {}).filter(key => key.startsWith("activeThreads_"));
      const tests = Array.from(new Set(activeThreadsKeys.map(key => key.split('_')[1])));
      const maxUsersPerTest = tests.length > 0 ? Math.round(maxTotalUsers / tests.length) : 0;

      setRampUpInfo({
        users: maxTotalUsers,
        usersPerTest: maxUsersPerTest,
        duration: result.rampUpInfo.duration
      });

      setAggregateReport(result.aggregateReport);
      setTimeSeriesData(updatedTimeSeriesData);
      setErrorDetails(result.errorDetails);
    } catch (error) {
      console.error("Erro ao processar o arquivo:", error);
      setErrorMessage("Erro ao processar o arquivo. Tente novamente ou use um arquivo menor.");
    } finally {
      setIsLoading(false);
      clearInterval(interval);
      setTimerInterval(null);
    }
  };

  const calculateStats = (data: any[], dataKeys: string[]) => {
    const values: number[] = data
      .flatMap(entry => dataKeys.map(key => entry[key] || 0))
      .filter(val => val !== undefined && !isNaN(val) && val !== 0);

    if (!values.length) {
      return { avg: 0, max: 0, median: 0, min: 0, p90: 0, p95: 0 };
    }

    const sortedValues = values.sort((a, b) => a - b);
    const sum = sortedValues.reduce((acc, val) => acc + val, 0);
    const avg = sum / sortedValues.length;
    const max = Math.max(...sortedValues);
    const min = Math.min(...sortedValues);
    const median = sortedValues[Math.floor(sortedValues.length / 2)];
    const p90 = sortedValues[Math.floor(sortedValues.length * 0.9)];
    const p95 = sortedValues[Math.floor(sortedValues.length * 0.95)];

    return { avg, max, median, min, p90, p95 };
  };

  const SimplifiedChart = ({ data, dataKeys, title, yAxisFormatter, chartType = "line", summary }: {
    data: any[];
    dataKeys: string[];
    title: string;
    yAxisFormatter?: (value: any) => string;
    chartType?: "line" | "bar" | "area" | "composed";
    summary?: { avg?: number; max?: number; median?: number; min?: number; p90?: number; p95?: number };
  }) => {
    const ChartComponent = chartType === "line" ? LineChart : chartType === "bar" ? BarChart : chartType === "area" ? AreaChart : ComposedChart;
    const DataComponent = chartType === "line" || chartType === "composed" ? Line : chartType === "area" ? Area : Bar;

    const stats = summary || calculateStats(data, dataKeys);
    const maxValue = stats.max || 10;

    return (
      <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px", marginBottom: "20px", boxShadow: "0px 2px 5px rgba(0,0,0,0.1)" }}>
        <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", textAlign: "center", marginBottom: "10px" }}>{title}</h3>
        {chartType !== "composed" && (
          <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "10px", flexWrap: "nowrap", overflowX: "auto" }}>
            <span style={{ backgroundColor: "#76B7B2", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
              Mínimo: {formatValueWithUnit(stats.min ?? 0, "time")}
            </span>
            <span style={{ backgroundColor: "#4E79A7", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
              Média: {formatValueWithUnit(stats.avg ?? 0, "time")}
            </span>
            <span style={{ backgroundColor: "#E15759", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
              Mediana: {formatValueWithUnit(stats.median ?? 0, "time")}
            </span>
            <span style={{ backgroundColor: "#59A14F", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
              P90: {formatValueWithUnit(stats.p90 ?? 0, "time")}
            </span>
            <span style={{ backgroundColor: "#EDC948", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
              P95: {formatValueWithUnit(stats.p95 ?? 0, "time")}
            </span>
            <span style={{ backgroundColor: "#F28E2B", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
              Máximo: {formatValueWithUnit(stats.max ?? 0, "time")}
            </span>
          </div>
        )}
        <ResponsiveContainer width="100%" height={300}>
          <ChartComponent data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
            <XAxis dataKey="time" stroke={themeStyles[theme].text} tick={{ fontSize: 12 }} />
            <YAxis
              stroke={themeStyles[theme].text}
              domain={[0, Math.ceil(maxValue * 1.1)]}
              tickFormatter={yAxisFormatter || ((v) => v)}
            />
            <Tooltip content={<CustomTooltip />} />
            {chartType === "composed" ? (
              <>
                <Area type="monotone" dataKey={dataKeys[0]} stroke={themeStyles[theme].lineStroke} fill={themeStyles[theme].areaFill} name="Média" />
                <Line type="monotone" dataKey={dataKeys[1]} stroke={COLORS[4]} strokeWidth={1} dot={false} name="P90" />
                <Line type="monotone" dataKey={dataKeys[2]} stroke={COLORS[5]} strokeWidth={1} dot={false} name="P95" />
              </>
            ) : (
              dataKeys.map((key, index) => (
                <DataComponent
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[index % COLORS.length]}
                  fill={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  activeDot={{ r: 6 }}
                  name={key.split('_')[1] === "Unknown" ? "Não identificado" : key.split('_')[1]}
                />
              ))
            )}
            <Legend wrapperStyle={{ paddingTop: "20px", fontSize: "14px" }} formatter={(value) => <span style={{ color: themeStyles[theme].text }}>{value}</span>} />
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    );
  };

  const HeatmapChart = ({ data, dataKey, title }: { data: any[]; dataKey: string; title: string }) => {
    const binData = () => {
      const bins: { [key: string]: number } = {};
      const timeStep = 1000; // 1 segundo
      const valueStep = 50; // 50ms por bin
      const baseDate = startTime ? new Date(startTime) : new Date();
      const baseDateString = baseDate.toISOString().split('T')[0];

      data.forEach(entry => {
        if (!entry.time || !entry[dataKey]) return;
        let timeString = entry.time;
        if (!timeString.includes('T')) {
          timeString = `${baseDateString}T${timeString}`;
        }
        const time = new Date(timeString).getTime();
        if (isNaN(time)) return;
        const value = entry[dataKey];
        const timeBin = Math.floor(time / timeStep) * timeStep;
        const valueBin = Math.floor(value / valueStep) * valueStep;
        const key = `${timeBin}_${valueBin}`;
        bins[key] = (bins[key] || 0) + 1;
      });

      return Object.entries(bins).map(([key, count]) => {
        const [time, value] = key.split('_').map(Number);
        const formattedTime = new Date(time);
        if (isNaN(formattedTime.getTime())) return null;
        return { time: formattedTime.toISOString().substring(11, 19), value, count };
      }).filter(item => item !== null);
    };

    const binnedData = binData();
    const maxCount = Math.max(...binnedData.map(d => d.count), 1);
    const stats = {
      max: Math.max(...binnedData.map(d => d.value)),
      min: Math.min(...binnedData.map(d => d.value)),
      avg: binnedData.reduce((sum, d) => sum + d.value, 0) / binnedData.length,
    };

    if (!binnedData.length) {
      return (
        <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px", marginBottom: "20px", boxShadow: "0px 2px 5px rgba(0,0,0,0.1)", textAlign: "center", color: themeStyles[theme].text }}>
          <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", marginBottom: "15px" }}>{title} (Heatmap)</h3>
          <p>Nenhum dado disponível para exibir o heatmap.</p>
        </div>
      );
    }

    return (
      <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px", marginBottom: "20px", boxShadow: "0px 2px 5px rgba(0,0,0,0.1)" }}>
        <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", textAlign: "center", marginBottom: "10px" }}>{title} (Heatmap)</h3>
        <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "10px", flexWrap: "nowrap", overflowX: "auto" }}>
          <span style={{ backgroundColor: "#F28E2B", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
            Mínimo: {formatValueWithUnit(stats.min, "time")}
          </span>
          <span style={{ backgroundColor: "#E15759", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
            Média: {formatValueWithUnit(stats.avg, "time")}
          </span>
          <span style={{ backgroundColor: "#4E79A7", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
            Máximo: {formatValueWithUnit(stats.max, "time")}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart data={binnedData}>
            <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
            <XAxis dataKey="time" stroke={themeStyles[theme].text} tick={{ fontSize: 12 }} />
            <YAxis dataKey="value" stroke={themeStyles[theme].text} tickFormatter={(value) => formatValueWithUnit(value, "time")} domain={[0, stats.max * 1.1]} />
            <Tooltip content={<HeatmapTooltip />} />
            <Scatter dataKey="count" shape="square">
              {binnedData.map((entry, index) => {
                const intensity = entry.count / maxCount;
                const colorIndex = Math.floor(intensity * (themeStyles[theme].heatmap.length - 1));
                return <Cell key={`cell-${index}`} fill={themeStyles[theme].heatmap[colorIndex]} />;
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px" }}>
          <span>Intensidade: </span>
          <div style={{ display: "flex", gap: "5px" }}>
            {themeStyles[theme].heatmap.map((color, index) => (
              <div key={index} style={{ width: "20px", height: "10px", backgroundColor: color }} />
            ))}
            <span>[0 - {maxCount}]</span>
          </div>
        </div>
      </div>
    );
  };

  const renderCharts = () => {
    if (isLoading) {
      const timeLimitSeconds = 300;
      const isTakingTooLong = processingTime > timeLimitSeconds;

      return (
        <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "20px", borderRadius: "8px", textAlign: "center", color: themeStyles[theme].text }}>
          <p>Processando arquivo...</p>
          <p>Tempo decorrido: {formatProcessingTime(processingTime)}</p>
          {fileSizeWarning && <p style={{ color: "#F28E2B" }}>{fileSizeWarning}</p>}
          {isTakingTooLong && <p style={{ color: "#E15759", marginTop: "10px" }}>⚠️ O processamento está demorando mais que o esperado (mais de 5 minutos). Considere usar um arquivo menor ou verificar o status do servidor.</p>}
        </div>
      );
    }

    if (!startTime && !endTime) {
      return (
        <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "20px", borderRadius: "8px", textAlign: "center", color: themeStyles[theme].text }}>
          {errorMessage || "Nenhum dado carregado. Faça upload de um arquivo JTL."}
        </div>
      );
    }

    const shouldShow = (type: string) => chartFilter === "all" || chartFilter === type;
    const getDataKeys = (prefix: string) => Object.keys(timeSeriesData[0] || {}).filter(key => key.startsWith(prefix));

    return (
      <>
        {shouldShow("ramp-up") && (
          <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px", marginBottom: "20px" }}>
            <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", textAlign: "center", marginBottom: "15px" }}>Ramp-up</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "20px" }}>
              <div style={{ backgroundColor: themeStyles[theme].bg, padding: "15px", borderRadius: "5px", textAlign: "center" }}>
                <p style={{ fontSize: "18px", margin: "0" }}><strong>Usuários Máximos (Total):</strong> {rampUpInfo.users}</p>
              </div>
              <div style={{ backgroundColor: themeStyles[theme].bg, padding: "15px", borderRadius: "5px", textAlign: "center" }}>
                <p style={{ fontSize: "18px", margin: "0" }}><strong>Usuários Máximos (Por Teste):</strong> {rampUpInfo.usersPerTest}</p>
              </div>
              <div style={{ backgroundColor: themeStyles[theme].bg, padding: "15px", borderRadius: "5px", textAlign: "center" }}>
                <p style={{ fontSize: "18px", margin: "0" }}><strong>Duração do Ramp-up:</strong> {rampUpInfo.duration}</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
                <XAxis dataKey="time" stroke={themeStyles[theme].text} tick={{ fontSize: 12 }} />
                <YAxis stroke={themeStyles[theme].text} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="totalActiveThreads" stroke={themeStyles[theme].lineStroke} fill={themeStyles[theme].areaFill} name="Usuários Ativos" />
                <Legend wrapperStyle={{ paddingTop: "20px", fontSize: "14px" }} formatter={(value) => <span style={{ color: themeStyles[theme].text }}>{value}</span>} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {shouldShow("throughput") && (
          <>
            <SimplifiedChart
              data={timeSeriesData}
              dataKeys={getDataKeys("requestsPerSecond_")}
              title="Requests per Second"
              chartType="area"
            />
            <SimplifiedChart
              data={timeSeriesData}
              dataKeys={getDataKeys("checksPerSecond_")}
              title="Checks per Second"
              chartType="area"
            />
          </>
        )}

        {shouldShow("response-times") && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px", marginBottom: "20px", boxShadow: "0px 2px 5px rgba(0,0,0,0.1)" }}>
                <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", textAlign: "center", marginBottom: "10px" }}>Response Time (over time)</h3>
                <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "10px", flexWrap: "nowrap", overflowX: "auto" }}>
                  <span style={{ backgroundColor: "#76B7B2", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    Mínimo: {formatValueWithUnit(Math.min(...aggregateReport.map(item => item.min)), "time")}
                  </span>
                  <span style={{ backgroundColor: "#4E79A7", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    Média: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.average, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                  <span style={{ backgroundColor: "#E15759", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    Mediana: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.median, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                  <span style={{ backgroundColor: "#59A14F", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    P90: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.p90, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                  <span style={{ backgroundColor: "#EDC948", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    P95: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.p95, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                  <span style={{ backgroundColor: "#F28E2B", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    Máximo: {formatValueWithUnit(Math.max(...aggregateReport.map(item => item.max)), "time")}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={timeSeriesData.map(entry => {
                    const elapsedKeys = getDataKeys("elapsed_").filter(key => !key.includes("Min") && !key.includes("Max"));
                    const avg = elapsedKeys.reduce((sum, key) => sum + (entry[key] || 0), 0) / (elapsedKeys.length || 1);
                    const p90 = elapsedKeys.length ? entry[elapsedKeys[0]] : 0;
                    const p95 = elapsedKeys.length ? entry[elapsedKeys[0]] : 0;
                    return { time: entry.time, avg, p90, p95 };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
                    <XAxis dataKey="time" stroke={themeStyles[theme].text} tick={{ fontSize: 12 }} />
                    <YAxis stroke={themeStyles[theme].text} tickFormatter={(value) => formatValueWithUnit(value, "time")} domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1)]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="avg" stroke={themeStyles[theme].lineStroke} fill={themeStyles[theme].areaFill} name="Média" />
                    <Line type="monotone" dataKey="p90" stroke={COLORS[4]} strokeWidth={1} dot={false} name="P90" />
                    <Line type="monotone" dataKey="p95" stroke={COLORS[5]} strokeWidth={1} dot={false} name="P95" />
                    <Legend wrapperStyle={{ paddingTop: "20px", fontSize: "14px" }} formatter={(value) => <span style={{ color: themeStyles[theme].text }}>{value}</span>} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <HeatmapChart
                data={timeSeriesData}
                dataKey={getDataKeys("elapsed_")[0] || ""}
                title="Response Time"
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px", marginBottom: "20px", boxShadow: "0px 2px 5px rgba(0,0,0,0.1)" }}>
                <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", textAlign: "center", marginBottom: "10px" }}>Latency (over time)</h3>
                <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "10px", flexWrap: "nowrap", overflowX: "auto" }}>
                  <span style={{ backgroundColor: "#76B7B2", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    Mínimo: {formatValueWithUnit(Math.min(...aggregateReport.map(item => item.min)), "time")}
                  </span>
                  <span style={{ backgroundColor: "#4E79A7", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    Média: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.averageLatency, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                  <span style={{ backgroundColor: "#E15759", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    Mediana: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.medianLatency, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                  <span style={{ backgroundColor: "#59A14F", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    P90: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.p90, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                  <span style={{ backgroundColor: "#EDC948", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    P95: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.p95, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                  <span style={{ backgroundColor: "#F28E2B", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    Máximo: {formatValueWithUnit(Math.max(...aggregateReport.map(item => item.max)), "time")}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={timeSeriesData.map(entry => {
                    const latencyKeys = getDataKeys("latency_");
                    const avg = latencyKeys.reduce((sum, key) => sum + (entry[key] || 0), 0) / (latencyKeys.length || 1);
                    const p90 = latencyKeys.length ? entry[latencyKeys[0]] : 0;
                    const p95 = latencyKeys.length ? entry[latencyKeys[0]] : 0;
                    return { time: entry.time, avg, p90, p95 };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
                    <XAxis dataKey="time" stroke={themeStyles[theme].text} tick={{ fontSize: 12 }} />
                    <YAxis stroke={themeStyles[theme].text} tickFormatter={(value) => formatValueWithUnit(value, "time")} domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1)]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="avg" stroke={themeStyles[theme].lineStroke} fill={themeStyles[theme].areaFill} name="Média" />
                    <Line type="monotone" dataKey="p90" stroke={COLORS[4]} strokeWidth={1} dot={false} name="P90" />
                    <Line type="monotone" dataKey="p95" stroke={COLORS[5]} strokeWidth={1} dot={false} name="P95" />
                    <Legend wrapperStyle={{ paddingTop: "20px", fontSize: "14px" }} formatter={(value) => <span style={{ color: themeStyles[theme].text }}>{value}</span>} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <HeatmapChart
                data={timeSeriesData}
                dataKey={getDataKeys("latency_")[0] || ""}
                title="Latency"
              />
            </div>
          </>
        )}

        {shouldShow("errors") && (
          <SimplifiedChart
            data={timeSeriesData}
            dataKeys={getDataKeys("errorsPerSecond_")}
            title="Errors per Second"
            chartType="area"
          />
        )}

        {shouldShow("aggregate") && (
          <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px", marginBottom: "20px" }}>
            <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", textAlign: "center", marginBottom: "15px" }}>Relatório Agregado - Tempos de Resposta</h3>
            <div style={{ overflowX: "auto" }}>
              <ResponsiveContainer width="100%" height={500}>
                <BarChart data={aggregateReport} layout="vertical" margin={{ top: 20, right: 30, left: 100, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
                  <XAxis type="number" stroke={themeStyles[theme].text} tickFormatter={(value) => formatValueWithUnit(value, "time")} />
                  <YAxis dataKey="label" type="category" stroke={themeStyles[theme].text} width={150} />
                  <Tooltip content={<CustomTooltip />} formatter={(value, name) => [typeof name === "string" && name.includes("ms") ? formatValueWithUnit(Number(value), "time") : value, name]} />
                  <Legend />
                  <Bar dataKey="average" fill="#4E79A7" name="Média (ms)" />
                  <Bar dataKey="median" fill="#F28E2B" name="Mediana (ms)" />
                  <Bar dataKey="p90" fill="#E15759" name="P90 (ms)" />
                  <Bar dataKey="p95" fill="#76B7B2" name="P95 (ms)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {(shouldShow("all") || shouldShow("success")) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "20px", marginTop: "20px" }}>
            <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px" }}>
              <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", textAlign: "center" }}>Sucesso vs. Erro (Quantidade)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[{ name: "Sucesso", value: successCount }, ...(errorCount > 0 ? [{ name: "Erro", value: errorCount }] : [])]}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={(entry) => `${entry.name}: ${entry.value}`}
                  >
                    <Cell fill={themeStyles[theme].success} />
                    {errorCount > 0 && <Cell fill={themeStyles[theme].error} />}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px" }}>
              <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", textAlign: "center" }}>Sucesso vs. Erro (Percentual)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Sucesso", value: parseFloat(((successCount / (successCount + errorCount)) * 100).toFixed(2)) },
                      ...(errorCount > 0 ? [{ name: "Erro", value: parseFloat(((errorCount / (successCount + errorCount)) * 100).toFixed(2)) }] : [])
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={(entry) => `${entry.name}: ${entry.value}%`}
                  >
                    <Cell fill={themeStyles[theme].success} />
                    {errorCount > 0 && <Cell fill={themeStyles[theme].error} />}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", maxWidth: "1400px", margin: "auto", backgroundColor: themeStyles[theme].bg, color: themeStyles[theme].text, minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <h1 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", margin: 0 }}>📊 Dashboard de Performance - JMeter</h1>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ marginRight: "10px", color: themeStyles[theme].text }}>{theme === "dark" ? "Escuro" : "Claro"}</span>
          <label style={{ position: "relative", display: "inline-block", width: "60px", height: "30px" }}>
            <input
              type="checkbox"
              checked={theme === "dark"}
              onChange={() => setTheme(theme === "dark" ? "light" : "dark")}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: "absolute",
              cursor: "pointer",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme === "dark" ? "#4E79A7" : "#1a5276",
              transition: ".4s",
              borderRadius: "34px"
            }}></span>
            <span style={{
              position: "absolute",
              content: '""',
              height: "22px",
              width: "22px",
              left: theme === "dark" ? "34px" : "4px",
              bottom: "4px",
              backgroundColor: "white",
              transition: ".4s",
              borderRadius: "50%"
            }}></span>
          </label>
        </div>
      </div>

      <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "20px", borderRadius: "8px", boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.1)", marginBottom: "20px" }}>
        <label style={{ display: "inline-block", padding: "10px 20px", backgroundColor: theme === "dark" ? "#4E79A7" : "#1a5276", color: "white", textAlign: "center", cursor: "pointer", borderRadius: "5px", fontSize: "16px", marginBottom: "20px" }}>
          📂 Escolher Arquivo JTL
          <input type="file" accept=".csv,.jtl" onChange={handleFileUpload} style={{ display: "none" }} />
        </label>

        {fileSizeWarning && (
          <div style={{ backgroundColor: theme === "dark" ? "#3c3c3c" : "#f0f0f0", padding: "10px", borderRadius: "5px", marginBottom: "15px", color: "#F28E2B" }}>
            ⚠️ {fileSizeWarning}
          </div>
        )}

        {startTime && endTime && (
          <div style={{ marginTop: "20px" }}>
            <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", borderBottom: `2px solid ${theme === "dark" ? "#4E79A7" : "#1a5276"}`, paddingBottom: "5px" }}>
              📅 Detalhes do Teste
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "15px", marginTop: "15px" }}>
              <div style={{ backgroundColor: themeStyles[theme].bg, padding: "15px", borderRadius: "5px" }}>
                <p><strong>Início:</strong> {startTime}</p>
              </div>
              <div style={{ backgroundColor: themeStyles[theme].bg, padding: "15px", borderRadius: "5px" }}>
                <p><strong>Fim:</strong> {endTime}</p>
              </div>
              <div style={{ backgroundColor: themeStyles[theme].bg, padding: "15px", borderRadius: "5px" }}>
                <p><strong>Duração Total:</strong> {formatDuration(new Date(endTime).getTime() - new Date(startTime).getTime())}</p>
              </div>
              <div style={{ backgroundColor: themeStyles[theme].bg, padding: "15px", borderRadius: "5px" }}>
                <p><strong>Status:</strong> <span><span style={{ color: themeStyles[theme].success }}>{successCount} sucesso(s)</span>, <span style={{ color: themeStyles[theme].error }}>{errorCount} erro(s)</span></span></p>
              </div>
            </div>
          </div>
        )}

        {errorDetails.length > 0 && (
          <div style={{ marginTop: "20px" }}>
            <h3 style={{ color: "#E15759", borderBottom: "2px solid #E15759", paddingBottom: "5px" }}>
              🚨 Detalhes de Erros
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "10px", marginTop: "10px" }}>
              {errorDetails.map((error, index) => (
                <div key={index} style={{ backgroundColor: themeStyles[theme].bg, padding: "10px", borderRadius: "5px" }}>
                  <strong>{error.code}: {error.message}</strong> - {error.count} ocorrência(s)
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ margin: "20px 0", textAlign: "center", padding: "10px", backgroundColor: themeStyles[theme].cardBg, borderRadius: "8px" }}>
        <label style={{ marginRight: "10px", color: themeStyles[theme].text, fontWeight: "bold" }}>
          Filtrar Gráficos:
        </label>
        <select
          value={chartFilter}
          onChange={(e) => setChartFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: "5px",
            border: `1px solid ${themeStyles[theme].border}`,
            backgroundColor: themeStyles[theme].cardBg,
            color: themeStyles[theme].text,
            cursor: "pointer"
          }}
        >
          <option value="all">Todos os Gráficos</option>
          <option value="ramp-up">Ramp-up</option>
          <option value="throughput">Throughput</option>
          <option value="response-times">Tempos de Resposta</option>
          <option value="errors">Erros</option>
          <option value="aggregate">Relatório Agregado</option>
          <option value="success">Sucesso vs. Erro</option>
        </select>
      </div>

      {renderCharts()}
    </div>
  );
}