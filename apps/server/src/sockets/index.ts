import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { isSessionActive, touchSession, verifyPlayerToken } from '../auth/sessions.js';
import { findPlayerById } from '../auth/players.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  TableSummary,
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

    if (profile.status === 'banned') {
      socket.emit('server:hello', { status: 'banned', reason: null });
      return socket.disconnect();
    }
    if (profile.status === 'pending') {
      socket.emit('server:hello', { status: 'pending' });
      return;
    }

    socket.emit('server:hello', {
      status: 'approved',
      playerId: profile.id,
      displayName: profile.displayName ?? profile.handle,
      chips: profile.chips,
      isAdmin: false,
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
        await tables.sitPlayer({
          tableId: payload.tableId,
          seatIndex: payload.seatIndex,
          playerId: profile.id,
          displayName: profile.displayName ?? profile.handle,
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

    // ---- Chat (rate-limited per socket) -------------------------
    const chatBuckets = new Map<string, number[]>();
    socket.on('client:table:chat', (payload) => {
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
      io.to(`table:${payload.tableId}`).emit('server:table:chat', {
        tableId: payload.tableId,
        seatIndex: seat?.seatIndex ?? null,
        from: seat?.displayName ?? 'Spectator',
        body,
        at: now,
      });
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

function summarize(list: PokerTable[]): TableSummary[] {
  return list.map((t) => ({
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
