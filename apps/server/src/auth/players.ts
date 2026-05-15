import { pool } from '../db/client.js';
import type { PlayerProfile } from '@neon-poker/shared/types';

export async function findPlayerByHandle(handle: string): Promise<PlayerProfile | null> {
  const r = await pool.query(
    `select id, player_handle, display_name, status, chips, allow_concurrent_sessions
       from players where player_handle = $1`,
    [handle],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  return {
    id: row.id,
    handle: row.player_handle,
    displayName: row.display_name,
    status: row.status,
    chips: Number(row.chips),
    allowConcurrentSessions: row.allow_concurrent_sessions,
  };
}

export async function findPlayerById(id: string): Promise<PlayerProfile | null> {
  const r = await pool.query(
    `select id, player_handle, display_name, status, chips, allow_concurrent_sessions
       from players where id = $1`,
    [id],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  return {
    id: row.id,
    handle: row.player_handle,
    displayName: row.display_name,
    status: row.status,
    chips: Number(row.chips),
    allowConcurrentSessions: row.allow_concurrent_sessions,
  };
}

/**
 * Self-registration when joining via invite. Creates a row in `pending`
 * if the handle is not yet known. If it exists, returns the current row.
 */
export async function getOrCreatePendingPlayer(args: {
  handle: string;
  displayName: string | null;
}): Promise<PlayerProfile> {
  const existing = await findPlayerByHandle(args.handle);
  if (existing) return existing;

  await pool.query(
    `insert into players (player_handle, display_name, status, chips)
     values ($1, $2, 'pending', 0)
     on conflict (player_handle) do nothing`,
    [args.handle, args.displayName],
  );
  const fetched = await findPlayerByHandle(args.handle);
  if (!fetched) throw new Error('failed_to_create_player');
  return fetched;
}
