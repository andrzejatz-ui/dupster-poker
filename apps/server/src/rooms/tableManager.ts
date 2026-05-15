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
   * to seat stack. Throws on insufficient chips or seat taken.
   */
  async sitPlayer(args: {
    tableId: string;
    seatIndex: number;
    playerId: string;
    displayName: string;
  }): Promise<void> {
    const table = this.tables.get(args.tableId);
    if (!table) throw new Error('table_not_found');
    const buyIn = table.cfg.buyIn;

    await withTx(async (c) => {
      // lock player + chip move
      await moveChipsInTx(c, {
        playerId: args.playerId,
        delta: -BigInt(buyIn),
        reason: 'buy_in',
        refTableId: args.tableId,
        note: `seat ${args.seatIndex}`,
      });
      await c.query(
        `insert into table_seats (table_id, seat_index, player_id, stack)
         values ($1,$2,$3,$4)`,
        [args.tableId, args.seatIndex, args.playerId, buyIn],
      );
    });
    table.sit({
      seatIndex: args.seatIndex,
      playerId: args.playerId,
      displayName: args.displayName,
      stack: buyIn,
    });

    this.onStateChange(args.tableId);
    this.maybeStartHand(args.tableId);
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
    const ready = table.activeSeats();
    if (ready.length < 2) return;
    const started = table.startHand();
    if (started) {
      this.scheduleTurnTimer(tableId);
      this.onStateChange(tableId);
    }
  }

  private scheduleTurnTimer(tableId: string) {
    const table = this.tables.get(tableId);
    if (!table) return;
    const old = this.turnTimers.get(tableId);
    if (old) clearTimeout(old);

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
