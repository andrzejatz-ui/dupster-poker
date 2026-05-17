import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { pool } from '../db/client.js';
import { isSessionActive, touchSession, verifyPlayerToken } from '../auth/sessions.js';
import { findPlayerById } from '../auth/players.js';
import { buildWalletRequestMessage, notifyTelegram } from '../utils/telegram.js';
import { moveChipsInTx } from '../db/chips.js';
import { withTx } from '../db/client.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  TableSummary,
  PendingWalletRequest,
} from '@neon-poker/shared/events';
import type { TableManager } from '../rooms/tableManager.js';
import type { PokerTable } from '../poker/engine.js';

type IOType = IOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type SocketType = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const ActionSchema = z.object({
  tableId: z.string().uuid(),
  clientActionId: z.string().min(1).max(64),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('check') }),
    z.object({ type: z.literal('fold') }),
    z.object({ type: z.literal('call') }),
    z.object({ type: z.literal('bet'), amount: z.number().int().positive() }),
    z.object({ type: z.literal('raise'), amount: z.number().int().positive() }),
    z.object({ type: z.literal('all_in') }),
  ]),
});

export function attachSocketServer(http: HttpServer, tables: TableManager): IOType {
  // Same dynamic CORS rule as the express app: wildcard means "echo the
  // request origin"; otherwise match the explicit allow-list.
  const allowList = new Set(config.allowedOrigins);
  const allowAny = allowList.has('*');
  const io = new IOServer(http, {
    cors: {
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (allowAny) return cb(null, origin);
        if (allowList.has(origin)) return cb(null, origin);
        return cb(new Error(`cors_block:${origin}`));
      },
      credentials: true,
    },
  }) as IOType;

  // ---- Auth gate -------------------------------------------------
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthenticated'));
    const decoded = verifyPlayerToken(token);
    if (!decoded) return next(new Error('bad_token'));
    const ok = await isSessionActive(decoded.sid);
    if (!ok) return next(new Error('session_revoked'));
    socket.data.playerId = decoded.sub;
    socket.data.sessionId = decoded.sid;
    socket.data.isAdmin = false;
    await touchSession(decoded.sid);
    next();
  });

  // ---- Connection ------------------------------------------------
  io.on('connection', async (socket) => {
    const profile = await findPlayerById(socket.data.playerId);
    if (!profile) return socket.disconnect();

    /**
     * Per-socket rate limiter for game-impacting events. Each bucket
     * is a sliding window of timestamps; events arriving inside the
     * window above `cap` are silently dropped. Stops a malicious or
     * runaway client from spamming the table with action / wallet
     * requests faster than a human ever could, without affecting
     * legitimate play.
     */
    const rateBuckets = new Map<string, number[]>();
    const allowEvent = (key: string, capPerWindow: number, windowMs: number): boolean => {
      const now = Date.now();
      const arr = rateBuckets.get(key) ?? [];
      const recent = arr.filter((t) => now - t < windowMs);
      if (recent.length >= capPerWindow) {
        rateBuckets.set(key, recent);
        return false;
      }
      recent.push(now);
      rateBuckets.set(key, recent);
      return true;
    };

    if (profile.status === 'banned') {
      socket.emit('server:hello', { status: 'banned', reason: null });
      return socket.disconnect();
    }
    if (profile.status === 'pending') {
      socket.emit('server:hello', { status: 'pending' });
      return;
    }

    // Surface any open wallet request so the lobby renders the
    // "cashout pending — held X chips" banner instantly on connect
    // instead of waiting for the modal flow.
    const pendingRequest = await fetchPendingRequest(socket.data.playerId);

    socket.emit('server:hello', {
      status: 'approved',
      playerId: profile.id,
      displayName: profile.displayName ?? profile.handle,
      chips: profile.chips,
      isAdmin: false,
      pendingRequest,
    });

    // Re-seat the player's previous table view, if any
    findCurrentSeat(socket, tables).then((seat) => {
      if (seat) {
        socket.join(`table:${seat.tableId}`);
        emitTableState(io, tables, seat.tableId, socket);
      }
    });

    socket.emit('server:lobby:tables', { tables: summarize(tables.list()) });

    // ---- Lobby --------------------------------------------------
    socket.on('client:lobby:list', (ack) => {
      ack({ tables: summarize(tables.list()) });
    });

    socket.on('client:lobby:join', async (payload, ack) => {
      try {
        const profile = await findPlayerById(socket.data.playerId);
        if (!profile || profile.status !== 'approved') {
          return ack({ ok: false, error: 'not_approved' });
        }
        // Test rooms are bootstrapped by the /admin/test-room endpoint
        // with the admin already seated. They never accept lobby joins.
        const target = tables.get(payload.tableId);
        if (target?.cfg.isTestRoom) {
          return ack({ ok: false, error: 'no_table' });
        }
        await tables.sitPlayer({
          tableId: payload.tableId,
          seatIndex: payload.seatIndex,
          playerId: profile.id,
          displayName: profile.displayName ?? profile.handle,
          avatarUrl: profile.avatarUrl ?? null,
        });
        socket.join(`table:${payload.tableId}`);
        ack({ ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        ack({ ok: false, error: msg });
      }
    });

    socket.on('client:table:leave', async (payload, ack) => {
      try {
        const table = tables.get(payload.tableId);
        if (!table) return ack({ ok: false, error: 'no_table' });
        const seat = [...table.seats.values()].find((s) => s.playerId === socket.data.playerId);
        if (!seat) return ack({ ok: false, error: 'not_seated' });
        await tables.leavePlayer({
          tableId: payload.tableId,
          seatIndex: seat.seatIndex,
          playerId: socket.data.playerId,
        });
        socket.leave(`table:${payload.tableId}`);
        ack({ ok: true });
      } catch (err) {
        ack({ ok: false, error: err instanceof Error ? err.message : 'unknown' });
      }
    });

    // ---- Table actions ------------------------------------------
    socket.on('client:table:action', (raw, ack) => {
      // Cheap DoS guard: a human plays at most a few actions per
      // second. Cap at 20/sec — well above realistic play but low
      // enough that a runaway/malicious client can't flood the engine
      // (which would burn CPU on legal-action validation on every
      // call). Server is authoritative on amounts and turn order, so
      // even bypassing this only buys the attacker dropped packets.
      if (!allowEvent('action', 20, 1000)) {
        return ack({ ok: false, error: 'rate_limited', code: 'rate_limited' });
      }
      const parsed = ActionSchema.safeParse(raw);
      if (!parsed.success) {
        return ack({ ok: false, error: 'bad_payload' });
      }
      const table = tables.get(parsed.data.tableId);
      if (!table) return ack({ ok: false, error: 'no_table' });
      const seat = [...table.seats.values()].find((s) => s.playerId === socket.data.playerId);
      if (!seat) return ack({ ok: false, error: 'not_seated' });
      const res = tables.applyAction({
        tableId: parsed.data.tableId,
        seatIndex: seat.seatIndex,
        action: parsed.data.action,
        clientActionId: parsed.data.clientActionId,
      });
      if (res.ok) ack(res);
      else ack({ ok: false, error: res.message, code: res.code });
    });

    // ---- Chat (rate-limited per socket, persisted to DB) --------
    const chatBuckets = new Map<string, number[]>();
    socket.on('client:table:chat', async (payload) => {
      const body = String(payload.body ?? '').trim().slice(0, 280);
      if (!body) return;
      const now = Date.now();
      const arr = chatBuckets.get(socket.id) ?? [];
      const recent = arr.filter((t) => now - t < 60_000);
      if (recent.length >= 60) return; // 60 msg / min cap
      recent.push(now);
      chatBuckets.set(socket.id, recent);

      const table = tables.get(payload.tableId);
      if (!table) return;
      const seat = [...table.seats.values()].find((s) => s.playerId === socket.data.playerId);
      const from = seat?.displayName ?? 'Spectator';

      // Persist before broadcasting so a refresh of the page replays the
      // same message. Best-effort: a DB hiccup must not block the chat.
      try {
        await pool.query(
          `insert into chat_messages (table_id, player_id, body) values ($1, $2, $3)`,
          [payload.tableId, socket.data.playerId, body],
        );
      } catch (err) {
        logger.warn({ err }, 'chat persist failed');
      }

      io.to(`table:${payload.tableId}`).emit('server:table:chat', {
        tableId: payload.tableId,
        seatIndex: seat?.seatIndex ?? null,
        from,
        body,
        at: now,
      });
    });

    // ---- Pause / resume -----------------------------------------
    socket.on('client:player:pause', (ack) => {
      const ok = tables.pausePlayer(socket.data.playerId);
      ack(ok ? { ok: true } : { ok: false, error: 'not_seated' });
    });
    socket.on('client:player:resume', (ack) => {
      const ok = tables.resumePlayer(socket.data.playerId);
      ack(ok ? { ok: true } : { ok: false, error: 'not_seated' });
    });

    // ---- Wallet requests (top-up + cashout) ------------------------
    //      Both directions go through the same chip_requests pipeline.
    //      Top-up: no chip movement at request time — admin approval
    //        is what grants the chips.
    //      Cashout: chips leave the wallet IMMEDIATELY (held in escrow
    //        via a cash_out_hold ledger row). If the admin rejects or
    //        the player cancels, the same amount comes back via a
    //        cash_out_refund row. Approval just confirms the hold —
    //        no further chip movement, unless the admin grants a
    //        smaller amount, in which case the unused part is refunded.
    async function handleWalletRequest(
      kind: 'topup' | 'cashout',
      payload: { amount?: number; message?: string } | undefined,
      ack: (
        res:
          | { ok: true; requestId: string }
          | { ok: false; error: string; code?: string },
      ) => void,
    ) {
      try {
        const amount = payload?.amount && payload.amount > 0
          ? Math.floor(payload.amount) : null;
        const message = typeof payload?.message === 'string'
          ? payload.message.trim().slice(0, 280) || null
          : null;

        // Cashout requires a concrete amount — we can't hold "some chips".
        if (kind === 'cashout' && !amount) {
          return ack({ ok: false, error: 'amount_required', code: 'amount_required' });
        }

        // One transaction so the held-chips deduction and the
        // chip_requests insert succeed or fail together.
        let requestId: string;
        let newChips: bigint | null = null;
        try {
          await withTx(async (c) => {
            // Re-check inside the tx so a concurrent request from the
            // same player can't slip past the guard.
            const open = await c.query<{ id: string }>(
              "select id from chip_requests where player_id = $1 and status = 'pending' for update",
              [socket.data.playerId],
            );
            if ((open.rowCount ?? 0) > 0) {
              throw new Error('already_pending');
            }

            const ins = await c.query<{ id: string }>(
              `insert into chip_requests (player_id, amount, message, kind)
               values ($1, $2, $3, $4) returning id`,
              [socket.data.playerId, amount, message, kind],
            );
            requestId = ins.rows[0]!.id;

            if (kind === 'cashout' && amount) {
              // Hold the chips. moveChipsInTx raises 'insufficient_chips'
              // if the wallet doesn't cover the amount — the whole tx
              // rolls back so the request row isn't created either.
              newChips = await moveChipsInTx(c, {
                playerId: socket.data.playerId,
                delta: -amount,
                reason: 'cash_out_hold',
                note: `cashout_hold:${requestId}`,
              });
            }
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          if (msg === 'already_pending') {
            return ack({ ok: false, error: 'already_pending', code: 'already_pending' });
          }
          if (msg === 'insufficient_chips') {
            return ack({ ok: false, error: 'insufficient_chips', code: 'insufficient_chips' });
          }
          throw err;
        }

        // Refresh the player profile + push the new wallet balance to
        // every open socket of this player so the lobby reflects the
        // hold immediately, then advertise the pending request itself.
        const profile = await findPlayerById(socket.data.playerId);
        if (kind === 'cashout' && newChips !== null && profile) {
          emitToPlayer(io, socket.data.playerId, 'server:account:chip_update', {
            chips: Number(newChips),
            delta: -(amount as number),
            reason: 'cash_out_hold',
          });
        }
        emitToPlayer(io, socket.data.playerId, 'server:account:wallet_request_update', {
          request: {
            id: requestId!,
            kind,
            amount,
            message,
            createdAt: Date.now(),
          },
        });

        // Telegram ping (fire-and-forget, no-op if not configured).
        if (profile) {
          void notifyTelegram(
            buildWalletRequestMessage({
              kind,
              handle: profile.handle,
              displayName: profile.displayName,
              amount,
              userMessage: message,
              createdAt: new Date(),
            }),
          );
        }
        ack({ ok: true, requestId: requestId! });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        logger.error({ err, kind, playerId: socket.data.playerId }, 'wallet_request failed');
        ack({ ok: false, error: msg });
      }
    }

    // Wallet-request endpoints already enforce "one pending per
    // player" server-side, but a low-burst-rate cap stops spam
    // before it hits the DB transaction. 3 attempts per 10 s is
    // generous for retries while blocking automated abuse.
    socket.on('client:player:chip_request', (payload, ack) => {
      if (!allowEvent('wallet_request', 3, 10_000)) {
        return ack({ ok: false, error: 'rate_limited', code: 'rate_limited' });
      }
      handleWalletRequest('topup', payload, ack);
    });
    socket.on('client:player:cashout_request', (payload, ack) => {
      if (!allowEvent('wallet_request', 3, 10_000)) {
        return ack({ ok: false, error: 'rate_limited', code: 'rate_limited' });
      }
      handleWalletRequest('cashout', payload, ack);
    });

    /**
     * Player withdraws their own pending wallet request. For a cashout
     * the held chips are refunded immediately (cash_out_refund); for a
     * topup nothing was held so the row just gets marked cancelled.
     * The request leaves the admin's pending queue either way.
     */
    socket.on('client:player:wallet_request_cancel', async (ack) => {
      try {
        let refund: { amount: number; newChips: bigint } | null = null;
        const result = await withTx(async (c) => {
          const row = await c.query<{
            id: string;
            kind: string;
            amount: string | null;
            status: string;
          }>(
            "select id, kind, amount, status from chip_requests where player_id = $1 and status = 'pending' for update limit 1",
            [socket.data.playerId],
          );
          if ((row.rowCount ?? 0) === 0) {
            return { found: false as const };
          }
          const r = row.rows[0]!;
          if (r.kind === 'cashout' && r.amount) {
            const held = Number(r.amount);
            const after = await moveChipsInTx(c, {
              playerId: socket.data.playerId,
              delta: held,
              reason: 'cash_out_refund',
              note: `cashout_cancelled:${r.id}`,
            });
            refund = { amount: held, newChips: after };
          }
          await c.query(
            "update chip_requests set status='cancelled', resolved_at=now() where id=$1",
            [r.id],
          );
          return { found: true as const };
        });

        if (!result.found) {
          return ack({ ok: false, error: 'no_pending_request' });
        }

        if (refund) {
          emitToPlayer(io, socket.data.playerId, 'server:account:chip_update', {
            chips: Number(refund.newChips),
            delta: refund.amount,
            reason: 'cash_out_refund',
          });
        }
        emitToPlayer(io, socket.data.playerId, 'server:account:wallet_request_update', {
          request: null,
        });
        ack({ ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        logger.error({ err, playerId: socket.data.playerId }, 'wallet_request_cancel failed');
        ack({ ok: false, error: msg });
      }
    });

    // ---- Mid-session top-up: pull from wallet to seat stack ---------
    socket.on('client:player:topup', async (payload, ack) => {
      const amount = Number((payload as { amount: number }).amount);
      const res = await tables.playerTopUp({
        playerId: socket.data.playerId,
        amount,
      });
      if (res.ok) {
        // Push the updated wallet balance to every open socket of this
        // player so the lobby / header chips display refreshes too.
        try {
          const fresh = await findPlayerById(socket.data.playerId);
          if (fresh) {
            emitToPlayer(io, socket.data.playerId, 'server:account:chip_update', {
              chips: fresh.chips,
              delta: -amount,
              reason: 'buy_in',
            });
          }
        } catch { /* non-fatal */ }
        ack({ ok: true, newStack: res.newStack });
      } else {
        ack({ ok: false, error: res.message, code: res.code });
      }
    });

    // ---- Reconnect markers --------------------------------------
    socket.on('disconnect', () => {
      // mark `isReconnecting` on the player's current seat
      for (const table of tables.list()) {
        const seat = [...table.seats.values()].find((s) => s.playerId === socket.data.playerId);
        if (seat) {
          seat.isReconnecting = true;
          tables['onStateChange']?.(table.cfg.tableId);
        }
      }
    });
  });

  // Wire engine → socket broadcasts
  tables.onStateChange = (tableId) => {
    broadcastTableState(io, tables, tableId);
    // Anyone on the lobby (or anywhere else, listener-driven) also needs
    // to see seated/inHand counts update live.
    io.emit('server:lobby:tables', { tables: summarize(tables.list()) });
  };
  tables.onHandResult = (tableId, result) => {
    io.to(`table:${tableId}`).emit('server:table:hand:result', {
      tableId,
      handId: result.handId,
      sidePots: result.sidePots,
      winners: result.winners,
      revealed: result.revealed,
      board: result.board,
    });
  };

  return io;
}

/**
 * Pushes an arbitrary event to every active socket of a specific player.
 * Used by admin endpoints to notify a player about account changes (chip
 * grants, ban, password reset) without waiting for the next refresh.
 */
export function emitToPlayer<E extends keyof ServerToClientEvents>(
  io: IOType,
  playerId: string,
  event: E,
  payload: Parameters<ServerToClientEvents[E]>[0],
): number {
  let count = 0;
  for (const socket of io.sockets.sockets.values()) {
    if ((socket as SocketType).data.playerId === playerId) {
      // @ts-expect-error — Socket.IO's typed-event overload is awkward
      socket.emit(event, payload);
      count += 1;
    }
  }
  return count;
}

/**
 * Forcibly disconnects every socket belonging to a player. Called after
 * the admin bans them so they're kicked out of any tables immediately.
 */
export function disconnectPlayer(io: IOType, playerId: string, reason: string): void {
  for (const socket of io.sockets.sockets.values()) {
    if ((socket as SocketType).data.playerId === playerId) {
      socket.emit('server:account:banned', { reason });
      socket.disconnect(true);
    }
  }
}

/**
 * Looks up the player's currently-open wallet request, if any. Returns
 * a shape suitable for the client UI; null when no pending request.
 */
async function fetchPendingRequest(playerId: string): Promise<PendingWalletRequest | null> {
  const r = await pool.query<{
    id: string;
    kind: 'topup' | 'cashout';
    amount: string | null;
    message: string | null;
    created_at: Date;
  }>(
    `select id, kind, amount, message, created_at
       from chip_requests
      where player_id = $1 and status = 'pending'
      order by created_at desc
      limit 1`,
    [playerId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  const row = r.rows[0]!;
  return {
    id: row.id,
    kind: row.kind,
    amount: row.amount === null ? null : Number(row.amount),
    message: row.message,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function summarize(list: PokerTable[]): TableSummary[] {
  return list
    // Test rooms never appear in the player-facing lobby — admins reach
    // them via the admin dashboard's "Test Room" shortcut.
    .filter((t) => !t.cfg.isTestRoom)
    .map((t) => ({
      id: t.cfg.tableId,
      name: t.cfg.name,
      smallBlind: t.cfg.smallBlind,
      bigBlind: t.cfg.bigBlind,
      buyIn: t.cfg.buyIn,
      seated: t.seats.size,
      maxPlayers: t.cfg.maxPlayers,
      inHand: t.phase !== 'waiting',
    }));
}

async function findCurrentSeat(
  socket: SocketType,
  tables: TableManager,
): Promise<{ tableId: string } | null> {
  for (const t of tables.list()) {
    for (const s of t.seats.values()) {
      if (s.playerId === socket.data.playerId) {
        s.isReconnecting = false;
        return { tableId: t.cfg.tableId };
      }
    }
  }
  return null;
}

function broadcastTableState(io: IOType, tables: TableManager, tableId: string): void {
  const table = tables.get(tableId);
  if (!table) return;
  // For each connected socket in the room, send the personalized view.
  const room = io.sockets.adapter.rooms.get(`table:${tableId}`);
  if (!room) return;
  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId) as SocketType | undefined;
    if (!socket) continue;
    const seat = [...table.seats.values()].find((s) => s.playerId === socket.data.playerId);
    socket.emit('server:table:state', table.publicViewFor(seat?.seatIndex ?? null));
  }
}

function emitTableState(io: IOType, tables: TableManager, tableId: string, socket: SocketType): void {
  const table = tables.get(tableId);
  if (!table) return;
  const seat = [...table.seats.values()].find((s) => s.playerId === socket.data.playerId);
  socket.emit('server:table:state', table.publicViewFor(seat?.seatIndex ?? null));
}

export type { IOType };
