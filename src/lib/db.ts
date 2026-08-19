import { Pool } from "pg";

const globalDb = globalThis as unknown as {
  performancePool?: Pool;
  performanceSecurityPool?: Pool;
};

export const db =
  globalDb.performancePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

export const securityDb =
  globalDb.performanceSecurityPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  max: 1,
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalDb.performancePool = db;
  globalDb.performanceSecurityPool = securityDb;
}
