import { logger } from '../utils/logger.js';
import { pool, withTx } from '../db/client.js';
import { moveChipsInTx } from '../db/chips.js';
import { PokerTable, type TableConfig } from '../poker/engine.js';

/**
 * Single-process in-memory registry of PokerTable instances. For horizontal
 * scaling later, this would be replaced with Redis pub/sub + sticky routing.
 */
export class TableManager {
  private tables = new Map<string, PokerTable>();
  private turnTimers = new Map<string, NodeJS.Timeout>();
  /** Listener fired on every state change so the socket layer can broadcast. */
  onStateChange: (tableId: string) => void = () => {};
  onHandResult: (tableId: string, payload: ReturnType<PokerTable['resolveShowdown']>) => void = () => {};
  onTurn: (tableId: string) => void = () => {};

  async loadTablesFromDb(turnTimerMs: number) {
    // Sessions don't survive a server restart — the in-memory game state
    // is gone, so any rows left in `table_seats` from the previous run
    // are dangling. They block new joins via the PK (table_id, seat_index)
    // and they hold chips that the player can't reach. Refund their
    // stacks back to the player balance, then delete the rows.
    await this.cleanupStaleSeats();

    const r = await pool.query(`select id, name, small_blind, big_blind, buy_in,
      max_players, allow_spectators from tables where archived_at is null`);
    for (const row of r.rows) {
      const cfg: TableConfig = {
        tableId: row.id,
        name: row.name,
        smallBlind: Number(row.small_blind),
        bigBlind: Number(row.big_blind),
        buyIn: Number(row.buy_in),
        maxPlayers: row.max_players,
        turnTimerMs,
        allowSpectators: row.allow_spectators,
      };
      this.tables.set(row.id, new PokerTable(cfg));
    }
    logger.info({ count: this.tables.size }, 'tables loaded');
  }

  /**
   * Releases all rows in table_seats, refunding the stack to each player.
   * Called once on boot so the next sit-down can succeed.
   */
  private async cleanupStaleSeats(): Promise<void> {
    const rows = await pool.query<{
      table_id: string;
      seat_index: number;
      player_id: string;
      stack: string;
    }>(`select table_id, seat_index, player_id, stack from table_seats`);
    if (rows.rowCount === 0) return;
    for (const row of rows.rows) {
      try {
        await withTx(async (c) => {
          const stack = Number(row.stack);
          if (stack > 0) {
            await moveChipsInTx(c, {
              playerId: row.player_id,
              delta: BigInt(stack),
              reason: 'cash_out',
              refTableId: row.table_id,
              note: 'auto-refund: stale seat on restart',
            });
          }
          await c.query(
            'delete from table_seats where table_id = $1 and seat_index = $2',
            [row.table_id, row.seat_index],
          );
        });
      } catch (err) {
        logger.error({ err, row }, 'failed to clean stale seat');
      }
    }
    logger.warn({ count: rows.rowCount }, 'cleaned up stale seats from previous run');
  }

  get(tableId: string): PokerTable | null {
    return this.tables.get(tableId) ?? null;
  }

  list(): PokerTable[] {
    return [...this.tables.values()];
  }

  addTable(table: PokerTable) {
    this.tables.set(table.cfg.tableId, table);
  }

