"use client";

import { useState } from "react";
import { parse } from "papaparse";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  BarChart,
  Bar,
  AreaChart,
  Area,
  Cell,
} from "recharts";

const COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#ffbb28",
  "#00c49f",
  "#ff4444",
  "#d0ed57",
  "#a4de6c",
  "#ce93d8",
];

export default function Home() {
  const [data, setData] = useState<any[]>([]);
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [rampUpUsers, setRampUpUsers] = useState<number>(0);
  const [rampUpDuration, setRampUpDuration] = useState<string>("");
  const [successCount, setSuccessCount] = useState<number>(0);
  const [errorCount, setErrorCount] = useState<number>(0);
  const [aggregateReport, setAggregateReport] = useState<any[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
  const [timeFilter, setTimeFilter] = useState<string>("all");
  const [errorDetails, setErrorDetails] = useState<any[]>([]);
  const [tickInterval, setTickInterval] = useState<number>(1);
  const [responseTimeStats, setResponseTimeStats] = useState<any>({});
  const [latencyStats, setLatencyStats] = useState<any>({});

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
  };

  const formatValueWithUnit = (value: number, type: string = "time") => {
    if (type === "time") {
      if (value >= 60000) {
        const minutes = (value / 60000).toFixed(2);
        return `${minutes} mins`;
      } else if (value >= 1000) {
        const seconds = (value / 1000).toFixed(2);
        return `${seconds} s`;
      } else {
        return `${value.toFixed(2)} ms`;
      }
    } else {
      return value.toFixed(2); // Para bytes ou outras métricas
    }
  };

  const calculateRampUp = (csvData: any[]) => {
    const sortedData = csvData
      .map((row) => ({
        timeStamp: Number(row.timeStamp),
        allThreads: Number(row.allThreads) || 0,
        label: row.label || null,
      }))
      .sort((a, b) => a.timeStamp - b.timeStamp);

    let rampStart = 0;
    let rampEnd = 0;
    let maxUsers = 0;

    for (let i = 0; i < sortedData.length; i++) {
      if (sortedData[i].allThreads === 1 && rampStart === 0) {
        rampStart = sortedData[i].timeStamp;
      }
      if (sortedData[i].allThreads > maxUsers) {
        maxUsers = sortedData[i].allThreads;
        rampEnd = sortedData[i].timeStamp;
      }
    }

    if (rampStart > 0 && rampEnd > 0) {
      const durationMs = rampEnd - rampStart;
      setRampUpUsers(maxUsers);
      setRampUpDuration(formatDuration(durationMs));
      return { users: maxUsers, duration: durationMs };
    }
    return { users: 0, duration: 0 };
  };

  const calculatePercentiles = (times: number[]) => {
    if (times.length === 0) return { p90: 0, p95: 0 };
    times.sort((a, b) => a - b);
    const p90 = times[Math.floor(times.length * 0.9) - 1] || 0;
    const p95 = times[Math.floor(times.length * 0.95) - 1] || 0;
    return { p90, p95 };
  };

  const calculateAggregateReport = (csvData: any[]) => {
    const grouped = csvData.reduce((acc, row) => {
      const label = row.label || null;
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
        };
      }
      acc[label].count += 1;
      acc[label].totalElapsed += Number(row.elapsed) || 0;
      acc[label].totalLatency += Number(row.Latency) || 0;
      acc[label].totalBytes += Number(row.bytes) || 0;
      acc[label].totalSentBytes += Number(row.sentBytes) || 0;
      acc[label].min = Math.min(acc[label].min, Number(row.elapsed) || Infinity);
      acc[label].max = Math.max(acc[label].max, Number(row.elapsed) || -Infinity);
      if (row.success === "false") acc[label].errors += 1;
      return acc;
    }, {});

    const report = Object.values(grouped)
      .map((item: any) => {
        const average = item.totalElapsed / item.count || 0;
        const averageLatency = item.totalLatency / item.count || 0;
        const errorRate = (item.errors / item.count) * 100 || 0;
        const responseTimes = csvData
          .filter((r) => r.label === item.label)
          .map((r) => Number(r.elapsed))
          .filter(Boolean)
          .sort((a, b) => a - b);
        const latencyTimes = csvData
          .filter((r) => r.label === item.label)
          .map((r) => Number(r.Latency))
          .filter(Boolean)
          .sort((a, b) => a - b);
        const median = responseTimes[Math.floor(responseTimes.length / 2)] || 0;
        const medianLatency =
          latencyTimes[Math.floor(latencyTimes.length / 2)] || 0;
        const { p90, p95 } = calculatePercentiles(responseTimes);
        const throughput =
          item.count /
            ((csvData[csvData.length - 1].timeStamp - csvData[0].timeStamp) /
              1000) || 0;
        return {
          label: item.label,
          average: Number(average.toFixed(2)),
          median: Number(median.toFixed(2)),
          p90: Number(p90.toFixed(2)),
          p95: Number(p95.toFixed(2)),
          min: Number(item.min.toFixed(2)),
          max: Number(item.max.toFixed(2)),
          errorRate: Number(errorRate.toFixed(2)),
          throughput: Number(throughput.toFixed(2)),
          count: item.count,
          averageLatency: Number(averageLatency.toFixed(2)),
          medianLatency: Number(medianLatency.toFixed(2)),
          bytes: Number((item.totalBytes / item.count).toFixed(2)),
          sentBytes: Number((item.totalSentBytes / item.count).toFixed(2)),
        };
      })
      .filter((item) => item.label !== null);

    setAggregateReport(report);
  };

  const calculateTimeSeries = (csvData: any[], filterMs: number = Infinity) => {
    const timeSeries: any = {};
    const intervalMs = 1000; // Intervalo de 1 segundo
    const now = Date.now();
    const minTime = csvData.reduce(
      (min, row) => Math.min(min, Number(row.timeStamp) || Infinity),
      Infinity
    );
    const maxTime = csvData.reduce(
      (max, row) => Math.max(max, Number(row.timeStamp) || -Infinity),
      -Infinity
    );
    const totalDurationMinutes = (maxTime - minTime) / (1000 * 60);
    const intervalMinutes = totalDurationMinutes < 10 ? 1 : 10;
    setTickInterval(intervalMinutes);
    const filterStart = filterMs === Infinity ? minTime : now - filterMs * 60 * 1000;
    const labels = Array.from(new Set(csvData.map((row) => row.label || null))).filter(
      (label) => label !== null
    );

    // Inicializa timeSeries com valores padrão
    csvData.forEach((row) => {
      const timestamp = Math.floor(Number(row.timeStamp) / intervalMs) * intervalMs;
      if (timestamp < filterStart || isNaN(timestamp)) return;

      if (!timeSeries[timestamp]) {
        timeSeries[timestamp] = {
          time: timestamp,
          requestsPerSecond: {},
          errorsPerSecond: {},
          activeThreads: {},
          bytes: {},
          sentBytes: {},
          elapsed: {},
          elapsedMin: {},
          elapsedMax: {},
          elapsedP90: {},
          elapsedP95: {},
          latency: {},
          checksPerSecond: {},
          counts: {},
          errorDetails: {},
        };
        labels.forEach((label) => {
          timeSeries[timestamp].requestsPerSecond[label] = 0;
          timeSeries[timestamp].errorsPerSecond[label] = 0;
          timeSeries[timestamp].activeThreads[label] = 0;
          timeSeries[timestamp].bytes[label] = 0;
          timeSeries[timestamp].sentBytes[label] = 0;
          timeSeries[timestamp].elapsed[label] = [];
          timeSeries[timestamp].elapsedMin[label] = Infinity;
          timeSeries[timestamp].elapsedMax[label] = -Infinity;
          timeSeries[timestamp].elapsedP90[label] = 0;
          timeSeries[timestamp].elapsedP95[label] = 0;
          timeSeries[timestamp].latency[label] = [];
          timeSeries[timestamp].checksPerSecond[label] = 0;
          timeSeries[timestamp].counts[label] = 0;
        });
      }

      const label = row.label || null;
      if (label) {
        timeSeries[timestamp].requestsPerSecond[label] += 1;
        if (row.success === "false") {
          timeSeries[timestamp].errorsPerSecond[label] += 1;
          const errorMessage = row.responseMessage || "Erro não especificado";
          timeSeries[timestamp].errorDetails[errorMessage] =
            (timeSeries[timestamp].errorDetails[errorMessage] || 0) + 1;
        }
        timeSeries[timestamp].activeThreads[label] = Math.max(
          timeSeries[timestamp].activeThreads[label],
          Number(row.allThreads) || 0
        );
        timeSeries[timestamp].bytes[label] += Number(row.bytes) || 0;
        timeSeries[timestamp].sentBytes[label] += Number(row.sentBytes) || 0;
        timeSeries[timestamp].elapsed[label].push(Number(row.elapsed) || 0);
        timeSeries[timestamp].elapsedMin[label] = Math.min(
          timeSeries[timestamp].elapsedMin[label],
          Number(row.elapsed) || Infinity
        );
        timeSeries[timestamp].elapsedMax[label] = Math.max(
          timeSeries[timestamp].elapsedMax[label],
          Number(row.elapsed) || -Infinity
        );
        timeSeries[timestamp].latency[label].push(Number(row.Latency) || 0);
        if (row.success === "true")
          timeSeries[timestamp].checksPerSecond[label] += 1;
        timeSeries[timestamp].counts[label] += 1;
      }
    });

    const seriesData = Object.values(timeSeries)
      .map((item: any) => {
        const result: any = {
          time: new Date(item.time).toLocaleTimeString("pt-BR", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          originalTime: item.time,
          intervalMinutes,
        };
        labels.forEach((label) => {
          const count = item.counts[label] || 1;
          const elapsedValues = item.elapsed[label] || [];
          const latencyValues = item.latency[label] || [];
          const { p90: elapsedP90, p95: elapsedP95 } = calculatePercentiles(elapsedValues);
          result[`requestsPerSecond_${label}`] = item.requestsPerSecond[label] || 0;
          result[`errorsPerSecond_${label}`] = item.errorsPerSecond[label] || 0;
          result[`activeThreads_${label}`] = item.activeThreads[label] || 0;
          result[`bytes_${label}`] = (item.bytes[label] / count || 0).toFixed(2);
          result[`sentBytes_${label}`] = (item.sentBytes[label] / count || 0).toFixed(2);
          result[`elapsed_${label}`] =
            elapsedValues.length > 0
              ? (elapsedValues.reduce((a: number, b: number) => a + b, 0) / elapsedValues.length).toFixed(2)
              : 0;
          result[`elapsedMin_${label}`] =
            item.elapsedMin[label] === Infinity ? 0 : item.elapsedMin[label].toFixed(2);
          result[`elapsedMax_${label}`] =
            item.elapsedMax[label] === -Infinity ? 0 : item.elapsedMax[label].toFixed(2);
          result[`elapsedP90_${label}`] = elapsedP90.toFixed(2);
          result[`elapsedP95_${label}`] = elapsedP95.toFixed(2);
          result[`latency_${label}`] =
            latencyValues.length > 0
              ? (latencyValues.reduce((a: number, b: number) => a + b, 0) / latencyValues.length).toFixed(2)
              : 0;
          result[`checksPerSecond_${label}`] = item.checksPerSecond[label] || 0;
        });
        return result;
      })
      .sort((a: any, b: any) => a.originalTime - b.originalTime)
      .filter((item: any) => {
        return Object.keys(item).some(
          (key) =>
            (key.startsWith("requestsPerSecond_") ||
             key.startsWith("activeThreads_") ||
             key.startsWith("errorsPerSecond_")) &&
            item[key] > 0
        );
      });

    setTimeSeriesData(seriesData);

    // Calcular estatísticas agregadas para Response Time e Latency
    const responseStats: any = {};
    const latencyStats: any = {};
    labels.forEach((label) => {
      const elapsedValues = seriesData
        .flatMap((item) => item[`elapsed_${label}`])
        .filter((v: number) => v > 0);
      const latencyValues = seriesData
        .flatMap((item) => item[`latency_${label}`])
        .filter((v: number) => v > 0);
      const elapsedPercentiles = calculatePercentiles(elapsedValues);
      const latencyPercentiles = calculatePercentiles(latencyValues);
      responseStats[label] = {
        mean:
          elapsedValues.length > 0
            ? (elapsedValues.reduce((a: number, b: number) => a + b, 0) / elapsedValues.length).toFixed(2)
            : 0,
        min: Math.min(...elapsedValues, Infinity).toFixed(2),
        max: Math.max(...elapsedValues, -Infinity).toFixed(2),
        p90: elapsedPercentiles.p90.toFixed(2),
        p95: elapsedPercentiles.p95.toFixed(2),
      };
      latencyStats[label] = {
        mean:
          latencyValues.length > 0
            ? (latencyValues.reduce((a: number, b: number) => a + b, 0) / latencyValues.length).toFixed(2)
            : 0,
        min: Math.min(...latencyValues, Infinity).toFixed(2),
        max: Math.max(...latencyValues, -Infinity).toFixed(2),
        p90: latencyPercentiles.p90.toFixed(2),
        p95: latencyPercentiles.p95.toFixed(2),
      };
    });
    setResponseTimeStats(responseStats);
    setLatencyStats(latencyStats);

    const allErrorDetails = Object.values(timeSeries).reduce(
      (acc: any, item: any) => {
        Object.entries(item.errorDetails || {}).forEach(
          ([message, count]: [string, any]) => {
            acc[message] = (acc[message] || 0) + count;
          }
        );
        return acc;
      },
      {}
    );
    setErrorDetails(
      Object.entries(allErrorDetails as { [key: string]: number }).map(([message, count]) => ({
        message,
        count,
      }))
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = timeSeriesData.find((d) => d.time === label);
      return (
        <div
          style={{
            padding: "5px",
            backgroundColor: "#2c2c2c",
            color: "#fff",
            border: "1px solid #444",
          }}
        >
          <p style={{ margin: "0" }}>
            Horário:{" "}
            {dataPoint
              ? new Date(dataPoint.originalTime).toLocaleTimeString("pt-BR", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "N/A"}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ margin: "0" }}>
              {entry.name}:{" "}
              {entry.name.includes("elapsed") || entry.name.includes("latency")
                ? formatValueWithUnit(Number(entry.value), "time")
                : entry.name.includes("bytes") || entry.name.includes("sentBytes")
                ? `${entry.value} bytes`
                : entry.value}{" "}
              {entry.unit || ""}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const AggregateTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = aggregateReport.find((d) => d.label === label);
      return (
        <div
          style={{
            padding: "5px",
            backgroundColor: "#2c2c2c",
            color: "#fff",
            border: "1px solid #444",
          }}
        >
          <p style={{ margin: "0" }}>Teste: {label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ margin: "0" }}>
              {entry.name}:{" "}
              {entry.name.includes("ms")
                ? formatValueWithUnit(Number(entry.value), "time")
                : entry.name.includes("bytes") || entry.name.includes("sentBytes")
                ? `${entry.value} bytes`
                : entry.value}{" "}
              {entry.name.includes("ms")
                ? ""
                : entry.name.includes("Erro")
                ? "%"
                : entry.name.includes("req/s")
                ? "req/s"
                : ""}
            </p>
          ))}
          {dataPoint && (
            <>
              <p style={{ margin: "0" }}>
                Median Latency: {formatValueWithUnit(dataPoint.medianLatency, "time")}
              </p>
              <p style={{ margin: "0" }}>
                Bytes Received: {dataPoint.bytes} bytes
              </p>
              <p style={{ margin: "0" }}>
                Bytes Sent: {dataPoint.sentBytes} bytes
              </p>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ({ target }) => {
      if (!target?.result) return;
      const csvData = parse(target.result as string, { header: true }).data;
      setData(csvData);

      const timestamps = csvData
        .map((row: any) => Number(row.timeStamp))
        .filter(Boolean);
      if (timestamps.length === 0) return;
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      setStartTime(formatDate(minTime));
      setEndTime(formatDate(maxTime));

      calculateRampUp(csvData);
      setSuccessCount(csvData.filter((d: any) => d.success === "true").length);
      setErrorCount(csvData.filter((d: any) => d.success === "false").length);
      calculateAggregateReport(csvData);
      calculateTimeSeries(
        csvData,
        timeFilter === "all" ? Infinity : parseInt(timeFilter.replace("min", ""))
      );
    };
    reader.readAsText(file);
  };

  const handleTimeFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTimeFilter(e.target.value);
    calculateTimeSeries(
      data,
      e.target.value === "all" ? Infinity : parseInt(e.target.value.replace("min", ""))
    );
  };

  const getStatsByLabel = (data: any[], metric: string) => {
    const stats: { [label: string]: { total: number; max: number; mean: number; count: number } } = {};
    const labels = Array.from(
      new Set(
        data
          .flatMap((item) =>
            Object.keys(item)
              .filter((key) => key.startsWith(metric))
              .map((key) => key.replace(`${metric}_`, ""))
          )
      )
    ).filter((label) => label !== null);

    labels.forEach((label) => {
      stats[label] = { total: 0, max: -Infinity, mean: 0, count: 0 };
    });

    data.forEach((item) => {
      labels.forEach((label) => {
        const value = item[`${metric}_${label}`] || 0;
        stats[label].total += Number(value);
        stats[label].max = Math.max(stats[label].max, Number(value));
        stats[label].count += value > 0 ? 1 : 0;
      });
    });

    return labels.map((label) => ({
      label,
      mean: stats[label].count > 0 ? Number((stats[label].total / stats[label].count).toFixed(2)) : 0,
      max: Number(stats[label].max.toFixed(2)),
      total: Number(stats[label].total.toFixed(2)),
    }));
  };

  const getCustomTicks = (data: any[], intervalMinutes: number) => {
    if (!data || data.length === 0) return [];
    const minTime = data[0].originalTime;
    const maxTime = data[data.length - 1].originalTime;
    const intervalMs = intervalMinutes * 60 * 1000;
    const ticks: string[] = [];
    let currentTime = minTime;

    while (currentTime <= maxTime) {
      const formattedTime = new Date(currentTime).toLocaleTimeString("pt-BR", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      ticks.push(formattedTime);
      currentTime += intervalMs;
    }

    return ticks;
  };

  return (
    <div
      style={{
        padding: "20px",
        fontFamily: "Arial, sans-serif",
        maxWidth: "1400px",
        margin: "auto",
        backgroundColor: "#1a1a1a",
        color: "#fff",
      }}
    >
      <h1 style={{ textAlign: "center", color: "#fff" }}>
        📊 Dashboard de Performance - JMeter
      </h1>
      <div
        style={{
          backgroundColor: "#2c2c2c",
          padding: "15px",
          borderRadius: "8px",
          boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
          marginBottom: "20px",
        }}
      >
        <label
          style={{
            display: "inline-block",
            padding: "10px 20px",
            backgroundColor: "#007bff",
            color: "white",
            textAlign: "center",
            cursor: "pointer",
            borderRadius: "5px",
            fontSize: "16px",
          }}
        >
          📂 Escolher Arquivo
          <input
            type="file"
            accept=".csv,.jtl"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
        </label>
        {startTime && endTime && (
          <div style={{ marginTop: "20px", textAlign: "left" }}>
            <h3
              style={{
                color: "#007bff",
                borderBottom: "2px solid #007bff",
                paddingBottom: "5px",
              }}
            >
              📅 Detalhes do Teste
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "20px",
              }}
            >
              <div
                style={{
                  backgroundColor: "#3c3c3c",
                  padding: "10px",
                  borderRadius: "5px",
                  boxShadow: "0px 2px 5px rgba(0, 0, 0, 0.2)",
                }}
              >
                <p>
                  <strong>Início:</strong> {startTime}
                </p>
              </div>
              <div
                style={{
                  backgroundColor: "#3c3c3c",
                  padding: "10px",
                  borderRadius: "5px",
                  boxShadow: "0px 2px 5px rgba(0, 0, 0, 0.2)",
                }}
              >
                <p>
                  <strong>Fim:</strong> {endTime}
                </p>
              </div>
              <div
                style={{
                  backgroundColor: "#3c3c3c",
                  padding: "10px",
                  borderRadius: "5px",
                  boxShadow: "0px 2px 5px rgba(0, 0, 0, 0.2)",
                }}
              >
                <p>
                  <strong>Ramp-Up:</strong>{" "}
                  {rampUpUsers > 0
                    ? `${rampUpUsers} usuários em ${rampUpDuration}`
                    : "Não identificado"}
                </p>
              </div>
              <div
                style={{
                  backgroundColor: "#3c3c3c",
                  padding: "10px",
                  borderRadius: "5px",
                  boxShadow: "0px 2px 5px rgba(0, 0, 0, 0.2)",
                }}
              >
                <p>
                  <strong>Duração Total:</strong>{" "}
                  {formatDuration(
                    endTime && startTime
                      ? new Date(endTime).getTime() - new Date(startTime).getTime()
                      : 0
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <label style={{ color: "#fff", marginRight: "10px" }}>
            Filtrar por Tempo:
          </label>
          <select
            value={timeFilter}
            onChange={handleTimeFilterChange}
            style={{ padding: "5px", borderRadius: "5px" }}
          >
            <option value="all">Todo o Período</option>
            <option value="5min">Últimos 5 Minutos</option>
            <option value="15min">Últimos 15 Minutos</option>
            <option value="30min">Últimos 30 Minutos</option>
            <option value="1h">Última Hora</option>
          </select>
        </div>
        {errorDetails.length > 0 && (
          <div style={{ marginTop: "20px", textAlign: "left" }}>
            <h3
              style={{
                color: "#f44336",
                borderBottom: "2px solid #f44336",
                paddingBottom: "5px",
              }}
            >
              🚨 Detalhes de Erros
            </h3>
            <ul style={{ listStyle: "none", padding: "0" }}>
              {errorDetails.map((error, index) => (
                <li key={index} style={{ marginBottom: "5px" }}>
                  <strong>{error.message}</strong>: {error.count} ocorrência(s)
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {timeSeriesData.length > 0 && (
        <>
          {/* Caixas de Métricas Agregadas */}
          {Object.keys(responseTimeStats).length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "10px",
                marginBottom: "20px",
              }}
            >
              {Object.entries(responseTimeStats).map(([label, stats]: [string, any]) => (
                <div key={label}>
                  <h4 style={{ color: "#fff", textAlign: "center" }}>{label} - Response Time</h4>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, 1fr)",
                      gap: "5px",
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: "#3c3c3c",
                        padding: "10px",
                        borderRadius: "5px",
                        textAlign: "center",
                      }}
                    >
                      <strong>Média</strong>
                      <br />
                      {formatValueWithUnit(Number(stats.mean), "time")}
                    </div>
                    <div
                      style={{
                        backgroundColor: "#3c3c3c",
                        padding: "10px",
                        borderRadius: "5px",
                        textAlign: "center",
                      }}
                    >
                      <strong>Máximo</strong>
                      <br />
                      {formatValueWithUnit(Number(stats.max), "time")}
                    </div>
                    <div
                      style={{
                        backgroundColor: "#3c3c3c",
                        padding: "10px",
                        borderRadius: "5px",
                        textAlign: "center",
                      }}
                    >
                      <strong>Mínimo</strong>
                      <br />
                      {formatValueWithUnit(Number(stats.min), "time")}
                    </div>
                    <div
                      style={{
                        backgroundColor: "#3c3c3c",
                        padding: "10px",
                        borderRadius: "5px",
                        textAlign: "center",
                      }}
                    >
                      <strong>P90</strong>
                      <br />
                      {formatValueWithUnit(Number(stats.p90), "time")}
                    </div>
                    <div
                      style={{
                        backgroundColor: "#3c3c3c",
                        padding: "10px",
                        borderRadius: "5px",
                        textAlign: "center",
                      }}
                    >
                      <strong>P95</strong>
                      <br />
                      {formatValueWithUnit(Number(stats.p95), "time")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "20px",
            }}
          >
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>Virtual Users</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="time"
                    type="category"
                    stroke="#fff"
                    tick={{ fontSize: 12, fill: "#fff" }}
                    ticks={getCustomTicks(timeSeriesData, tickInterval)}
                    tickFormatter={(value) => value}
                  />
                  <YAxis stroke="#fff" />
                  <Tooltip content={<CustomTooltip />} />
                  {Object.keys(timeSeriesData[0] || {})
                    .filter((key) => key.startsWith("activeThreads_"))
                    .map((key, index) => (
                      <Area
                        key={key.replace("activeThreads_", "")}
                        type="monotone"
                        dataKey={key}
                        stackId="1"
                        stroke={COLORS[index % COLORS.length]}
                        fill={COLORS[index % COLORS.length]}
                        name={key.replace("activeThreads_", "")}
                      />
                    ))}
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#fff",
                  fontSize: "12px",
                  marginTop: "5px",
                  padding: "0 10px",
                }}
              >
                <span>Active VUs</span>
                <span>
                  {(() => {
                    const values = timeSeriesData
                      .flatMap((d) =>
                        Object.values(d)
                          .filter(
                            (v, i) =>
                              typeof v === "number" &&
                              Object.keys(d)[i].startsWith("activeThreads_")
                          )
                          .map((v) => Number(v))
                      )
                      .filter((v) => v !== undefined && v !== null && !isNaN(v));
                    return `Max: ${
                      values.length > 0 ? Math.max(...values).toFixed(2) : 0
                    } | Min: ${
                      values.length > 0 ? Math.min(...values).toFixed(2) : 0
                    }`;
                  })()}
                </span>
              </div>
            </div>
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>
                Requests per Second
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="time"
                    type="category"
                    stroke="#fff"
                    tick={{ fontSize: 12, fill: "#fff" }}
                    ticks={getCustomTicks(timeSeriesData, tickInterval)}
                    tickFormatter={(value) => value}
                  />
                  <YAxis stroke="#fff" />
                  <Tooltip content={<CustomTooltip />} />
                  {Object.keys(timeSeriesData[0] || {})
                    .filter((key) => key.startsWith("requestsPerSecond_"))
                    .map((key, index) => (
                      <Bar
                        key={key.replace("requestsPerSecond_", "")}
                        dataKey={key}
                        stackId="1"
                        fill={COLORS[index % COLORS.length]}
                        name={key.replace("requestsPerSecond_", "")}
                      />
                    ))}
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
              {getStatsByLabel(timeSeriesData, "requestsPerSecond").map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "#fff",
                    fontSize: "12px",
                    marginTop: "5px",
                    padding: "0 10px",
                  }}
                >
                  <span
                    style={{
                      color: COLORS[
                        getStatsByLabel(timeSeriesData, "requestsPerSecond").findIndex(
                          (s) => s.label === stat.label
                        ) % COLORS.length
                      ],
                    }}
                  >
                    {stat.label}
                  </span>
                  <span>
                    Mean: {stat.mean} | Max: {stat.max}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>
                Errors per Second
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="time"
                    type="category"
                    stroke="#fff"
                    tick={{ fontSize: 12, fill: "#fff" }}
                    ticks={getCustomTicks(timeSeriesData, tickInterval)}
                    tickFormatter={(value) => value}
                  />
                  <YAxis stroke="#fff" />
                  <Tooltip content={<CustomTooltip />} />
                  {Object.keys(timeSeriesData[0] || {})
                    .filter((key) => key.startsWith("errorsPerSecond_"))
                    .map((key, index) => (
                      <Bar
                        key={key.replace("errorsPerSecond_", "")}
                        dataKey={key}
                        stackId="1"
                        fill={COLORS[index % COLORS.length]}
                        name={key.replace("errorsPerSecond_", "")}
                      />
                    ))}
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
              {getStatsByLabel(timeSeriesData, "errorsPerSecond").map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "#fff",
                    fontSize: "12px",
                    marginTop: "5px",
                    padding: "0 10px",
                  }}
                >
                  <span
                    style={{
                      color: COLORS[
                        getStatsByLabel(timeSeriesData, "errorsPerSecond").findIndex(
                          (s) => s.label === stat.label
                        ) % COLORS.length
                      ],
                    }}
                  >
                    {stat.label}
                  </span>
                  <span>
                    Mean: {stat.mean} | Total: {stat.total}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>
                Checks per Second
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="time"
                    type="category"
                    stroke="#fff"
                    tick={{ fontSize: 12, fill: "#fff" }}
                    ticks={getCustomTicks(timeSeriesData, tickInterval)}
                    tickFormatter={(value) => value}
                  />
                  <YAxis stroke="#fff" />
                  <Tooltip content={<CustomTooltip />} />
                  {Object.keys(timeSeriesData[0] || {})
                    .filter((key) => key.startsWith("checksPerSecond_"))
                    .map((key, index) => (
                      <Bar
                        key={key.replace("checksPerSecond_", "")}
                        dataKey={key}
                        stackId="1"
                        fill={COLORS[index % COLORS.length]}
                        name={key.replace("checksPerSecond_", "")}
                      />
                    ))}
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
              {getStatsByLabel(timeSeriesData, "checksPerSecond").map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "#fff",
                    fontSize: "12px",
                    marginTop: "5px",
                    padding: "0 10px",
                  }}
                >
                  <span
                    style={{
                      color: COLORS[
                        getStatsByLabel(timeSeriesData, "checksPerSecond").findIndex(
                          (s) => s.label === stat.label
                        ) % COLORS.length
                      ],
                    }}
                  >
                    {stat.label}
                  </span>
                  <span>
                    Mean: {stat.mean} | Total: {stat.total}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "20px",
              marginTop: "20px",
            }}
          >
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>
                Waiting Time (over time)
              </h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="time"
                    type="category"
                    stroke="#fff"
                    tick={{ fontSize: 12, fill: "#fff" }}
                    ticks={getCustomTicks(timeSeriesData, tickInterval)}
                    tickFormatter={(value) => value}
                  />
                  <YAxis stroke="#fff" tickFormatter={(value) => formatValueWithUnit(value, "time")} />
                  <Tooltip content={<CustomTooltip />} />
                  {Object.keys(timeSeriesData[0] || {})
                    .filter((key) => key.startsWith("latency_"))
                    .map((key, index) => (
                      <Line
                        key={key.replace("latency_", "")}
                        type="monotone"
                        dataKey={key}
                        stroke={COLORS[index % COLORS.length]}
                        name={key.replace("latency_", "")}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    ))}
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
              {getStatsByLabel(timeSeriesData, "latency").map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "#fff",
                    fontSize: "12px",
                    marginTop: "5px",
                    padding: "0 10px",
                  }}
                >
                  <span
                    style={{
                      color: COLORS[
                        getStatsByLabel(timeSeriesData, "latency").findIndex(
                          (s) => s.label === stat.label
                        ) % COLORS.length
                      ],
                    }}
                  >
                    {stat.label}
                  </span>
                  <span>
                    Mean: {formatValueWithUnit(stat.mean, "time")} | Max: {formatValueWithUnit(stat.max, "time")}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>
                Response Time (over time)
              </h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="time"
                    type="category"
                    stroke="#fff"
                    tick={{ fontSize: 12, fill: "#fff" }}
                    ticks={getCustomTicks(timeSeriesData, tickInterval)}
                    tickFormatter={(value) => value}
                  />
                  <YAxis stroke="#fff" tickFormatter={(value) => formatValueWithUnit(value, "time")} />
                  <Tooltip content={<CustomTooltip />} />
                  {Object.keys(timeSeriesData[0] || {})
                    .filter((key) => key.startsWith("elapsed_") && !key.includes("Min") && !key.includes("Max") && !key.includes("P90") && !key.includes("P95"))
                    .map((key, index) => (
                      <Line
                        key={key.replace("elapsed_", "")}
                        type="monotone"
                        dataKey={key}
                        stroke={COLORS[index % COLORS.length]}
                        name={key.replace("elapsed_", "")}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    ))}
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
              {getStatsByLabel(timeSeriesData, "elapsed").map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "#fff",
                    fontSize: "12px",
                    marginTop: "5px",
                    padding: "0 10px",
                  }}
                >
                  <span
                    style={{
                      color: COLORS[
                        getStatsByLabel(timeSeriesData, "elapsed").findIndex(
                          (s) => s.label === stat.label
                        ) % COLORS.length
                      ],
                    }}
                  >
                    {stat.label}
                  </span>
                  <span>
                    Mean: {formatValueWithUnit(stat.mean, "time")} | Max: {formatValueWithUnit(stat.max, "time")}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>
                Response Time Percentiles (over time)
              </h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="time"
                    type="category"
                    stroke="#fff"
                    tick={{ fontSize: 12, fill: "#fff" }}
                    ticks={getCustomTicks(timeSeriesData, tickInterval)}
                    tickFormatter={(value) => value}
                  />
                  <YAxis stroke="#fff" tickFormatter={(value) => formatValueWithUnit(value, "time")} />
                  <Tooltip content={<CustomTooltip />} />
                  {Object.keys(timeSeriesData[0] || {})
                    .filter((key) => key.startsWith("elapsed_"))
                    .map((key) => key.replace("elapsed_", "").replace(/(Min|Max|P90|P95)/, ""))
                    .filter((value, index, self) => self.indexOf(value) === index)
                    .map((label, index) => (
                      <>
                        <Line
                          key={`elapsed_${label}`}
                          type="monotone"
                          dataKey={`elapsed_${label}`}
                          stroke="#8884d8"
                          name={`${label} (Média)`}
                          strokeWidth={2}
                          dot={{ r: 4 }}
                        />
                        <Line
                          key={`elapsedMin_${label}`}
                          type="monotone"
                          dataKey={`elapsedMin_${label}`}
                          stroke="#ff4444"
                          name={`${label} (Mín)`}
                          strokeWidth={1}
                          dot={false}
                        />
                        <Line
                          key={`elapsedMax_${label}`}
                          type="monotone"
                          dataKey={`elapsedMax_${label}`}
                          stroke="#00c49f"
                          name={`${label} (Máx)`}
                          strokeWidth={1}
                          dot={false}
                        />
                        <Line
                          key={`elapsedP90_${label}`}
                          type="monotone"
                          dataKey={`elapsedP90_${label}`}
                          stroke="#ffbb28"
                          name={`${label} (P90)`}
                          strokeWidth={1}
                          dot={false}
                        />
                        <Line
                          key={`elapsedP95_${label}`}
                          type="monotone"
                          dataKey={`elapsedP95_${label}`}
                          stroke="#ffc658"
                          name={`${label} (P95)`}
                          strokeWidth={1}
                          dot={false}
                        />
                      </>
                    ))}
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>
                Bytes Received (over time)
              </h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="time"
                    type="category"
                    stroke="#fff"
                    tick={{ fontSize: 12, fill: "#fff" }}
                    ticks={getCustomTicks(timeSeriesData, tickInterval)}
                    tickFormatter={(value) => value}
                  />
                  <YAxis stroke="#fff" />
                  <Tooltip content={<CustomTooltip />} />
                  {Object.keys(timeSeriesData[0] || {})
                    .filter((key) => key.startsWith("bytes_"))
                    .map((key, index) => (
                      <Line
                        key={key.replace("bytes_", "")}
                        type="monotone"
                        dataKey={key}
                        stroke={COLORS[index % COLORS.length]}
                        name={key.replace("bytes_", "")}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    ))}
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "20px",
              marginTop: "20px",
            }}
          >
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>
                Sucesso vs. Erro (Quantidade)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    dataKey="value"
                    data={[
                      { name: "Sucesso", value: successCount },
                      { name: "Erro", value: errorCount },
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    fill="#4caf50"
                  >
                    <Cell fill="#4caf50" />
                    <Cell fill="#f44336" />
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>
                Sucesso vs. Erro (Percentual)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    dataKey="value"
                    data={[
                      {
                        name: "Sucesso",
                        value:
                          parseFloat(
                            ((successCount / (successCount + errorCount)) * 100).toFixed(
                              2
                            )
                          ) || 0,
                      },
                      {
                        name: "Erro",
                        value:
                          parseFloat(
                            ((errorCount / (successCount + errorCount)) * 100).toFixed(2)
                          ) || 0,
                      },
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.name}: ${entry.value}%`}
                    fill="#4caf50"
                  >
                    <Cell fill="#4caf50" />
                    <Cell fill="#f44336" />
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(1, 1fr)",
              gap: "20px",
              marginTop: "20px",
            }}
          >
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>
                Relatório Agregado (Aggregate Report)
              </h3>
              <ResponsiveContainer width="100%" height={500}>
                <BarChart data={aggregateReport}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="label"
                    stroke="#fff"
                    tick={{ fontSize: 12, fill: "#fff", dx: 10 }}
                    interval={0}
                    height={120}
                  />
                  <YAxis stroke="#fff" />
                  <Tooltip content={<AggregateTooltip />} />
                  <Legend />
                  <Bar dataKey="average" fill="#8884d8" name="Média (ms)" />
                  <Bar dataKey="median" fill="#ff7300" name="Mediana (ms)" />
                  <Bar dataKey="p90" fill="#00c49f" name="P90 (ms)" />
                  <Bar dataKey="p95" fill="#ffbb28" name="P95 (ms)" />
                  <Bar dataKey="min" fill="#82ca9d" name="Mínimo (ms)" />
                  <Bar dataKey="max" fill="#ffc658" name="Máximo (ms)" />
                  <Bar dataKey="errorRate" fill="#f44336" name="% Erro" />
                  <Bar dataKey="throughput" fill="#4caf50" name="Throughput (req/s)" />
                  <Bar dataKey="count" fill="#ff7300" name="Contagem (req)" />
                  <Bar
                    dataKey="averageLatency"
                    fill="#00c49f"
                    name="Latência Média (ms)"
                  />
                  <Bar
                    dataKey="bytes"
                    fill="#4caf50"
                    name="Bytes Recebidos (média)"
                  />
                  <Bar dataKey="sentBytes" fill="#ff7300" name="Bytes Enviados (média)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(1, 1fr)",
              gap: "20px",
              marginTop: "20px",
            }}
          >
            <div
              style={{
                backgroundColor: "#2c2c2c",
                padding: "10px",
                borderRadius: "8px",
                boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.3)",
              }}
            >
              <h3 style={{ color: "#fff", textAlign: "center" }}>
                Response Time Distribution
              </h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={Object.entries(
                    aggregateReport.reduce((acc: { [key: number]: number }, curr) => {
                      const range = Math.floor(curr.average / 100) * 100;
                      acc[range] = (acc[range] || 0) + curr.count;
                      return acc;
                    }, {})
                  )
                    .map(([range, count]) => ({ range: Number(range), count }))
                    .filter((item) => item.count > 0)}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis
                    dataKey="range"
                    stroke="#fff"
                    tickFormatter={(value) => `${value} ms`}
                  />
                  <YAxis stroke="#fff" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="#8884d8" name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}