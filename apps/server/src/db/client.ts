import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

/**
 * Supabase pooler endpoints (.pooler.supabase.com) terminate TLS but use a
 * cert signed by a CA that's not in the default Render/Vercel image trust
 * store. Disabling cert verification for these hosts is the standard
 * workaround documented by Supabase. The connection itself is still
 * encrypted; we just don't verify the chain.
 *
 * For non-Supabase Postgres, no SSL override is applied.
 */
function needsLooseSsl(url: string | undefined): boolean {
  if (!url) return false;
  return /\.pooler\.supabase\.com|\.supabase\.co/.test(url);
}

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  ssl: needsLooseSsl(config.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  logger.error({ err }, 'pg pool error');
});

export type Db = pg.Pool;

/** Run a function inside a transaction. Rolls back on throw. */
export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