  /**
   * Player sits down at a table. Transfers buy-in chips from player balance
   * to seat stack.
   *
   * Seat selection:
   *   - If `seatIndex` is supplied and the seat is free → use it.
   *   - Otherwise pick the first free seat on the table.
   *   - If the player is already sitting at this table, return that seat
   *     (idempotent — fixes "join twice" double-click crashes).
   *   - If the table is full, throw 'table_full'.
   *
   * Returns the seat index that was actually used so the caller can tell
   * the client where they ended up.
   */
  async sitPlayer(args: {
    tableId: string;
    seatIndex: number;
    playerId: string;
    displayName: string;
  }): Promise<{ seatIndex: number }> {
    const table = this.tables.get(args.tableId);
    if (!table) throw new Error('table_not_found');

    // Already seated here?
    for (const s of table.seats.values()) {
      if (s.playerId === args.playerId) return { seatIndex: s.seatIndex };
    }

    // Pick a seat.
    const desired = args.seatIndex;
    let chosen = desired;
    if (chosen < 0 || chosen >= table.cfg.maxPlayers || table.seats.has(chosen)) {
      chosen = -1;
      for (let i = 0; i < table.cfg.maxPlayers; i++) {
        if (!table.seats.has(i)) { chosen = i; break; }
      }
    }
    if (chosen < 0) throw new Error('table_full');

    const buyIn = table.cfg.buyIn;

    await withTx(async (c) => {
      // Defensive: a previous crashed session might have left a row at
      // this (table, seat). Cleanup-on-boot already handled that, but a
      // mid-run crash could re-create the situation, so we explicitly
      // upsert here rather than blind-insert.
      await moveChipsInTx(c, {
        playerId: args.playerId,
        delta: -BigInt(buyIn),
        reason: 'buy_in',
        refTableId: args.tableId,
        note: `seat ${chosen}`,
      });
      await c.query(
        `insert into table_seats (table_id, seat_index, player_id, stack)
         values ($1,$2,$3,$4)
         on conflict (table_id, seat_index) do update
           set player_id = excluded.player_id,
               stack = excluded.stack,
               sat_down_at = now()`,
        [args.tableId, chosen, args.playerId, buyIn],
      );
    });
    table.sit({
      seatIndex: chosen,
      playerId: args.playerId,
      displayName: args.displayName,
      stack: buyIn,
    });

    this.onStateChange(args.tableId);
    this.maybeStartHand(args.tableId);
    return { seatIndex: chosen };
  }

  async leavePlayer(args: { tableId: string; seatIndex: number; playerId: string }): Promise<void> {
    const table = this.tables.get(args.tableId);
    if (!table) throw new Error('table_not_found');
    const left = table.leave(args.seatIndex);
    if (!left) return;

    await withTx(async (c) => {
      await c.query(
        'delete from table_seats where table_id = $1 and seat_index = $2',
        [args.tableId, args.seatIndex],
      );
      if (left.stack > 0) {
        await moveChipsInTx(c, {
          playerId: args.playerId,
          delta: BigInt(left.stack),
          reason: 'cash_out',
          refTableId: args.tableId,
        });
      }
    });

    this.onStateChange(args.tableId);
  }

  applyAction(args: {
    tableId: string;
    seatIndex: number;
    action: Parameters<PokerTable['applyAction']>[1];
    clientActionId: string;
  }) {
    const table = this.tables.get(args.tableId);
    if (!table) return { ok: false as const, code: 'no_table', message: 'Tisch nicht gefunden' };
    const res = table.applyAction(args.seatIndex, args.action, args.clientActionId);
    this.scheduleTurnTimer(args.tableId);
    this.onStateChange(args.tableId);

    if (table.phase === 'showdown') this.finalizeHand(args.tableId);
    return res;
  }

  private maybeStartHand(tableId: string) {
    const table = this.tables.get(tableId);
    if (!table) return;
    if (table.phase !== 'waiting') return;
    if (table.isPaused) return; // paused tables don't auto-deal
    const ready = table.activeSeats();
    if (ready.length < 2) return;
    const started = table.startHand();
    if (started) {
      this.scheduleTurnTimer(tableId);
      this.onStateChange(tableId);
    }
  }

  /** Public hooks for the admin endpoints. */
  pauseTable(tableId: string): boolean {
    const table = this.tables.get(tableId);
    if (!table) return false;
    table.isPaused = true;
    const t = this.turnTimers.get(tableId);
    if (t) {
      clearTimeout(t);
      this.turnTimers.delete(tableId);
    }
    // Freeze the deadline so the UI shows the pause cleanly.
    table.toActDeadline = null;
    this.onStateChange(tableId);
    return true;
  }
  resumeTable(tableId: string): boolean {
    const table = this.tables.get(tableId);
    if (!table) return false;
    table.isPaused = false;
    // Reset the deadline so the current player has a full window again.
    if (table.toActSeat !== null) {
      table.toActDeadline = Date.now() + table.cfg.turnTimerMs;
      this.scheduleTurnTimer(tableId);
    } else {
      this.maybeStartHand(tableId);
    }
    this.onStateChange(tableId);
    return true;
  }

