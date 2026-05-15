import argon2 from 'argon2';
import { pool } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

/**
 * Ensures the env-configured admin exists with the env-configured password.
 *
 * Behaviour:
 *   - No admin with this username yet → create it.
 *   - Admin exists → re-sync its password hash from the env on every boot.
 *
 * This makes BOOTSTRAP_ADMIN_PASSWORD the source of truth: changing it on
 * the host and redeploying actually updates the admin's password. Any
 * additional admins created later via the dashboard are left untouched.
 */
export async function bootstrapAdmin(): Promise<void> {
  const username = config.BOOTSTRAP_ADMIN_USERNAME;
  const passwordHash = await argon2.hash(config.BOOTSTRAP_ADMIN_PASSWORD, {
    type: argon2.argon2id,
  });
  const existing = await pool.query<{ id: string }>(
    'select id from admins where username = $1',
    [username],
  );
  if (existing.rowCount === 0) {
    await pool.query(
      'insert into admins (username, password_hash) values ($1, $2)',
      [username, passwordHash],
    );
    logger.warn({ username }, 'bootstrap admin created');
    return;
  }
  await pool.query(
    'update admins set password_hash = $2 where id = $1',
    [existing.rows[0]!.id, passwordHash],
  );
  logger.info({ username }, 'bootstrap admin password re-synced from env');
}

export async function verifyAdminLogin(
  username: string,
  password: string,
): Promise<{ id: string; username: string } | null> {
  const r = await pool.query(
    'select id, password_hash from admins where username = $1',
    [username],
  );
  if (r.rowCount === 0) {
    // constant-time fake check to avoid user-enumeration
    await argon2.verify(
      '$argon2id$v=19$m=65536,t=3,p=4$YWFhYWFhYWFhYWFhYWFhYQ$' +
        'zZJ4aDk6T1qF3F6m3VOFRO4kSPiM5cYZ+w6JxDU3MOI',
      password,
    ).catch(() => false);
    return null;
  }
  const row = r.rows[0]!;
  const ok = await argon2.verify(row.password_hash, password).catch(() => false);
  if (!ok) return null;
  await pool.query('update admins set last_login_at = now() where id = $1', [row.id]);
  return { id: row.id, username };
}

export async function logAdminAction(args: {
  adminId: string;
  action: string;
  targetPlayerId?: string | null;
  targetTableId?: string | null;
  payload?: unknown;
  reason?: string | null;
}): Promise<void> {
  await pool.query(
    `insert into admin_log
       (admin_id, action, target_player_id, target_table_id, payload, reason)
     values ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      args.adminId,
      args.action,
      args.targetPlayerId ?? null,
      args.targetTableId ?? null,
      args.payload ? JSON.stringify(args.payload) : null,
      args.reason ?? null,
    ],
  );
}
