import { pool } from '../db/client.js';
import type { PlayerProfile } from '@neon-poker/shared/types';

export async function findPlayerByHandle(handle: string): Promise<PlayerProfile | null> {
  const r = await pool.query(
    `select id, player_handle, display_name, avatar_url, status, chips, allow_concurrent_sessions
       from players where player_handle = $1`,
    [handle],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  return {
    id: row.id,
    handle: row.player_handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: row.status,
    chips: Number(row.chips),
    allowConcurrentSessions: row.allow_concurrent_sessions,
  };
}

export async function findPlayerById(id: string): Promise<PlayerProfile | null> {
  const r = await pool.query(
    `select id, player_handle, display_name, avatar_url, status, chips, allow_concurrent_sessions
       from players where id = $1`,
    [id],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  return {
    id: row.id,
    handle: row.player_handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: row.status,
    chips: Number(row.chips),
    allowConcurrentSessions: row.allow_concurrent_sessions,
  };
}

/**
 * Reads the stored plaintext password for a handle. Used by /auth/join
 * to decide between create / verify / reject flows.
 *
 * Returns null if no such player. The `password` field is null for
 * legacy rows that pre-date the password column — the admin must set
 * one via the dashboard before the player can log in directly.
 */
export async function findPlayerByHandleWithPassword(
  handle: string,
): Promise<(PlayerProfile & { password: string | null }) | null> {
  const r = await pool.query(
    `select id, player_handle, display_name, password, status, chips,
            allow_concurrent_sessions
       from players where player_handle = $1`,
    [handle],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  return {
    id: row.id,
    handle: row.player_handle,
    displayName: row.display_name,
    password: row.password,
    status: row.status,
    chips: Number(row.chips),
    allowConcurrentSessions: row.allow_concurrent_sessions,
  };
}

/**
 * Self-registration: creates a pending row with the handle, display name
 * and chosen password. Idempotent on the handle — does NOT overwrite an
 * existing row's password. The /auth/join flow handles existing rows
 * separately via password verification.
 */
export async function createPendingPlayer(args: {
  handle: string;
  password: string;
  displayName: string | null;
}): Promise<PlayerProfile> {
  await pool.query(
    `insert into players (player_handle, display_name, password, status, chips)
     values ($1, $2, $3, 'pending', 0)
     on conflict (player_handle) do nothing`,
    [args.handle, args.displayName, args.password],
  );
  const fetched = await findPlayerByHandle(args.handle);
  if (!fetched) throw new Error('failed_to_create_player');
  return fetched;
}
