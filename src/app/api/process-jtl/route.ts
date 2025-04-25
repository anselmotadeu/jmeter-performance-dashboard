import { NextRequest, NextResponse } from "next/server";
import { parse } from "papaparse";

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

const calculatePercentiles = (times: number[]) => {
  if (!times || times.length === 0) return { p90: 0, p95: 0 };
  const sortedTimes = [...times].sort((a, b) => a - b);
  const p90 = sortedTimes[Math.floor(sortedTimes.length * 0.9)] || 0;
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
  return { p90, p95 };
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    let successCount = 0;
    let errorCount = 0;
    let startTime = "";
    let endTime = "";
    let minTime = Infinity;
    let maxTime = -Infinity;

    const grouped: Record<string, any> = {};
    const timeSeries: Record<number, any> = {};
    const intervalMs = 1000;
    const labelsSet = new Set<string>();
    const threadsByLabel: Record<string, number> = {};
    const threadsByTimestamp: Record<number, Record<string, number>> = {};
    const allErrorDetails: Record<string, number> = {};

    await new Promise<void>(async (resolve, reject) => {
      const fileContent = await file.text();
      parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        step: (results: any, parser: any) => {
          const row = results.data as TestData;
          const timeStamp = Number(row.timeStamp);
          if (!timeStamp || isNaN(timeStamp)) return;

          const validRow: TestData = {
            timeStamp,
            label: row.label || "Unknown",
            elapsed: Number(row.elapsed) || 0,
            success: row.success,
            allThreads: Number(row.allThreads) || 0,
            Latency: Number(row.Latency) || 0,
            bytes: Number(row.bytes) || 0,
            sentBytes: Number(row.sentBytes) || 0,
            responseCode: row.responseCode,
            responseMessage: row.responseMessage,
          };

          minTime = Math.min(minTime, timeStamp);
          maxTime = Math.max(maxTime, timeStamp);

          if (validRow.success === "true") successCount++;
          else errorCount++;

          const label = validRow.label;
          if (!grouped[label]) {
            grouped[label] = {
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
              latencyTimes: [],
            };
          }
          const elapsed = validRow.elapsed;
          const latency = validRow.Latency;
          grouped[label].count += 1;
          grouped[label].totalElapsed += elapsed;
          grouped[label].totalLatency += latency;
          grouped[label].totalBytes += validRow.bytes;
          grouped[label].totalSentBytes += validRow.sentBytes;
          grouped[label].min = Math.min(grouped[label].min, elapsed);
          grouped[label].max = Math.max(grouped[label].max, elapsed);
          if (validRow.success === "false") grouped[label].errors += 1;
          grouped[label].responseTimes.push(elapsed);
          grouped[label].latencyTimes.push(latency);

          const timestamp = Math.floor(timeStamp / intervalMs) * intervalMs;
          labelsSet.add(label);
          if (!timeSeries[timestamp]) {
            timeSeries[timestamp] = { time: timestamp };
            labelsSet.forEach(l => {
              timeSeries[timestamp][`requestsPerSecond_${l}`] = 0;
              timeSeries[timestamp][`errorsPerSecond_${l}`] = 0;
              timeSeries[timestamp][`activeThreads_${l}`] = 0;
              timeSeries[timestamp][`bytes_${l}`] = 0;
              timeSeries[timestamp][`sentBytes_${l}`] = 0;
              timeSeries[timestamp][`elapsed_${l}`] = 0;
              timeSeries[timestamp][`latency_${l}`] = 0;
              timeSeries[timestamp][`checksPerSecond_${l}`] = 0;
              timeSeries[timestamp][`errorDetails_${l}`] = {};
            });
          }
          timeSeries[timestamp][`requestsPerSecond_${label}`] += 1;
          if (validRow.success === "false") {
            timeSeries[timestamp][`errorsPerSecond_${label}`] += 1;
            const errorCode = validRow.responseCode || "000";
            const errorMessage = validRow.responseMessage || HTTP_ERROR_CODES[errorCode] || "Erro não especificado";
            const errorKey = `${errorCode}: ${errorMessage}`;
            timeSeries[timestamp][`errorDetails_${label}`][errorKey] =
              (timeSeries[timestamp][`errorDetails_${label}`][errorKey] || 0) + 1;
            allErrorDetails[errorKey] = (allErrorDetails[errorKey] || 0) + 1;
          }
          timeSeries[timestamp][`activeThreads_${label}`] = Math.max(
            timeSeries[timestamp][`activeThreads_${label}`] || 0,
            validRow.allThreads
          );
          timeSeries[timestamp][`bytes_${label}`] += validRow.bytes;
          timeSeries[timestamp][`sentBytes_${label}`] += validRow.sentBytes;
          timeSeries[timestamp][`elapsed_${label}`] = validRow.elapsed;
          timeSeries[timestamp][`latency_${label}`] = validRow.Latency;
          if (validRow.success === "true") timeSeries[timestamp][`checksPerSecond_${label}`] += 1;

          if (validRow.allThreads > 0) {
            if (!threadsByTimestamp[timeStamp]) {
              threadsByTimestamp[timeStamp] = {};
            }
            threadsByTimestamp[timeStamp][label] = Math.max(
              threadsByTimestamp[timeStamp][label] || 0,
              validRow.allThreads
            );
            threadsByLabel[label] = Math.max(threadsByLabel[label] || 0, validRow.allThreads);
          }
        },
        complete: () => resolve(),
        error: (error: any) => reject(error),
      });
    });

    const durationSeconds = (maxTime - minTime) / 1000;
    const aggregateReport = Object.values(grouped).map((item: any) => {
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
        sentBytes: Number((item.totalSentBytes / item.count).toFixed(2)),
      };
    });

    const labels = Array.from(labelsSet);
    const seriesData = Object.values(timeSeries)
      .map((item: any) => {
        const entry: any = {
          time: new Date(item.time).toLocaleTimeString("pt-BR", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          originalTime: item.time,
        };
        labels.forEach(label => {
          entry[`requestsPerSecond_${label}`] = item[`requestsPerSecond_${label}`] || 0;
          entry[`errorsPerSecond_${label}`] = item[`errorsPerSecond_${label}`] || 0;
          entry[`activeThreads_${label}`] = item[`activeThreads_${label}`] || 0;
          entry[`bytes_${label}`] = item[`bytes_${label}`] || 0;
          entry[`sentBytes_${label}`] = item[`sentBytes_${label}`] || 0;
          entry[`elapsed_${label}`] = item[`elapsed_${label}`] || 0;
          entry[`latency_${label}`] = item[`latency_${label}`] || 0;
          entry[`checksPerSecond_${label}`] = item[`checksPerSecond_${label}`] || 0;
          entry[`errorDetails_${label}`] = item[`errorDetails_${label}`] || {};
        });
        return entry;
      })
      .sort((a: any, b: any) => a.originalTime - b.originalTime);

    const errorDetails = Object.entries(allErrorDetails).map(([message, count]: [string, number]) => {
      const [code, ...msgParts] = message.split(": ");
      return {
        code: code,
        message: msgParts.join(": "),
        count: count as number,
      };
    }).sort((a, b) => b.count - a.count);

    let maxUsers = 0;
let maxUsersPerTest = Math.max(...Object.values(threadsByLabel));
//let rampStart = null;
//let rampEnd = null;

const sortedTimestamps = Object.keys(threadsByTimestamp)
  .map(ts => Number(ts))
  .sort((a, b) => a - b);

// Primeiro, encontre o valor máximo de usuários
sortedTimestamps.forEach(timestamp => {
  const threadsByLabelAtTimestamp = threadsByTimestamp[timestamp];
  const totalThreadsAtTimestamp = Object.values(threadsByLabelAtTimestamp).reduce(
    (sum, threads) => sum + threads,
    0
  );
  if (totalThreadsAtTimestamp > maxUsers) {
    maxUsers = totalThreadsAtTimestamp;
  }
});

// Agora, encontre o início do ramp-up (primeiro usuário > 0)
let rampStart = null;
for (const timestamp of sortedTimestamps) {
  const threadsByLabelAtTimestamp = threadsByTimestamp[timestamp];
  const totalThreadsAtTimestamp = Object.values(threadsByLabelAtTimestamp).reduce(
    (sum, threads) => sum + threads,
    0
  );
  if (rampStart === null && totalThreadsAtTimestamp > 0) {
    rampStart = timestamp;
    break;
  }
}

// Agora, encontre o momento em que atinge o máximo de usuários pela primeira vez
let rampEnd = null;
for (const timestamp of sortedTimestamps) {
  const threadsByLabelAtTimestamp = threadsByTimestamp[timestamp];
  const totalThreadsAtTimestamp = Object.values(threadsByLabelAtTimestamp).reduce(
    (sum, threads) => sum + threads,
    0
  );
  if (totalThreadsAtTimestamp === maxUsers) {
    rampEnd = timestamp;
    break;
  }
}

const durationMs = rampEnd && rampStart ? rampEnd - rampStart : 0;
const rampUpInfo = {
  users: maxUsers,
  usersPerTest: maxUsersPerTest,
  duration: formatDuration(durationMs),
};

    startTime = new Date(minTime).toLocaleString("pt-BR");
    endTime = new Date(maxTime).toLocaleString("pt-BR");

    return NextResponse.json({
      successCount,
      errorCount,
      startTime,
      endTime,
      rampUpInfo,
      aggregateReport,
      timeSeriesData: seriesData,
      errorDetails,
      labels: labels, // Adiciona a lista de labels para o frontend
    });
  } catch (error) {
    console.error("Erro ao processar o arquivo:", error);
    return NextResponse.json({ error: "Erro ao processar o arquivo." }, { status: 500 });
  }
}