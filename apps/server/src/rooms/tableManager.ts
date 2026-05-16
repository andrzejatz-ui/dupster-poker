import { ulid } from 'ulid';
import { logger } from '../utils/logger.js';
import { pool, withTx } from '../db/client.js';
import { moveChipsInTx } from '../db/chips.js';
import {
  BOT_PLAYER_PREFIX,
  isBotPlayerId,
  PokerTable,
  type TableConfig,
} from '../poker/engine.js';
import { decideBotAction } from '../poker/bot.js';

const BOT_NAMES = [
  'Bot Alex', 'Bot Sam', 'Bot Riley', 'Bot Casey',
  'Bot Morgan', 'Bot Drew', 'Bot Jamie', 'Bot Quinn',
];

/**
 * Single-process in-memory registry of PokerTable instances. For horizontal
 * scaling later, this would be replaced with Redis pub/sub + sticky routing.
 */
export class TableManager {
  private tables = new Map<string, PokerTable>();
  private turnTimers = new Map<string, NodeJS.Timeout>();
  /** Pending think-delay timer for bot seats — at most one per table. */
  private botTimers = new Map<string, NodeJS.Timeout>();
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
      max_players, allow_spectators, is_test_room from tables where archived_at is null`);
    for (const row of r.rows) {
      // Test rooms don't survive a restart — their bot seats live only
      // in memory and the admin's session is gone. Archive on load so
      // they vanish from /admin/tables and aren't reloaded next time.
      if (row.is_test_room) {
        await pool.query('update tables set archived_at = now() where id = $1', [row.id]);
        continue;
      }
      const cfg: TableConfig = {
        tableId: row.id,
        name: row.name,
        smallBlind: Number(row.small_blind),
        bigBlind: Number(row.big_blind),
        buyIn: Number(row.buy_in),
        maxPlayers: row.max_players,
        turnTimerMs,
        allowSpectators: row.allow_spectators,
        isTestRoom: false,
      };
      this.tables.set(row.id, new PokerTable(cfg));
    }
    logger.info({ count: this.tables.size }, 'tables loaded');
  }

  /**
   * If no active tables exist, seed three stake levels + a heads-up
   * format so the admin doesn't have to create from scratch. Called
   * once at boot, after loadTablesFromDb.
   */
  async ensureDefaultTables(turnTimerMs: number): Promise<void> {
    if (this.tables.size > 0) return;
    const admin = await pool.query<{ id: string }>(
      'select id from admins order by created_at asc limit 1',
    );
    const adminId = admin.rows[0]?.id;
    if (!adminId) return;

    const presets: Array<{
      name: string;
      sb: number;
      bb: number;
      buyIn: number;
      maxPlayers: number;
    }> = [
      // Five escalating natural-disaster tiers, ×5 stakes per step,
      // 50 BB buy-in everywhere so the playing depth is consistent.
      { name: 'Breeze',    sb: 5,    bb: 10,   buyIn: 500,    maxPlayers: 6 },
      { name: 'Storm',     sb: 25,   bb: 50,   buyIn: 2500,   maxPlayers: 6 },
      { name: 'Tornado',   sb: 100,  bb: 200,  buyIn: 10000,  maxPlayers: 6 },
      { name: 'Hurricane', sb: 500,  bb: 1000, buyIn: 50000,  maxPlayers: 6 },
      { name: 'Tsunami',   sb: 2500, bb: 5000, buyIn: 250000, maxPlayers: 6 },
    ];

    for (const p of presets) {
      const ins = await pool.query<{ id: string }>(
        `insert into tables
           (name, small_blind, big_blind, buy_in, max_players, allow_spectators, created_by)
         values ($1,$2,$3,$4,$5,false,$6) returning id`,
        [p.name, p.sb, p.bb, p.buyIn, p.maxPlayers, adminId],
      );
      const id = ins.rows[0]!.id;
      this.tables.set(
        id,
        new PokerTable({
          tableId: id,
          name: p.name,
          smallBlind: p.sb,
          bigBlind: p.bb,
          buyIn: p.buyIn,
          maxPlayers: p.maxPlayers,
          turnTimerMs,
          allowSpectators: false,
        }),
      );
    }
    logger.warn({ count: presets.length }, 'seeded default tables');
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
    avatarUrl?: string | null;
    /**
     * When true, suppress the automatic maybeStartHand call so the caller
     * can batch multiple seatings (e.g. the test-room bootstrap) and
     * trigger the first hand once everyone is seated.
     */
    defer?: boolean;
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
      avatarUrl: args.avatarUrl ?? null,
      stack: buyIn,
    });

    this.onStateChange(args.tableId);
    if (!args.defer) this.maybeStartHand(args.tableId);
    return { seatIndex: chosen };
  }

  async leavePlayer(args: {
    tableId: string;
    seatIndex: number;
    playerId: string;
    /** Set when called from closeTable's drain loop — suppresses the
     *  test-room auto-teardown path so we don't recurse. */
    suppressTestRoomTeardown?: boolean;
  }): Promise<void> {
    const table = this.tables.get(args.tableId);
    if (!table) throw new Error('table_not_found');
    const left = table.leave(args.seatIndex);
    if (!left) return;

    // Bot seats are pure in-memory; the players FK would reject any
    // ledger or table_seats write keyed on their synthetic id.
    if (!isBotPlayerId(args.playerId)) {
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
    }

    this.onStateChange(args.tableId);

    // Test rooms exist for the admin — bots alone shouldn't keep
    // dealing forever. If the human just left, tear it down.
    if (
      table.cfg.isTestRoom &&
      !isBotPlayerId(args.playerId) &&
      !args.suppressTestRoomTeardown
    ) {
      const humansLeft = [...table.seats.values()].some(
        (s) => !isBotPlayerId(s.playerId),
      );
      if (!humansLeft) {
        try {
          await this.closeTable(args.tableId);
          await pool.query(
            'update tables set archived_at = now() where id = $1 and archived_at is null',
            [args.tableId],
          );
        } catch (err) {
          logger.error({ err, tableId: args.tableId }, 'test-room teardown failed');
        }
      }
    }
  }

  /**
   * In-memory bot seat for a test room. No DB rows are written; the seat
   * vanishes when the table is closed (no cleanup needed). Returns the
   * seat index that was used so the caller can chain multiple bots.
   */
  sitBot(args: {
    tableId: string;
    seatIndex?: number;
    name?: string;
    /** Suppress auto-start so the caller can batch-seat the table. */
    defer?: boolean;
  }): { seatIndex: number } {
    const table = this.tables.get(args.tableId);
    if (!table) throw new Error('table_not_found');
    if (!table.cfg.isTestRoom) {
      // Belt-and-braces: never seat bots at a real-money table by mistake.
      throw new Error('not_a_test_room');
    }

    let chosen = args.seatIndex ?? -1;
    if (chosen < 0 || chosen >= table.cfg.maxPlayers || table.seats.has(chosen)) {
      chosen = -1;
      for (let i = 0; i < table.cfg.maxPlayers; i++) {
        if (!table.seats.has(i)) { chosen = i; break; }
      }
    }
    if (chosen < 0) throw new Error('table_full');

    const playerId = `${BOT_PLAYER_PREFIX}${ulid()}`;
    const displayName = args.name ?? BOT_NAMES[chosen % BOT_NAMES.length]!;
    table.sit({
      seatIndex: chosen,
      playerId,
      displayName,
      avatarUrl: null,
      stack: table.cfg.buyIn,
      isBot: true,
    });

    this.onStateChange(args.tableId);
    if (!args.defer) {
      this.maybeStartHand(args.tableId);
      this.scheduleBotIfNeeded(args.tableId);
    }
    return { seatIndex: chosen };
  }

  /**
   * Public entrypoint to kick off auto-dealing on a freshly seated table.
   * The test-room bootstrap defers the per-seat maybeStartHand calls and
   * then triggers exactly one start once everyone is in place.
   */
  beginPlay(tableId: string): void {
    this.maybeStartHand(tableId);
    this.scheduleBotIfNeeded(tableId);
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
    else this.scheduleBotIfNeeded(args.tableId);
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
      this.scheduleBotIfNeeded(tableId);
    }
  }

  /**
   * If the seat currently to-act is a bot, queue its action behind a
   * randomized think delay so the table feels alive instead of robotic.
   * Called whenever the to-act pointer might have moved: after every
   * applied action, after each new hand starts, after sitBot, after the
   * turn-timer fires. Cancels any previous bot timer on the same table.
   */
  private scheduleBotIfNeeded(tableId: string): void {
    const table = this.tables.get(tableId);
    if (!table) return;
    const prev = this.botTimers.get(tableId);
    if (prev) { clearTimeout(prev); this.botTimers.delete(tableId); }
    if (table.isPaused) return;
    if (table.toActSeat === null) return;
    const seat = table.seats.get(table.toActSeat);
    if (!seat || !seat.isBot) return;
    const legal = table.legalActionsFor(seat.seatIndex);
    if (!legal) return;

    const decision = decideBotAction({ table, seat, legal });
    const seatToAct = seat.seatIndex;
    const handAtSchedule = table.handId;

    const timer = setTimeout(() => {
      this.botTimers.delete(tableId);
      const t = this.tables.get(tableId);
      if (!t) return;
      if (t.handId !== handAtSchedule) return;
      if (t.toActSeat !== seatToAct) return;
      if (t.isPaused) return;
      try {
        const res = t.applyAction(seatToAct, decision.action, `bot:${ulid()}`);
        this.scheduleTurnTimer(tableId);
        this.onStateChange(tableId);
        if (t.phase === 'showdown') {
          void this.finalizeHand(tableId);
        } else {
          this.scheduleBotIfNeeded(tableId);
        }
        if (!res.ok) {
          logger.warn({ tableId, seatToAct, res }, 'bot action rejected');
        }
      } catch (err) {
        logger.error({ err, tableId, seatToAct }, 'bot action threw');
      }
    }, decision.thinkMs);

    this.botTimers.set(tableId, timer);
  }

  /**
   * Player-requested pause: marks the seat paused, optionally folds
   * them out of the running hand, and broadcasts the new state.
   * Returns false if the player isn't seated anywhere.
   */
  pausePlayer(playerId: string): boolean {
    for (const table of this.tables.values()) {
      for (const seat of table.seats.values()) {
        if (seat.playerId === playerId) {
          table.pause(seat.seatIndex);
          this.scheduleTurnTimer(table.cfg.tableId);
          this.onStateChange(table.cfg.tableId);
          if (table.phase === 'showdown') {
            void this.finalizeHand(table.cfg.tableId);
          }
          return true;
        }
      }
    }
    return false;
  }

  resumePlayer(playerId: string): boolean {
    for (const table of this.tables.values()) {
      for (const seat of table.seats.values()) {
        if (seat.playerId === playerId) {
          table.resume(seat.seatIndex);
          this.onStateChange(table.cfg.tableId);
          this.maybeStartHand(table.cfg.tableId);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * If the player happens to be sitting at any table, update the
   * in-memory seat avatar and trigger a state broadcast so the other
   * seats see the new picture immediately.
   */
  updatePlayerAvatar(playerId: string, avatarUrl: string | null): void {
    for (const table of this.tables.values()) {
      for (const seat of table.seats.values()) {
        if (seat.playerId === playerId) {
          seat.avatarUrl = avatarUrl;
          this.onStateChange(table.cfg.tableId);
          return;
        }
      }
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
    const b = this.botTimers.get(tableId);
    if (b) {
      clearTimeout(b);
      this.botTimers.delete(tableId);
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
      this.scheduleBotIfNeeded(tableId);
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
    // Cancel any pending turn / bot timer.
    const t = this.turnTimers.get(tableId);
    if (t) {
      clearTimeout(t);
      this.turnTimers.delete(tableId);
    }
    const b = this.botTimers.get(tableId);
    if (b) {
      clearTimeout(b);
      this.botTimers.delete(tableId);
    }
    // Snapshot seats then call leavePlayer for each so the cash_out
    // ledger row is written by the same path used in normal flow.
    const seats = [...table.seats.values()].map((s) => ({
      seatIndex: s.seatIndex,
      playerId: s.playerId,
    }));
    for (const s of seats) {
      try {
        await this.leavePlayer({
          tableId,
          seatIndex: s.seatIndex,
          playerId: s.playerId,
          suppressTestRoomTeardown: true,
        });
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
        try {
          table.applyTimeout(seatToTimeout);
          this.scheduleTurnTimer(tableId);
          this.onStateChange(tableId);
          if (table.phase === 'showdown') {
            // Don't `await` here — setTimeout callback isn't async-aware.
            // finalizeHand swallows its own errors.
            void this.finalizeHand(tableId);
          } else {
            this.scheduleBotIfNeeded(tableId);
          }
        } catch (err) {
          logger.error({ err, tableId }, 'turn-timer handler failed');
        }
      }, delay),
    );
  }

  private async finalizeHand(tableId: string) {
    const table = this.tables.get(tableId);
    if (!table || table.phase !== 'showdown') return;

    // Wrap resolveShowdown in try/catch so a single bad hand can't
    // freeze the table forever: we still want finishHand + the next
    // maybeStartHand to run even if persistence or evaluation fails.
    let result: ReturnType<typeof table.resolveShowdown>;
    try {
      result = table.resolveShowdown();
    } catch (err) {
      logger.error({ err, tableId }, 'resolveShowdown failed — recovering');
      table.finishHand();
      this.onStateChange(tableId);
      setTimeout(() => this.maybeStartHand(tableId), 8000);
      return;
    }

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

        // Persist seat stack updates (so a crash doesn't wipe winnings).
        // Bots have no table_seats row — skip them.
        for (const seat of table.seats.values()) {
          if (isBotPlayerId(seat.playerId)) continue;
          await c.query(
            'update table_seats set stack = $1 where table_id = $2 and seat_index = $3',
            [seat.stack, tableId, seat.seatIndex],
          );
        }

        // Hand results. Bots aren't in `players`, so the FK would
        // reject any hand_results row keyed on their synthetic id.
        for (const seat of table.seats.values()) {
          if (isBotPlayerId(seat.playerId)) continue;
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
    setTimeout(() => this.maybeStartHand(tableId), 8000);
  }
}
