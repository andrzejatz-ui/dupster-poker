import type pg from 'pg';
import { pool, withTx } from './client.js';

export type ChipLedgerReason =
  | 'admin_grant'
  | 'admin_revoke'
  | 'admin_set'
  | 'buy_in'
  | 'cash_out'
  | 'win'
  | 'lose';

interface ChipMoveArgs {
  playerId: string;
  delta: bigint | number;
  reason: ChipLedgerReason;
  adminId?: string | null;
  refTableId?: string | null;
  refHandId?: string | null;
  note?: string | null;
}

/**
 * Apply a chip delta atomically. Locks the player row, validates the new
 * balance is >= 0, writes the ledger row inside the same TX. Returns the
 * new balance.
 *
 * Throws on insufficient chips. The caller decides how to surface it.
 */
export async function moveChips(args: ChipMoveArgs): Promise<bigint> {
  return withTx(async (c) => moveChipsInTx(c, args));
}

export async function moveChipsInTx(
  client: pg.PoolClient,
  args: ChipMoveArgs,
): Promise<bigint> {
  const delta = BigInt(args.delta);
  const lock = await client.query<{ chips: string }>(
    'select chips from players where id = $1 for update',
    [args.playerId],
  );
  if (lock.rowCount === 0) throw new Error('player_not_found');
  const before = BigInt(lock.rows[0]!.chips);
  const after = before + delta;
  if (after < 0n) throw new Error('insufficient_chips');

  await client.query('update players set chips = $1 where id = $2', [
    after.toString(),
    args.playerId,
  ]);
  await client.query(
    `insert into chip_ledger
     (player_id, delta, balance_after, reason, ref_table_id, ref_hand_id, admin_id, note)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      args.playerId,
      delta.toString(),
      after.toString(),
      args.reason,
      args.refTableId ?? null,
      args.refHandId ?? null,
      args.adminId ?? null,
      args.note ?? null,
    ],
  );
  return after;
}

export async function getChips(playerId: string): Promise<bigint> {
  const r = await pool.query<{ chips: string }>(
    'select chips from players where id = $1',
    [playerId],
  );
  if (r.rowCount === 0) throw new Error('player_not_found');
  return BigInt(r.rows[0]!.chips);
}
