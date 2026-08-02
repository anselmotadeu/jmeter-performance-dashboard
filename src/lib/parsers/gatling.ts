import type { PerformanceParser, NormalizedPoint } from './types';

// Gatling simulation.log format — tab-delimited lines
// Produced by any Gatling simulation in the results directory.
//
// Record types:
//   RUN   \t simName \t startTs \t description \t version
//   USER  \t scenario \t userId \t START|END \t startTs \t endTs
//   REQUEST \t scenario \t userId \t group \t requestName \t start \t end \t OK|KO \t message
//   SIMULATION \t simName \t startTs \t endTs \t status

type UserRecord = {
  scenario: string;
  userId: string;
  startTs: number;
};

export const gatlingParser: PerformanceParser = {
  name: 'gatling',
  displayName: 'Gatling',
  supportedExtensions: ['.log'],

  detect(firstLines: string): boolean {
    return firstLines.includes('RUN\t') && firstLines.includes('REQUEST\t');
  },

  parse(content: string): NormalizedPoint[] {
    const lines = content.split('\n');
    const points: NormalizedPoint[] = [];

    // Track active users per scenario at each timestamp for VU count
    const activeUsers = new Map<string, UserRecord>();
    const vusBySecond = new Map<number, number>();

    // Two passes: first count VUs, then build points
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts[0] !== 'USER') continue;

      const [, , userId, event, startStr, endStr] = parts;
      if (event === 'START') {
        activeUsers.set(userId, {
          scenario: parts[1],
          userId,
          startTs: Number(startStr),
        });
      } else if (event === 'END') {
        const endTs = Number(endStr || startStr);
        const sec = Math.floor(endTs / 1000) * 1000;
        const current = vusBySecond.get(sec) ?? 0;
        vusBySecond.set(sec, current + 1);
        activeUsers.delete(userId);
      }
    }

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts[0] !== 'REQUEST') continue;

      // REQUEST \t scenario \t userId \t group \t name \t start \t end \t status \t message
      const [, , , , requestName, startStr, endStr, statusStr, message] = parts;

      const start = Number(startStr);
      const end = Number(endStr);
      if (!start || isNaN(start) || !end || isNaN(end)) continue;

      const elapsed = end - start;
      const label = requestName?.trim() || 'Unknown';
      const success = statusStr?.trim() === 'OK';
      const sec = Math.floor(start / 1000) * 1000;
      const vus = vusBySecond.get(sec) ?? activeUsers.size;

      points.push({
        timestamp: start,
        label,
        elapsed,
        success,
        activeUsers: vus,
        latency: Math.floor(elapsed * 0.7),
        bytesReceived: 0,
        bytesSent: 0,
        responseCode: success ? '200' : '500',
        responseMessage: success ? undefined : message?.trim() || 'KO',
      });
    }

    return points;
  },
};
