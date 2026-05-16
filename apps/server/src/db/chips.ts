import type pg from 'pg';
import { pool, withTx } from './client.js';

export type ChipLedgerReason =
  | 'admin_grant'
  | 'admin_revoke'
  | 'admin_set'
  | 'buy_in'
  | 'cash_out'
  /** Player requested a cashout — chips leave the wallet immediately
   *  and are held in escrow until the admin resolves the request. */
  | 'cash_out_hold'
  /** Held cashout returned to the wallet (admin rejection, player
   *  cancellation, or partial approval refunding the unused amount). */
  | 'cash_out_refund'
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

/**
 * Tops up (or down) a player's in-game seat stack rather than their
 * off-table balance. Used by the admin "Chips ±" action when the target
 * player is currently seated — they get the chips immediately into the
 * stack they're playing with, not into a balance they'd only see after
 * cashing out.
 *
 * The chip_ledger receives an `admin_grant` / `admin_revoke` row keyed by
 * the table id so the audit trail is intact. `balance_after` records the
 * unchanged player balance — the seat stack movement is implicit via
 * ref_table_id + the note.
 */
export async function adminAddChipsToSeat(args: {
  playerId: string;
  tableId: string;
  seatIndex: number;
  delta: number;
  adminId: string;
  note?: string | null;
}): Promise<number> {
  return withTx(async (c) => {
    const lock = await c.query<{ stack: string }>(
      'select stack from table_seats where table_id = $1 and seat_index = $2 for update',
      [args.tableId, args.seatIndex],
    );
    if (lock.rowCount === 0) throw new Error('seat_not_found');
    const before = Number(lock.rows[0]!.stack);
    const after = before + args.delta;
    if (after < 0) throw new Error('insufficient_seat_chips');

    await c.query(
      'update table_seats set stack = $1 where table_id = $2 and seat_index = $3',
      [after, args.tableId, args.seatIndex],
    );
    const balanceRow = await c.query<{ chips: string }>(
      'select chips from players where id = $1',
      [args.playerId],
    );
    await c.query(
      `insert into chip_ledger
       (player_id, delta, balance_after, reason, ref_table_id, admin_id, note)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        args.playerId,
        args.delta,
        balanceRow.rows[0]?.chips ?? '0',
        args.delta >= 0 ? 'admin_grant' : 'admin_revoke',
        args.tableId,
        args.adminId,
        args.note ?? `seat ${args.seatIndex} stack top-up`,
      ],
    );
    return after;
  });
}
