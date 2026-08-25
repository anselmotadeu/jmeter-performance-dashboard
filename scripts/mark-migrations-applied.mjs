import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile('.env.local'); } catch { /* ignore */ }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();

try {
  // Create schema_migration table if not exists
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now(),
    checksum text
  )`);
  console.log('✓ schema_migration table exists');

  // Get all migration files
  const directory = path.join(process.cwd(), 'migrations');
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  
  console.log(`\nFound ${files.length} migration files:`);
  
  for (const file of files) {
    const sql = await fs.readFile(path.join(directory, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    
    // Check if already applied
    const applied = await client.query('SELECT version FROM schema_migration WHERE version=$1', [file]);
    
    if (applied.rows.length > 0) {
      console.log(`  ✓ ${file} - already tracked`);
    } else {
      // Mark as applied
      await client.query(
        'INSERT INTO schema_migration (version, checksum) VALUES ($1, $2)',
        [file, checksum]
      );
      console.log(`  ✓ ${file} - marked as applied`);
    }
  }
  
  console.log('\n✓ All migrations marked as applied');
  
} finally {
  client.release();
  await pool.end();
}
