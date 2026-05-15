import { pool } from './client.js';
import { logger } from '../utils/logger.js';

/**
 * Idempotent on-boot migrations. Every statement uses `if not exists`,
 * `if exists` or an equivalent guard so it's safe to run on every boot.
 * Once a deploy applies them, subsequent boots are no-ops.
 *
 * Add new migrations to the bottom; do not rewrite past entries.
 */
export async function runMigrations(): Promise<void> {
  const steps: Array<{ name: string; sql: string }> = [
    {
      name: 'players.password column',
      sql: 'alter table players add column if not exists password text',
    },
    {
      name: 'players.avatar_url column',
      sql: 'alter table players add column if not exists avatar_url text',
    },
    // future: add more idempotent migrations here
  ];

  for (const s of steps) {
    try {
      await pool.query(s.sql);
      logger.debug({ migration: s.name }, 'migration applied');
    } catch (err) {
      // Don't crash the whole server on a single migration failure —
      // log and continue. The route that needs the column will surface
      // a clear error later.
      logger.error({ err, migration: s.name }, 'migration failed');
    }
  }
  logger.info({ count: steps.length }, 'migrations done');
}