  /**
   * Cleanly closes a table: cashes out every seated player back to their
   * off-table balance, drops the table from memory, and tells the DB
   * caller that it's safe to archive.
   */
  async closeTable(tableId: string): Promise<{ ok: boolean }> {
    const table = this.tables.get(tableId);
    if (!table) return { ok: false };
    // Cancel any pending turn timer.
    const t = this.turnTimers.get(tableId);
    if (t) {
      clearTimeout(t);
      this.turnTimers.delete(tableId);
    }
    // Snapshot seats then call leavePlayer for each so the cash_out
    // ledger row is written by the same path used in normal flow.
    const seats = [...table.seats.values()].map((s) => ({
      seatIndex: s.seatIndex,
      playerId: s.playerId,
    }));
    for (const s of seats) {
      try {
        await this.leavePlayer({ tableId, seatIndex: s.seatIndex, playerId: s.playerId });
      } catch (err) {
        logger.error({ err, tableId, seatIndex: s.seatIndex }, 'leave failed during table close');
      }
    }
    this.tables.delete(tableId);
    return { ok: true };
  }

  private scheduleTurnTimer(tableId: string) {
    const table = this.tables.get(tableId);
    if (!table) return;
    const old = this.turnTimers.get(tableId);
    if (old) clearTimeout(old);

    if (table.isPaused) return;          // no auto-fold while paused
    if (table.toActSeat === null || table.toActDeadline === null) return;
    const delay = Math.max(0, table.toActDeadline - Date.now());
    const seatToTimeout = table.toActSeat;
    const handAtSchedule = table.handId;

    this.turnTimers.set(
      tableId,
      setTimeout(() => {
        // The hand may have moved on by now — bail if so
        if (table.handId !== handAtSchedule) return;
        if (table.toActSeat !== seatToTimeout) return;
        table.applyTimeout(seatToTimeout);
        this.scheduleTurnTimer(tableId);
        this.onStateChange(tableId);
        if (table.phase === 'showdown') this.finalizeHand(tableId);
      }, delay),
    );
  }

  private async finalizeHand(tableId: string) {
    const table = this.tables.get(tableId);
    if (!table || table.phase !== 'showdown') return;
    const result = table.resolveShowdown();

    // Persist hand + winnings to chip ledger
    try {
      await withTx(async (c) => {
        await c.query(
          `insert into hands (id, table_id, hand_number, board, pot_total, ended_at)
           values ($1, $2, $3, $4, $5, now())
           on conflict (id) do nothing`,
          [
            result.handId,
            tableId,
            result.handNumber,
            result.board,
            result.sidePots.reduce((s, p) => s + p.amount, 0),
          ],
        );

        // Persist seat stack updates (so a crash doesn't wipe winnings)
        for (const seat of table.seats.values()) {
          await c.query(
            'update table_seats set stack = $1 where table_id = $2 and seat_index = $3',
            [seat.stack, tableId, seat.seatIndex],
          );
        }

        // Hand results
        for (const seat of table.seats.values()) {
          const win = result.payouts.get(seat.seatIndex) ?? 0;
          if (seat.holeCards) {
            await c.query(
              `insert into hand_results (hand_id, player_id, hole_cards, best_hand, winnings, showed_down)
               values ($1, $2, $3, $4, $5, $6)
               on conflict do nothing`,
              [
                result.handId,
                seat.playerId,
                seat.holeCards,
                result.winners.find((w) => w.seatIndex === seat.seatIndex)?.handLabel ?? null,
                win,
                !seat.hasFolded,
              ],
            );
          }
        }
      });
    } catch (err) {
      logger.error({ err, tableId }, 'failed to persist hand');
    }

    this.onHandResult(tableId, result);

    // Prepare next hand
    table.finishHand();
    this.onStateChange(tableId);
    setTimeout(() => this.maybeStartHand(tableId), 3000);
  }
}
