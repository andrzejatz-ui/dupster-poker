import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  createPendingPlayer,
  findPlayerByHandleWithPassword,
  findPlayerById,
} from './players.js';
import { createSession, signAdminToken, signPlayerToken } from './sessions.js';
import { requirePlayer, type PlayerRequest } from './middleware.js';
import { pool } from '../db/client.js';
import type { TableManager } from '../rooms/tableManager.js';
import { PokerTable } from '../poker/engine.js';
import { config } from '../config.js';
import { buildSignupMessage, notifyTelegram } from '../utils/telegram.js';
import { logAdminAction, verifyAdminLogin } from './admin.js';
import { logger } from '../utils/logger.js';

export function authRouter(tables: TableManager): Router {
  const r = Router();

  const joinLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  /**
   * Combined login + registration. Player submits handle + password:
   *
   *  - Handle does not exist           → create pending row with this password (202 pending)
   *  - Handle exists, no password yet  → 409 'password_not_set' (admin must set it via /admin)
   *  - Handle exists, password mismatch → 401 'invalid_credentials'
   *  - Handle exists, password matches:
   *      banned   → 403
   *      pending  → 202 pending
   *      approved → 200 + session token
   */
  r.post('/join', joinLimiter, async (req, res) => {
    const Body = z.object({
      playerHandle: z.string().min(2).max(40).trim(),
      password: z.string().min(4).max(128),
      displayName: z.string().max(40).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });

    // Try admin credentials first — the same login form serves both
    // player and admin sign-in, so a matching admin username + password
    // wins over the player flow. Admins never accidentally create a
    // pending player row because their handle resolves to an admin
    // record before findPlayerByHandleWithPassword runs.
    const adminMatch = await verifyAdminLogin(
      parsed.data.playerHandle,
      parsed.data.password,
    );
    if (adminMatch) {
      const adminToken = signAdminToken(adminMatch.id);
      await pool.query('update admins set last_login_at = now() where id = $1', [
        adminMatch.id,
      ]);
      await logAdminAction({
        adminId: adminMatch.id,
        action: 'login',
        payload: { via: 'unified_login', ip: req.ip ?? null },
      });
      return res.json({
        status: 'admin',
        adminToken,
        admin: { id: adminMatch.id, username: adminMatch.username },
      });
    }

    let row = await findPlayerByHandleWithPassword(parsed.data.playerHandle);

    if (!row) {
      const created = await createPendingPlayer({
        handle: parsed.data.playerHandle,
        password: parsed.data.password,
        displayName: parsed.data.displayName ?? null,
      });
      // Fire-and-forget Telegram ping so the admin gets a one-click
      // link straight to the dashboard. Silent no-op if not configured.
      void notifyTelegram(
        buildSignupMessage({
          handle: created.handle,
          displayName: created.displayName,
          createdAt: new Date(),
        }),
      );
      return res
        .status(202)
        .json({ status: 'pending', handle: created.handle });
    }

    if (row.password === null) {
      return res.status(409).json({
        status: 'password_not_set',
        message: 'Ask the admin to set a password for this Player ID.',
      });
    }

    if (row.password !== parsed.data.password) {
      return res.status(401).json({ status: 'invalid_credentials' });
    }

    if (row.status === 'banned') {
      return res.status(403).json({ status: 'banned' });
    }
    if (row.status === 'pending') {
      return res.status(202).json({ status: 'pending', handle: row.handle });
    }

    // approved → mint session
    const ip = req.ip ?? null;
    const ua = req.header('user-agent') ?? null;
    const tempToken = signPlayerToken(row.id, 'pending');
    const sessionId = await createSession({
      playerId: row.id,
      token: tempToken,
      ip,
      userAgent: ua,
    });
    const token = signPlayerToken(row.id, sessionId);
    const fresh = await findPlayerById(row.id);
    res.json({
      status: 'approved',
      token,
      profile: {
        id: row.id,
        handle: row.handle,
        displayName: row.displayName,
        avatarUrl: fresh?.avatarUrl ?? null,
        chips: row.chips,
      },
    });
  });

  /**
   * GET /auth/me — re-fetches the live profile (avatar + chips + display
   * name + status). Used by the UI after a profile update or socket
   * reconnect, so the in-memory state doesn't drift from the DB.
   */
  r.get('/me', requirePlayer, async (req: PlayerRequest, res) => {
    const p = await findPlayerById(req.playerId!);
    if (!p) return res.status(404).json({ error: 'not_found' });
    // A player is "an admin's alter ego" iff an admins row carries
    // linked_player_id pointing at them. This is the ONLY reliable
    // server-side check for whether the current session belongs to
    // an admin — sessionStorage-based admin tokens can leak between
    // browser sessions on the same device.
    const adminLink = await pool.query<{ id: string }>(
      'select id from admins where linked_player_id = $1 limit 1',
      [req.playerId],
    );
    res.json({
      id: p.id,
      handle: p.handle,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl ?? null,
      chips: p.chips,
      status: p.status,
      isAdmin: (adminLink.rowCount ?? 0) > 0,
    });
  });

  /**
   * POST /auth/profile — player updates their own profile. Currently
   * only the avatar is editable. Payload accepts a 'data:image/...'
   * URL up to ~70 KB (a 128×128 JPEG comfortably fits) or null to
   * clear the avatar. Stored in players.avatar_url and pushed live
   * to any tables the player is currently seated at.
   */
  r.post('/profile', requirePlayer, async (req: PlayerRequest, res) => {
    const Body = z.object({
      avatarUrl: z
        .string()
        .max(70_000, 'avatar_too_large')
        .nullable()
        .optional(),
      displayName: z.string().max(40).nullable().optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });

    if (
      parsed.data.avatarUrl &&
      !parsed.data.avatarUrl.startsWith('data:image/')
    ) {
      return res.status(400).json({ error: 'avatar_must_be_data_url' });
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    if (parsed.data.avatarUrl !== undefined) {
      updates.push(`avatar_url = $${updates.length + 2}`);
      params.push(parsed.data.avatarUrl);
    }
    if (parsed.data.displayName !== undefined) {
      updates.push(`display_name = $${updates.length + 2}`);
      params.push(parsed.data.displayName);
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'nothing_to_update' });
    }

    await pool.query(
      `update players set ${updates.join(', ')} where id = $1`,
      [req.playerId!, ...params],
    );

    if (parsed.data.avatarUrl !== undefined) {
      tables.updatePlayerAvatar(req.playerId!, parsed.data.avatarUrl ?? null);
    }

    const fresh = await findPlayerById(req.playerId!);
    res.json({
      profile: {
        id: fresh!.id,
        handle: fresh!.handle,
        displayName: fresh!.displayName,
        avatarUrl: fresh!.avatarUrl ?? null,
        chips: fresh!.chips,
      },
    });
  });

  /**
   * Player-facing bot training room. Same is_test_room=true semantic
   * as the admin /admin/test-room endpoint — sit_player and
   * leave_player both skip the wallet move for sandbox tables, so
   * playing against bots can NEVER mint or drain real wallet chips.
   *
   * Rate-limited to one room per minute per player so a malicious
   * client can't spawn dozens of in-memory tables. Bots are seeded
   * fresh on every call; the underlying table row sets created_by
   * to NULL because players aren't admins.
   */
  const botTrainingLimiter = rateLimit({
    windowMs: 60_000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
  });
  r.post('/test-bots', botTrainingLimiter, requirePlayer, async (req: PlayerRequest, res) => {
    const Body = z.object({
      maxPlayers: z.number().int().min(2).max(10).default(6),
      smallBlind: z.number().int().positive().default(50),
      bigBlind: z.number().int().positive().default(100),
      buyIn: z.number().int().positive().default(10000),
    });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });
    const { maxPlayers, smallBlind, bigBlind, buyIn } = parsed.data;
    if (bigBlind <= smallBlind) {
      return res.status(400).json({ error: 'big_blind_must_exceed_small' });
    }

    try {
      // Kick the player out of any prior sandbox table so we don't
      // accumulate orphan seats. Cash-game seats are preserved.
      const seatRow = await pool.query<{
        table_id: string;
        seat_index: number;
        is_test_room: boolean;
      }>(
        `select s.table_id, s.seat_index,
                coalesce(t.is_test_room, false) as is_test_room
           from table_seats s
           left join tables t on t.id = s.table_id
          where s.player_id = $1`,
        [req.playerId],
      );
      if ((seatRow.rowCount ?? 0) > 0 && seatRow.rows[0]!.is_test_room) {
        try {
          await tables.leavePlayer({
            tableId: seatRow.rows[0]!.table_id,
            seatIndex: seatRow.rows[0]!.seat_index,
            playerId: req.playerId!,
          });
        } catch { /* best-effort */ }
      }

      // tables.created_by references admins(id); players aren't
      // admins so the FK requires NULL here. is_test_room=true is
      // the only flag that matters — it drives the sandbox sit/leave
      // chip logic in tableManager.
      const ins = await pool.query<{ id: string }>(
        `insert into tables
           (name, small_blind, big_blind, buy_in, max_players,
            allow_spectators, created_by, is_test_room)
         values ($1,$2,$3,$4,$5,false,null,true) returning id`,
        [
          `Bot Training · ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
          smallBlind, bigBlind, buyIn, maxPlayers,
        ],
      );
      const tableId = ins.rows[0]!.id;

      tables.addTable(new PokerTable({
        tableId,
        name: 'Bot Training',
        smallBlind,
        bigBlind,
        buyIn,
        maxPlayers,
        allowSpectators: false,
        turnTimerMs: config.TURN_TIMER_MS,
        isTestRoom: true,
        maxBuyIn: buyIn * config.MAX_BUY_IN_MULTIPLIER,
      }, config.SESSION_SECRET));

      const me = await findPlayerById(req.playerId!);
      if (!me) return res.status(404).json({ error: 'player_vanished' });

      await tables.sitPlayer({
        tableId,
        seatIndex: 0,
        playerId: me.id,
        displayName: me.displayName ?? me.handle,
        avatarUrl: me.avatarUrl ?? null,
        defer: true,
      });
      for (let i = 1; i < maxPlayers; i++) {
        tables.sitBot({ tableId, seatIndex: i, defer: true });
      }
      tables.beginPlay(tableId);

      res.json({ tableId });
    } catch (err) {
      logger.error({ err, playerId: req.playerId }, 'test-bots creation failed');
      const msg = err instanceof Error ? err.message : 'unknown';
      res.status(500).json({ error: msg });
    }
  });

  return r;
}
