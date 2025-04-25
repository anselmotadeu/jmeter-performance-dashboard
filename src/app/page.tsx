"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
  PieChart, Pie, BarChart, Bar, AreaChart, Area, Cell, ComposedChart, Scatter,
  ScatterChart, ZAxis
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
  const [theme, setTheme] = useState<"dark" | "light">("light");
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

  const calculateMedian = (values: number[]): number => {
    if (!values.length) return 0;
    const sortedValues = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sortedValues.length / 2);
    return sortedValues.length % 2 === 0 
      ? (sortedValues[middle - 1] + sortedValues[middle]) / 2 
      : sortedValues[middle];
  };

  const parseCustomDate = (dateString: string): Date => {
    const [datePart, timePart] = dateString.split(", ");
    const [day, month, year] = datePart.split("/").map(Number);
    const [hours, minutes, seconds] = timePart.split(":").map(Number);
    const isoDateString = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const parsedDate = new Date(isoDateString);
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Formato de data inválido: ${dateString}`);
    }
    return parsedDate;
  };

  const formatProcessingTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const themeStyles = {
    dark: {
      bg: "#121212",
      text: "#ffffff",
      cardBg: "#1e1e1e",
      border: "#444",
      gridStroke: "#333",
      success: "#59A14F",
      error: "#E15759",
      areaFill: "rgba(89, 161, 79, 0.3)",
      lineStroke: "#59A14F",
      heatmap: ["#003087", "#21908d", "#5bc862", "#f7e11e", "#ff7e00", "#d62728"]
    },
    light: {
      bg: "#ffffff",
      text: "#333333",
      cardBg: "#f9f9f9",
      border: "#e0e0e0",
      gridStroke: "#eeeeee",
      success: "#388E3C",
      error: "#D32F2F",
      areaFill: "rgba(56, 142, 60, 0.2)",
      lineStroke: "#388E3C",
      heatmap: ["#f7fbff", "#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#08519c", "#08306b"]
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
        const requestKeys = Object.keys(entry).filter(key => key.startsWith("requestsPerSecond_"));
        const checkKeys = Object.keys(entry).filter(key => key.startsWith("checksPerSecond_"));
        const errorKeys = Object.keys(entry).filter(key => key.startsWith("errorsPerSecond_"));
        const elapsedKeys = Object.keys(entry).filter(key => key.startsWith("elapsed_"));
        const latencyKeys = Object.keys(entry).filter(key => key.startsWith("latency_"));

        let time = entry.time;
        if (!time && entry.timeStamp && !isNaN(Number(entry.timeStamp))) {
          try {
            const date = new Date(Number(entry.timeStamp));
            if (!isNaN(date.getTime())) {
              time = date.toISOString().substring(11, 19);
            }
          } catch (e) {
            console.error("Erro ao converter timeStamp:", entry.timeStamp, e);
            time = "00:00:00";
          }
        }

        const testData: any = { time, timeStamp: Number(entry.timeStamp) };
        activeThreadsKeys.forEach(key => {
          testData[key] = Number(entry[key]) || 0;
        });
        requestKeys.forEach(key => {
          testData[key] = Number(entry[key]) || 0;
        });
        checkKeys.forEach(key => {
          testData[key] = Number(entry[key]) || 0;
        });
        errorKeys.forEach(key => {
          testData[key] = Number(entry[key]) || 0;
        });
        elapsedKeys.forEach(key => {
          testData[key] = Number(entry[key]) || 0;
        });
        latencyKeys.forEach(key => {
          testData[key] = Number(entry[key]) || 0;
        });

        testData.totalActiveThreads = activeThreadsKeys.reduce((sum, key) => sum + (Number(entry[key]) || 0), 0);
        testData.totalRequestsPerSecond = requestKeys.reduce((sum, key) => sum + (Number(entry[key]) || 0), 0);
        testData.totalChecksPerSecond = checkKeys.reduce((sum, key) => sum + (Number(entry[key]) || 0), 0);
        testData.totalErrorsPerSecond = errorKeys.reduce((sum, key) => sum + (Number(entry[key]) || 0), 0);

        return testData;
      });

      const activeThreadsKeys = Object.keys(result.timeSeriesData[0] || {}).filter(key => key.startsWith("activeThreads_"));
      const testGroups = new Set(activeThreadsKeys.map(key => {
        const parts = key.split('_');
        return parts.length > 1 ? parts[1] : 'Default';
      }));

      const maxPerTest = Array.from(testGroups).map(test => {
        const testKeys = activeThreadsKeys.filter(key => key.includes(`_${test}`));
        return Math.max(...updatedTimeSeriesData.map((entry: any) => 
          testKeys.reduce((sum, key) => sum + (Number(entry[key]) || 0), 0)
        ));
      });

      const totalUsers = Array.from(testGroups).reduce((sum, test) => {
        const testKeys = activeThreadsKeys.filter(key => key.includes(`_${test}`));
        const maxForTest = Math.max(...updatedTimeSeriesData.map((entry: any) => 
          testKeys.reduce((sum, key) => sum + (Number(entry[key]) || 0), 0)
        ));
        return sum + maxForTest;
      }, 0);

      setRampUpInfo({
        users: totalUsers,
        usersPerTest: Math.max(...maxPerTest, 0),
        duration: result.rampUpInfo.duration // Use backend-provided duration
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
      .flatMap(entry => dataKeys.map(key => Number(entry[key]) || 0))
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
  
    if (!data || data.length === 0 || !dataKeys || dataKeys.length === 0) {
      return (
        <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px", marginBottom: "20px", textAlign: "center" }}>
          <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276" }}>{title}</h3>
          <p>Nenhum dado disponível para exibir o gráfico.</p>
        </div>
      );
    }
  
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
            <span style={{ backgroundColor: "#F28E2B", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
              Máximo: {formatValueWithUnit(stats.max ?? 0, "time")}
            </span>
            <span style={{ backgroundColor: "#59A14F", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
              P90: {formatValueWithUnit(stats.p90 ?? 0, "time")}
            </span>
            <span style={{ backgroundColor: "#EDC948", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
              P95: {formatValueWithUnit(stats.p95 ?? 0, "time")}
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
              dataKeys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={`Teste ${key.split('_')[1] || 'Desconhecido'}`}
                />
              ))
            ) : (
              dataKeys.map((key, index) => (
                <DataComponent
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[index % COLORS.length]}
                  fill={COLORS[index % COLORS.length]}
                  fillOpacity={chartType === "area" ? 0.1 : 0.6} // Ajustado para maior transparência em gráficos de área
                  strokeWidth={2}
                  activeDot={{ r: 6 }}
                  name={`Teste ${key.split('_')[1] || 'Desconhecido'}`}
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
    const generateHeatmapData = () => {
      if (!data.length) return [];
      
      const timeStep = 60000;
      const valueStep = 100;
      
      const bins: { [key: string]: { value: number; count: number } } = {};
      
      data.forEach(entry => {
        const value = Number(entry[dataKey]);
        if (isNaN(value)) return;
        
        let timestamp;
        if (entry.timeStamp) {
          timestamp = new Date(Number(entry.timeStamp)).getTime();
        } else if (entry.time) {
          const [hours, minutes, seconds] = entry.time.split(':').map(Number);
          const date = new Date();
          date.setHours(hours, minutes, seconds, 0);
          timestamp = date.getTime();
        } else {
          return;
        }
        
        const timeBin = Math.floor(timestamp / timeStep) * timeStep;
        const valueBin = Math.floor(value / valueStep) * valueStep;
        const key = `${timeBin}_${valueBin}`;
        
        if (!bins[key]) {
          bins[key] = { value: valueBin, count: 0 };
        }
        bins[key].count += 1;
      });
      
      return Object.entries(bins).map(([key, bin]) => {
        const timeBin = Number(key.split('_')[0]);
        return {
          time: new Date(timeBin).toLocaleTimeString(),
          value: bin.value,
          count: bin.count,
          formattedValue: formatValueWithUnit(bin.value, "time")
        };
      });
    };
  
    const heatmapData = generateHeatmapData();
    const maxCount = Math.max(...heatmapData.map(d => d.count), 1);
    
    if (!heatmapData.length) {
      return (
        <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px", marginBottom: "20px", textAlign: "center" }}>
          <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276" }}>{title} (Heatmap)</h3>
          <p>Nenhum dado disponível para exibir o heatmap.</p>
        </div>
      );
    }
  
    return (
      <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px", marginBottom: "20px" }}>
        <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", textAlign: "center" }}>{title} (Heatmap)</h3>
        <div style={{ display: "flex", justifyContent: "space-around", margin: "10px 0" }}>
          <span style={{ backgroundColor: "#76B7B2", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
            Mínimo: {formatValueWithUnit(Math.min(...heatmapData.map(d => d.value)), "time")}
          </span>
          <span style={{ backgroundColor: "#4E79A7", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
            Máximo: {formatValueWithUnit(Math.max(...heatmapData.map(d => d.value)), "time")}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart
            data={heatmapData}
            margin={{ top: 20, right: 20, bottom: 30, left: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
            <XAxis 
              dataKey="time" 
              name="Tempo" 
              stroke={themeStyles[theme].text}
              tickFormatter={(value) => value.split(':').slice(0, 2).join(':')}
            />
            <YAxis 
              dataKey="value" 
              name="Duração" 
              stroke={themeStyles[theme].text}
              tickFormatter={(value) => formatValueWithUnit(value, "time")}
            />
            <ZAxis dataKey="count" range={[0, 500]} name="Ocorrências" />
            <Tooltip 
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const data = payload[0].payload;
                return (
                  <div style={{
                    background: themeStyles[theme].cardBg,
                    padding: "10px",
                    border: `1px solid ${themeStyles[theme].border}`,
                    borderRadius: "5px"
                  }}>
                    <p style={{ margin: 0, fontWeight: "bold" }}>Horário: {data.time}</p>
                    <p style={{ margin: "5px 0 0 0" }}>Duração: {data.formattedValue}</p>
                    <p style={{ margin: "5px 0 0 0" }}>Ocorrências: {data.count}</p>
                  </div>
                );
              }}
            />
            <Scatter
              name="Heatmap"
              data={heatmapData}
              fill="#8884d8"
              shape="square"
            >
              {heatmapData.map((entry, index) => {
                const intensity = Math.min(entry.count / maxCount, 1);
                const colorIndex = Math.floor(intensity * (themeStyles[theme].heatmap.length - 1));
                return (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={themeStyles[theme].heatmap[colorIndex]} 
                    width={20}
                    height={20}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", justifyContent: "center", marginTop: "10px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ marginRight: "10px" }}>Intensidade:</span>
            <div style={{ display: "flex" }}>
              {themeStyles[theme].heatmap.map((color, i) => (
                <div 
                  key={i} 
                  style={{
                    width: "20px", 
                    height: "20px", 
                    backgroundColor: color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    color: i > themeStyles[theme].heatmap.length / 2 ? "white" : "black"
                  }}
                >
                  {i === 0 ? "0" : i === themeStyles[theme].heatmap.length - 1 ? maxCount : ""}
                </div>
              ))}
            </div>
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

    if (!startTime || !endTime) {
      return (
        <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "20px", borderRadius: "8px", textAlign: "center", color: themeStyles[theme].text }}>
          {errorMessage || "Nenhum dado carregado. Faça upload de um arquivo JTL."}
        </div>
      );
    }

    const shouldShow = (type: string) => chartFilter === "all" || chartFilter === type;
    const getDataKeys = (prefix: string) => {
      const keys = Object.keys(timeSeriesData[0] || {}).filter(key => key.startsWith(prefix));
      return keys;
    };

    const requestsKeys = getDataKeys("requestsPerSecond_");
    const checksKeys = getDataKeys("checksPerSecond_");
    const errorsKeys = getDataKeys("errorsPerSecond_");
    const elapsedKeys = getDataKeys("elapsed_");
    const latencyKeys = getDataKeys("latency_");

    return (
      <>
        {shouldShow("ramp-up") && (
          <div style={{ backgroundColor: themeStyles[theme].cardBg, padding: "15px", borderRadius: "8px", marginBottom: "20px" }}>
            <h3 style={{ color: theme === "dark" ? "#4E79A7" : "#1a5276", textAlign: "center", marginBottom: "15px" }}>Ramp-up</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "20px" }}>
              <div style={{ backgroundColor: themeStyles[theme].bg, padding: "15px", borderRadius: "5px", textAlign: "center" }}>
                <p style={{ fontSize: "18px", margin: "0" }}>
                  <strong title="Soma de todos os usuários em todos os testes simultâneos">Usuários Máximos (Total):</strong> {rampUpInfo.users}
                </p>
              </div>
              <div style={{ backgroundColor: themeStyles[theme].bg, padding: "15px", borderRadius: "5px", textAlign: "center" }}>
                <p style={{ fontSize: "18px", margin: "0" }}>
                  <strong title="Máximo de usuários em um único teste durante a execução">Usuários Máximos (Por Teste):</strong> {rampUpInfo.usersPerTest}
                </p>
              </div>
              <div style={{ backgroundColor: themeStyles[theme].bg, padding: "15px", borderRadius: "5px", textAlign: "center" }}>
                <p style={{ fontSize: "18px", margin: "0" }}>
                  <strong>Duração do Ramp-up:</strong> {rampUpInfo.duration}
                </p>
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
              dataKeys={requestsKeys}
              title="Requests per Second"
              chartType="area"
            />
            <SimplifiedChart
              data={timeSeriesData}
              dataKeys={checksKeys}
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
                  <span style={{ backgroundColor: "#F28E2B", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    Máximo: {formatValueWithUnit(Math.max(...aggregateReport.map(item => item.max)), "time")}
                  </span>
                  <span style={{ backgroundColor: "#59A14F", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    P90: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.p90, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                  <span style={{ backgroundColor: "#EDC948", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    P95: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.p95, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                  </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
                    <XAxis dataKey="time" stroke={themeStyles[theme].text} tick={{ fontSize: 12 }} />
                    <YAxis stroke={themeStyles[theme].text} tickFormatter={(value) => formatValueWithUnit(value, "time")} domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1)]} />
                    <Tooltip content={<CustomTooltip />} />
                    {elapsedKeys.map((key, index) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        name={`Teste ${key.split('_')[1] || 'Desconhecido'}`}
                      />
                    ))}
                    <Legend wrapperStyle={{ paddingTop: "20px", fontSize: "14px" }} formatter={(value) => <span style={{ color: themeStyles[theme].text }}>{value}</span>} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <HeatmapChart
                data={timeSeriesData}
                dataKey={elapsedKeys[0] || ""}
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
                  <span style={{ backgroundColor: "#F28E2B", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    Máximo: {formatValueWithUnit(Math.max(...aggregateReport.map(item => item.max)), "time")}
                  </span>
                  <span style={{ backgroundColor: "#59A14F", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    P90: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.p90, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                  <span style={{ backgroundColor: "#EDC948", color: "white", padding: "5px 10px", borderRadius: "5px" }}>
                    P95: {formatValueWithUnit(aggregateReport.reduce((sum, item) => sum + item.p95, 0) / (aggregateReport.length || 1), "time")}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
                    <XAxis dataKey="time" stroke={themeStyles[theme].text} tick={{ fontSize: 12 }} />
                    <YAxis stroke={themeStyles[theme].text} tickFormatter={(value) => formatValueWithUnit(value, "time")} domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1)]} />
                    <Tooltip content={<CustomTooltip />} />
                    {latencyKeys.map((key, index) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        name={`Teste ${key.split('_')[1] || 'Desconhecido'}`}
                      />
                    ))}
                    <Legend wrapperStyle={{ paddingTop: "20px", fontSize: "14px" }} formatter={(value) => <span style={{ color: themeStyles[theme].text }}>{value}</span>} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <HeatmapChart
                data={timeSeriesData}
                dataKey={latencyKeys[0] || ""}
                title="Latency"
              />
            </div>
          </>
        )}

        {shouldShow("errors") && (
          <SimplifiedChart
            data={timeSeriesData}
            dataKeys={errorsKeys}
            title="Errors per Second"
            chartType="area"
            summary={{
              avg: errorCount / (timeSeriesData.length || 1),
              max: Math.max(...timeSeriesData.map(e => e.totalErrorsPerSecond || 0)),
              min: Math.min(...timeSeriesData.map(e => e.totalErrorsPerSecond > 0 ? e.totalErrorsPerSecond : Infinity)),
              median: calculateMedian(timeSeriesData.map(e => e.totalErrorsPerSecond || 0))
            }}
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
          <input type="file" accept=".csv,.jtl" onChange={handleFileUpload} multiple style={{ display: "none" }} />
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
                <p><strong>Duração Total:</strong> {formatDuration(parseCustomDate(endTime).getTime() - parseCustomDate(startTime).getTime())}</p>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px", marginTop: "10px", maxHeight: "200px", overflowY: "auto" }}>
              {errorDetails.map((error, index) => (
                <div key={index} style={{
                  backgroundColor: themeStyles[theme].bg,
                  padding: "15px",
                  borderRadius: "5px",
                  borderLeft: `4px solid ${themeStyles[theme].error}`
                }}>
                  <div style={{ marginBottom: "5px" }}>
                    <strong style={{ color: themeStyles[theme].error }}>Código:</strong> {error.code}
                  </div>
                  <div style={{ marginBottom: "5px" }}>
                    <strong style={{ color: themeStyles[theme].error }}>Mensagem:</strong> {error.message}
                  </div>
                  <div>
                    <strong style={{ color: themeStyles[theme].error }}>Ocorrências:</strong> {error.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
    </div>
  );
}