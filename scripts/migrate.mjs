import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile('.env.local'); } catch { /* production injects environment variables */ }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now(),
    checksum text
  )`);
  await client.query('ALTER TABLE schema_migration ADD COLUMN IF NOT EXISTS checksum text');
  await client.query("SELECT pg_advisory_lock(hashtextextended('performance-dashboard-migrations',0))");
  const directory = path.join(process.cwd(), 'migrations');
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await fs.readFile(path.join(directory, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const applied = await client.query('SELECT checksum FROM schema_migration WHERE version=$1', [file]);
    if (applied.rows[0]) {
      if (applied.rows[0].checksum && applied.rows[0].checksum !== checksum) throw new Error(`Migration alterada após aplicação: ${file}`);
      if (!applied.rows[0].checksum) await client.query('UPDATE schema_migration SET checksum=$2 WHERE version=$1', [file, checksum]);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migration (version,checksum) VALUES ($1,$2)', [file,checksum]);
      await client.query('COMMIT');
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtextextended('performance-dashboard-migrations',0))").catch(()=>undefined);
  client.release();
  await pool.end();
}
