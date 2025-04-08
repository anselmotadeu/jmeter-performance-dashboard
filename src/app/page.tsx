"use client";

import { useState } from "react";
import { parse } from "papaparse";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
  PieChart, Pie, BarChart, Bar, AreaChart, Area, Cell
} from "recharts";

const COLORS = [
  "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
  "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC"
];

type TestData = {
  timeStamp: number;
  label: string;
  elapsed: number;
  success: string;
  allThreads: number;
  Latency: number;
  bytes: number;
  sentBytes: number;
  responseCode?: string;
  responseMessage?: string;
};

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

const HTTP_ERROR_CODES: Record<string, string> = {
  "400": "Bad Request",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "Not Found",
  "429": "Too Many Requests",
  "500": "Internal Server Error",
  "502": "Bad Gateway",
  "503": "Service Unavailable",
  "504": "Gateway Timeout"
};

export default function PerformanceDashboard() {
  const [data, setData] = useState<TestData[]>([]);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [chartFilter, setChartFilter] = useState<string>("all");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [rampUpInfo, setRampUpInfo] = useState<{ users: number; usersPerTest: number; duration: string }>({ users: 0, usersPerTest: 0, duration: "0s" });
  const [successCount, setSuccessCount] = useState<number>(0);
  const [errorCount, setErrorCount] = useState<number>(0);
  const [aggregateReport, setAggregateReport] = useState<AggregateReportItem[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
  const [errorDetails, setErrorDetails] = useState<{code: string; message: string; count: number}[]>([]);

  const themeStyles = {
    dark: {
      bg: "#1a1a1a",
      text: "#fff",
      cardBg: "#2c2c2c",
      border: "#444",
      gridStroke: "#444",
      success: "#59A14F",
      error: "#E15759"
    },
    light: {
      bg: "#f5f5f5",
      text: "#333",
      cardBg: "#fff",
      border: "#ddd",
      gridStroke: "#eee",
      success: "#388E3C",
      error: "#D32F2F"
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

  const calculateRampUp = (csvData: TestData[]) => {
    const sortedData = csvData
      .filter(row => row.allThreads > 0)
      .sort((a, b) => a.timeStamp - b.timeStamp);
  
    if (sortedData.length === 0) return { users: 0, usersPerTest: 0, duration: "0s" };
  
    const rampStart = sortedData[0].timeStamp;
    let maxUsers = 0; // Total de usuários simultâneos
    let maxUsersPerTest = 0; // Máximo por teste
    let rampEnd = rampStart;
  
    // Calcular o máximo por teste (label)
    const threadsByLabel: { [key: string]: number } = {};
    sortedData.forEach(row => {
      const label = row.label || "Unknown";
      const currentThreads = Number(row.allThreads) || 0;
      threadsByLabel[label] = Math.max(threadsByLabel[label] || 0, currentThreads);
    });
    maxUsersPerTest = Math.max(...Object.values(threadsByLabel));
  
    // Calcular o total de usuários simultâneos por timestamp
    const threadsByTimestamp: { [key: number]: { [key: string]: number } } = {};
    sortedData.forEach(row => {
      const timestamp = row.timeStamp;
      const label = row.label || "Unknown";
      const currentThreads = Number(row.allThreads) || 0;
  
      if (!threadsByTimestamp[timestamp]) {
        threadsByTimestamp[timestamp] = {};
      }
      // Armazenar o número de threads para cada label no timestamp
      threadsByTimestamp[timestamp][label] = Math.max(
        threadsByTimestamp[timestamp][label] || 0,
        currentThreads
      );
    });
  
    // Encontrar o número máximo de usuários simultâneos
    Object.entries(threadsByTimestamp).forEach(([timestamp, threadsByLabel]) => {
      // Somar as threads de todos os labels naquele timestamp
      const totalThreadsAtTimestamp = Object.values(threadsByLabel).reduce(
        (sum, threads) => sum + threads,
        0
      );
      if (totalThreadsAtTimestamp > maxUsers) {
        maxUsers = totalThreadsAtTimestamp;
        rampEnd = Number(timestamp);
      }
    });
  
    const durationMs = rampEnd - rampStart;
    const rampUpResult = {
      users: maxUsers, // Total geral (deve ser 60)
      usersPerTest: maxUsersPerTest, // Máximo por teste (30)
      duration: formatDuration(durationMs)
    };
    setRampUpInfo(rampUpResult);
    return rampUpResult;
  };

  const calculatePercentiles = (times: number[]) => {
    if (!times || times.length === 0) return { p90: 0, p95: 0 };
    const sortedTimes = [...times].sort((a, b) => a - b);
    const p90 = sortedTimes[Math.floor(sortedTimes.length * 0.9)] || 0;
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
    return { p90, p95 };
  };

  const calculateAggregateReport = (csvData: TestData[]) => {
    const grouped = csvData.reduce((acc: any, row) => {
      const label = row.label || "Unknown";
      if (!acc[label]) {
        acc[label] = {
          label,
          count: 0,
          totalElapsed: 0,
          min: Infinity,
          max: -Infinity,
          errors: 0,
          totalLatency: 0,
          totalBytes: 0,
          totalSentBytes: 0,
          responseTimes: [],
          latencyTimes: []
        };
      }
      const elapsed = Number(row.elapsed) || 0;
      const latency = Number(row.Latency) || 0;
      
      acc[label].count += 1;
      acc[label].totalElapsed += elapsed;
      acc[label].totalLatency += latency;
      acc[label].totalBytes += Number(row.bytes) || 0;
      acc[label].totalSentBytes += Number(row.sentBytes) || 0;
      acc[label].min = Math.min(acc[label].min, elapsed);
      acc[label].max = Math.max(acc[label].max, elapsed);
      if (row.success === "false") acc[label].errors += 1;
      acc[label].responseTimes.push(elapsed);
      acc[label].latencyTimes.push(latency);
      return acc;
    }, {});

    const minTimestamp = Math.min(...csvData.map(row => Number(row.timeStamp)));
    const maxTimestamp = Math.max(...csvData.map(row => Number(row.timeStamp)));
    const durationSeconds = (maxTimestamp - minTimestamp) / 1000;

    const report = Object.values(grouped).map((item: any) => {
      item.responseTimes.sort((a: number, b: number) => a - b);
      item.latencyTimes.sort((a: number, b: number) => a - b);
      
      const average = item.totalElapsed / item.count;
      const averageLatency = item.totalLatency / item.count;
      const median = item.responseTimes[Math.floor(item.responseTimes.length / 2)] || 0;
      const medianLatency = item.latencyTimes[Math.floor(item.latencyTimes.length / 2)] || 0;
      const { p90, p95 } = calculatePercentiles(item.responseTimes);
      const throughput = item.count / (durationSeconds || 1);
      
      return {
        label: item.label,
        average: Number(average.toFixed(2)),
        median: Number(median.toFixed(2)),
        p90: Number(p90.toFixed(2)),
        p95: Number(p95.toFixed(2)),
        min: Number(item.min.toFixed(2)),
        max: Number(item.max.toFixed(2)),
        errorRate: Number(((item.errors / item.count) * 100).toFixed(2)),
        throughput: Number(throughput.toFixed(2)),
        count: item.count,
        averageLatency: Number(averageLatency.toFixed(2)),
        medianLatency: Number(medianLatency.toFixed(2)),
        bytes: Number((item.totalBytes / item.count).toFixed(2)),
        sentBytes: Number((item.totalSentBytes / item.count).toFixed(2))
      };
    });

    setAggregateReport(report);
  };

  const calculateTimeSeries = (csvData: TestData[]) => {
    const timeSeries: any = {};
    const intervalMs = 1000;
    const labels = Array.from(new Set(csvData.map(row => row.label || "Unknown")));

    csvData.forEach(row => {
      const timestamp = Math.floor(Number(row.timeStamp) / intervalMs) * intervalMs;
      if (!timeSeries[timestamp]) {
        timeSeries[timestamp] = { time: timestamp };
        labels.forEach(label => {
          timeSeries[timestamp][`requestsPerSecond_${label}`] = 0;
          timeSeries[timestamp][`errorsPerSecond_${label}`] = 0;
          timeSeries[timestamp][`activeThreads_${label}`] = 0;
          timeSeries[timestamp][`bytes_${label}`] = 0;
          timeSeries[timestamp][`sentBytes_${label}`] = 0;
          timeSeries[timestamp][`elapsed_${label}`] = 0;
          timeSeries[timestamp][`latency_${label}`] = 0;
          timeSeries[timestamp][`checksPerSecond_${label}`] = 0;
          timeSeries[timestamp][`errorDetails_${label}`] = {};
        });
      }

      const label = row.label || "Unknown";
      timeSeries[timestamp][`requestsPerSecond_${label}`] += 1;
      if (row.success === "false") {
        timeSeries[timestamp][`errorsPerSecond_${label}`] += 1;
        const errorCode = row.responseCode || "000";
        const errorMessage = row.responseMessage || HTTP_ERROR_CODES[errorCode] || "Erro não especificado";
        timeSeries[timestamp][`errorDetails_${label}`][`${errorCode}: ${errorMessage}`] = 
          (timeSeries[timestamp][`errorDetails_${label}`][`${errorCode}: ${errorMessage}`] || 0) + 1;
      }
      timeSeries[timestamp][`activeThreads_${label}`] = Math.max(
        timeSeries[timestamp][`activeThreads_${label}`],
        Number(row.allThreads) || 0
      );
      timeSeries[timestamp][`bytes_${label}`] += Number(row.bytes) || 0;
      timeSeries[timestamp][`sentBytes_${label}`] += Number(row.sentBytes) || 0;
      timeSeries[timestamp][`elapsed_${label}`] = Number(row.elapsed) || 0;
      timeSeries[timestamp][`latency_${label}`] = Number(row.Latency) || 0;
      if (row.success === "true") timeSeries[timestamp][`checksPerSecond_${label}`] += 1;
    });

    const seriesData = Object.values(timeSeries)
      .map((item: any) => ({
        ...item,
        time: new Date(item.time).toLocaleTimeString("pt-BR", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }),
        originalTime: item.time
      }))
      .sort((a: any, b: any) => a.originalTime - b.originalTime);

    setTimeSeriesData(seriesData);

    const allErrorDetails: Record<string, number> = Object.values(timeSeries).reduce((acc: Record<string, number>, item: any) => {
      labels.forEach(label => {
        Object.entries(item[`errorDetails_${label}`] || {}).forEach(([message, count]: [string, any]) => {
          acc[message] = (acc[message] || 0) + count;
        });
      });
      return acc;
    }, {});

    setErrorDetails(
      Object.entries(allErrorDetails).map(([message, count]: [string, number]) => {
        const [code, ...msgParts] = message.split(": ");
        return {
          code: code,
          message: msgParts.join(": "),
          count: count as number
        };
      }).sort((a, b) => b.count - a.count)
    );
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ({ target }) => {
      if (!target?.result) return;
      
      const csvData = parse(target.result as string, { header: true }).data as TestData[];
      setData(csvData);

      const validData = csvData.filter(row => row.timeStamp && !isNaN(Number(row.timeStamp)));
      if (validData.length === 0) return;
      
      const timestamps = validData.map(row => Number(row.timeStamp));
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      
      setStartTime(new Date(minTime).toLocaleString("pt-BR"));
      setEndTime(new Date(maxTime).toLocaleString("pt-BR"));

      calculateRampUp(validData);
      setSuccessCount(validData.filter(d => d.success === "true").length);
      setErrorCount(validData.filter(d => d.success === "false").length);
      calculateAggregateReport(validData);
      calculateTimeSeries(validData);
    };
    reader.readAsText(file);
  };

  const SimplifiedChart = ({ data, dataKeys, title, yAxisFormatter, chartType = "line" }: {
    data: any[];
    dataKeys: string[];
    title: string;
    yAxisFormatter?: (value: any) => string;
    chartType?: "line" | "bar";
  }) => {
    const ChartComponent = chartType === "line" ? LineChart : BarChart;
    const DataComponent = chartType === "line" ? Line : Bar;

    return (
      <div style={{
        backgroundColor: themeStyles[theme].cardBg,
        padding: "15px",
        borderRadius: "8px",
        marginBottom: "20px",
        boxShadow: "0px 2px 5px rgba(0,0,0,0.1)"
      }}>
        <h3 style={{
          color: theme === "dark" ? "#4E79A7" : "#1a5276",
          textAlign: "center",
          marginBottom: "15px"
        }}>{title}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ChartComponent data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
            <XAxis 
              dataKey="time" 
              stroke={themeStyles[theme].text}
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              stroke={themeStyles[theme].text}
              tickFormatter={yAxisFormatter || ((v) => v)}
            />
            <Tooltip content={<CustomTooltip />} />
            {dataKeys.map((key, index) => (
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
            ))}
            <Legend 
              wrapperStyle={{ paddingTop: "20px", fontSize: "14px" }}
              formatter={(value) => {
                const label = value === "Unknown" ? "Não identificado" : value;
                return <span style={{ color: themeStyles[theme].text }}>{label}</span>;
              }}
            />
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderCharts = () => {
    if (data.length === 0) return (
      <div style={{
        backgroundColor: themeStyles[theme].cardBg,
        padding: "20px",
        borderRadius: "8px",
        textAlign: "center",
        color: themeStyles[theme].text
      }}>
        Nenhum dado carregado. Faça upload de um arquivo JTL.
      </div>
    );

    const shouldShow = (type: string) => chartFilter === "all" || chartFilter === type;
    const getDataKeys = (prefix: string) => 
      Object.keys(timeSeriesData[0] || {}).filter(key => key.startsWith(prefix));

    return (
      <>
        {shouldShow("ramp-up") && (
  <div style={{
    backgroundColor: themeStyles[theme].cardBg,
    padding: "15px",
    borderRadius: "8px",
    marginBottom: "20px"
  }}>
    <h3 style={{
      color: theme === "dark" ? "#4E79A7" : "#1a5276",
      textAlign: "center",
      marginBottom: "15px"
    }}>Ramp-up</h3>
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)", // Ajustado para 3 colunas
      gap: "20px",
      marginBottom: "20px"
    }}>
      <div style={{
        backgroundColor: themeStyles[theme].bg,
        padding: "15px",
        borderRadius: "5px",
        textAlign: "center"
      }}>
        <p style={{ fontSize: "18px", margin: "0" }}>
          <strong>Usuários Máximos (Total):</strong> {rampUpInfo.users}
        </p>
      </div>
      <div style={{
        backgroundColor: themeStyles[theme].bg,
        padding: "15px",
        borderRadius: "5px",
        textAlign: "center"
      }}>
        <p style={{ fontSize: "18px", margin: "0" }}>
          <strong>Usuários Máximos (Por Teste):</strong> {rampUpInfo.usersPerTest}
        </p>
      </div>
      <div style={{
        backgroundColor: themeStyles[theme].bg,
        padding: "15px",
        borderRadius: "5px",
        textAlign: "center"
      }}>
        <p style={{ fontSize: "18px", margin: "0" }}>
          <strong>Duração do Ramp-up:</strong> {rampUpInfo.duration}
        </p>
      </div>
    </div>
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={timeSeriesData}>
        <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
        <XAxis 
          dataKey="time" 
          stroke={themeStyles[theme].text}
          tick={{ fontSize: 12 }}
        />
        <YAxis stroke={themeStyles[theme].text} />
        <Tooltip content={<CustomTooltip />} />
        {getDataKeys("activeThreads_").map((key, index) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stackId="1"
            stroke={COLORS[index % COLORS.length]}
            fill={COLORS[index % COLORS.length]}
            name={key.split('_')[1] === "Unknown" ? "Não identificado" : key.split('_')[1]}
          />
        ))}
        <Legend 
          wrapperStyle={{ paddingTop: "20px", fontSize: "14px" }}
          formatter={(value) => {
            const label = value === "Unknown" ? "Não identificado" : value;
            return <span style={{ color: themeStyles[theme].text }}>{label}</span>;
          }}
        />
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
              chartType="bar"
            />
            <SimplifiedChart
              data={timeSeriesData}
              dataKeys={getDataKeys("checksPerSecond_")}
              title="Checks per Second"
              chartType="bar"
            />
          </>
        )}

        {shouldShow("response-times") && (
          <>
            <SimplifiedChart
              data={timeSeriesData}
              dataKeys={getDataKeys("elapsed_").filter(key => !key.includes("Min") && !key.includes("Max"))}
              title="Response Time (over time)"
              yAxisFormatter={(value) => formatValueWithUnit(value, "time")}
            />
            <SimplifiedChart
              data={timeSeriesData}
              dataKeys={getDataKeys("latency_")}
              title="Latency (over time)"
              yAxisFormatter={(value) => formatValueWithUnit(value, "time")}
            />
          </>
        )}

        {shouldShow("errors") && (
          <SimplifiedChart
            data={timeSeriesData}
            dataKeys={getDataKeys("errorsPerSecond_")}
            title="Errors per Second"
            chartType="bar"
          />
        )}

        {shouldShow("aggregate") && (
          <div style={{
            backgroundColor: themeStyles[theme].cardBg,
            padding: "15px",
            borderRadius: "8px",
            marginBottom: "20px"
          }}>
            <h3 style={{
              color: theme === "dark" ? "#4E79A7" : "#1a5276",
              textAlign: "center",
              marginBottom: "15px"
            }}>Relatório Agregado - Tempos de Resposta</h3>
            <div style={{ overflowX: "auto" }}>
              <ResponsiveContainer width="100%" height={500}>
                <BarChart
                  data={aggregateReport}
                  layout="vertical"
                  margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={themeStyles[theme].gridStroke} />
                  <XAxis 
                    type="number" 
                    stroke={themeStyles[theme].text}
                    tickFormatter={(value) => formatValueWithUnit(value, "time")}
                  />
                  <YAxis 
                    dataKey="label" 
                    type="category" 
                    stroke={themeStyles[theme].text}
                    width={150}
                  />
                  <Tooltip 
                    content={<CustomTooltip />}
                    formatter={(value, name) => [
                      typeof name === "string" && name.includes("ms") ? formatValueWithUnit(Number(value), "time") : value,
                      name
                    ]}
                  />
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
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "20px",
            marginTop: "20px"
          }}>
            <div style={{
              backgroundColor: themeStyles[theme].cardBg,
              padding: "15px",
              borderRadius: "8px"
            }}>
              <h3 style={{
                color: theme === "dark" ? "#4E79A7" : "#1a5276",
                textAlign: "center"
              }}>Sucesso vs. Erro (Quantidade)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Sucesso", value: successCount },
                      { name: "Erro", value: errorCount }
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={(entry) => `${entry.name}: ${entry.value}`}
                  >
                    <Cell fill={themeStyles[theme].success} />
                    <Cell fill={themeStyles[theme].error} />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{
              backgroundColor: themeStyles[theme].cardBg,
              padding: "15px",
              borderRadius: "8px"
            }}>
              <h3 style={{
                color: theme === "dark" ? "#4E79A7" : "#1a5276",
                textAlign: "center"
              }}>Sucesso vs. Erro (Percentual)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { 
                        name: "Sucesso", 
                        value: parseFloat(((successCount / (successCount + errorCount)) * 100).toFixed(2)) 
                      },
                      { 
                        name: "Erro", 
                        value: parseFloat(((errorCount / (successCount + errorCount)) * 100).toFixed(2)) 
                      }
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={(entry) => `${entry.name}: ${entry.value}%`}
                  >
                    <Cell fill={themeStyles[theme].success} />
                    <Cell fill={themeStyles[theme].error} />
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
    <div style={{
      padding: "20px",
      fontFamily: "Arial, sans-serif",
      maxWidth: "1400px",
      margin: "auto",
      backgroundColor: themeStyles[theme].bg,
      color: themeStyles[theme].text,
      minHeight: "100vh"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "30px"
      }}>
        <h1 style={{ 
          color: theme === "dark" ? "#4E79A7" : "#1a5276",
          margin: 0
        }}>
          📊 Dashboard de Performance - JMeter
        </h1>
        
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ 
            marginRight: "10px",
            color: themeStyles[theme].text
          }}>
            {theme === "dark" ? "Escuro" : "Claro"}
          </span>
          <label style={{
            position: "relative",
            display: "inline-block",
            width: "60px",
            height: "30px"
          }}>
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

      <div style={{
        backgroundColor: themeStyles[theme].cardBg,
        padding: "20px",
        borderRadius: "8px",
        boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.1)",
        marginBottom: "20px"
      }}>
        <label style={{
          display: "inline-block",
          padding: "10px 20px",
          backgroundColor: theme === "dark" ? "#4E79A7" : "#1a5276",
          color: "white",
          textAlign: "center",
          cursor: "pointer",
          borderRadius: "5px",
          fontSize: "16px",
          marginBottom: "20px"
        }}>
          📂 Escolher Arquivo JTL
          <input
            type="file"
            accept=".csv,.jtl"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
        </label>

        {startTime && endTime && (
          <div style={{ marginTop: "20px" }}>
            <h3 style={{
              color: theme === "dark" ? "#4E79A7" : "#1a5276",
              borderBottom: `2px solid ${theme === "dark" ? "#4E79A7" : "#1a5276"}`,
              paddingBottom: "5px"
            }}>
              📅 Detalhes do Teste
            </h3>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "15px",
              marginTop: "15px"
            }}>
              <div style={{
                backgroundColor: themeStyles[theme].bg,
                padding: "15px",
                borderRadius: "5px"
              }}>
                <p><strong>Início:</strong> {startTime}</p>
              </div>
              <div style={{
                backgroundColor: themeStyles[theme].bg,
                padding: "15px",
                borderRadius: "5px"
              }}>
                <p><strong>Fim:</strong> {endTime}</p>
              </div>
              <div style={{
                backgroundColor: themeStyles[theme].bg,
                padding: "15px",
                borderRadius: "5px"
              }}>
                <p><strong>Duração Total:</strong> {formatDuration(
                  new Date(endTime).getTime() - new Date(startTime).getTime()
                )}</p>
              </div>
              <div style={{
                backgroundColor: themeStyles[theme].bg,
                padding: "15px",
                borderRadius: "5px"
              }}>
                <p>
                  <strong>Status:</strong>{" "}
                  <span>
                    <span style={{ color: themeStyles[theme].success }}>{successCount} sucesso(s)</span>,{" "}
                    <span style={{ color: themeStyles[theme].error }}>{errorCount} erro(s)</span>
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

        {errorDetails.length > 0 && (
          <div style={{ marginTop: "20px" }}>
            <h3 style={{
              color: "#E15759",
              borderBottom: "2px solid #E15759",
              paddingBottom: "5px"
            }}>
              🚨 Detalhes de Erros
            </h3>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "10px",
              marginTop: "10px"
            }}>
              {errorDetails.map((error, index) => (
                <div key={index} style={{
                  backgroundColor: themeStyles[theme].bg,
                  padding: "10px",
                  borderRadius: "5px"
                }}>
                  <strong>{error.code}: {error.message}</strong> - {error.count} ocorrência(s)
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{
        margin: "20px 0",
        textAlign: "center",
        padding: "10px",
        backgroundColor: themeStyles[theme].cardBg,
        borderRadius: "8px"
      }}>
        <label style={{
          marginRight: "10px",
          color: themeStyles[theme].text,
          fontWeight: "bold"
        }}>
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