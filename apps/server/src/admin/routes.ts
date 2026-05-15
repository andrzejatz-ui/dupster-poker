import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { pool } from '../db/client.js';
import { moveChips } from '../db/chips.js';
import {
  logAdminAction,
  verifyAdminLogin,
} from '../auth/admin.js';
import {
  createSession,
  revokeAllPlayerSessions,
  revokeSession,
  signAdminToken,
  signPlayerToken,
} from '../auth/sessions.js';
import { findPlayerByHandle } from '../auth/players.js';
import { requireAdmin, type AdminRequest } from '../middleware/adminAuth.js';
import { config } from '../config.js';
import type { TableManager } from '../rooms/tableManager.js';
import { PokerTable } from '../poker/engine.js';

export function adminRouter(tables: TableManager): Router {
  const r = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  });

  r.post('/login', loginLimiter, async (req, res) => {
    const Body = z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });
    const result = await verifyAdminLogin(parsed.data.username, parsed.data.password);
    if (!result) return res.status(401).json({ error: 'invalid_credentials' });
    const token = signAdminToken(result.id);
    res.json({ token, admin: { id: result.id, username: result.username } });
  });

  /* ---- Admin "play" shortcut ------------------------------------- */
  /**
   * Issues a player session for the admin so they can join a table from
   * the same browser. Creates the player on demand, forces approved, and
   * optionally grants chips on first creation. Logged in admin_log.
   *
   * Auth gate is requireAdmin — only an authenticated admin can mint
   * arbitrary player sessions, which is no more powerful than the
   * existing approve+grant chains they already control.
   */
  r.post('/play', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({
      playerHandle: z.string().min(2).max(40).trim(),
      displayName: z.string().max(40).optional(),
      initialChips: z.number().int().min(0).max(10_000_000).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });

    const handle = parsed.data.playerHandle;
    let player = await findPlayerByHandle(handle);
    let created = false;

    if (!player) {
      const ins = await pool.query<{ id: string }>(
        `insert into players (player_handle, display_name, status, chips, approved_at, approved_by)
         values ($1, $2, 'approved', 0, now(), $3) returning id`,
        [handle, parsed.data.displayName ?? null, req.adminId],
      );
      created = true;
      player = await findPlayerByHandle(handle);
      if (!player) return res.status(500).json({ error: 'create_failed' });
    } else if (player.status !== 'approved') {
      await pool.query(
        `update players set status='approved', approved_at=now(), approved_by=$2,
           banned_at=null, banned_reason=null where id=$1`,
        [player.id, req.adminId],
      );
      player = await findPlayerByHandle(handle);
      if (!player) return res.status(500).json({ error: 'reapprove_failed' });
    }

    // Only grant chips when explicitly requested AND balance is empty,
    // to avoid accidental repeated top-ups when admin clicks Play twice.
    if (parsed.data.initialChips && player.chips === 0) {
      await moveChips({
        playerId: player.id,
        delta: parsed.data.initialChips,
        reason: 'admin_grant',
        adminId: req.adminId,
        note: 'admin self-grant via /admin/play',
      });
      player = await findPlayerByHandle(handle);
      if (!player) return res.status(500).json({ error: 'grant_failed' });
    }

    // Mint a player session. Same two-step "temp token to get sid, then
    // sign real token with sid" trick as /auth/join.
    const tempToken = signPlayerToken(player.id, 'pending');
    const sessionId = await createSession({
      playerId: player.id,
      token: tempToken,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
    const token = signPlayerToken(player.id, sessionId);

    await logAdminAction({
      adminId: req.adminId!,
      action: 'admin_play',
      targetPlayerId: player.id,
      payload: { handle, created, initialChips: parsed.data.initialChips ?? 0 },
    });

    res.json({
      token,
      profile: {
        id: player.id,
        handle: player.handle,
        displayName: player.displayName,
        chips: player.chips,
      },
    });
  });

  /* ---- Players --------------------------------------------------- */

  r.get('/players', requireAdmin, async (req, res) => {
    const status = (req.query.status as string | undefined) ?? null;
    const q = status
      ? await pool.query(
          `select id, player_handle, display_name, status, chips, created_at, approved_at, banned_at
             from players where status = $1 order by created_at desc limit 200`,
          [status],
        )
      : await pool.query(
          `select id, player_handle, display_name, status, chips, created_at, approved_at, banned_at
             from players order by created_at desc limit 200`,
        );
    res.json({ players: q.rows });
  });

  r.post('/players', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({
      playerHandle: z.string().min(2).max(40),
      displayName: z.string().max(40).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });
    const row = await pool.query(
      `insert into players (player_handle, display_name, status, chips)
       values ($1, $2, 'pending', 0)
       on conflict (player_handle) do nothing
       returning id`,
      [parsed.data.playerHandle, parsed.data.displayName ?? null],
    );
    if (row.rowCount === 0) return res.status(409).json({ error: 'handle_exists' });
    await logAdminAction({
      adminId: req.adminId!,
      action: 'create_player',
      targetPlayerId: row.rows[0]!.id,
      payload: parsed.data,
    });
    res.json({ id: row.rows[0]!.id });
  });

  r.post('/players/:id/approve', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({
      initialChips: z.number().int().min(0).optional(),
    });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });
    const id = req.params.id;
    const upd = await pool.query(
      `update players set status='approved', approved_at=now(), approved_by=$2
         where id = $1 and status != 'approved' returning chips`,
      [id, req.adminId],
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'not_found_or_already_approved' });

    if (parsed.data.initialChips && parsed.data.initialChips > 0) {
      await moveChips({
        playerId: id,
        delta: parsed.data.initialChips,
        reason: 'admin_grant',
        adminId: req.adminId,
        note: 'initial grant on approval',
      });
    }
    await logAdminAction({
      adminId: req.adminId!,
      action: 'approve_player',
      targetPlayerId: id,
      payload: parsed.data,
    });
    res.json({ ok: true });
  });

  r.post('/players/:id/reject', requireAdmin, async (req: AdminRequest, res) => {
    await pool.query(
      `update players set status='banned', banned_at=now(),
         banned_reason='rejected on intake'
         where id = $1`,
      [req.params.id],
    );
    await revokeAllPlayerSessions(req.params.id!);
    await logAdminAction({ adminId: req.adminId!, action: 'reject_player', targetPlayerId: req.params.id });
    res.json({ ok: true });
  });

  r.post('/players/:id/ban', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({ reason: z.string().max(200).optional() });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });
    await pool.query(
      `update players set status='banned', banned_at=now(), banned_reason=$2
         where id = $1`,
      [req.params.id, parsed.data.reason ?? null],
    );
    await revokeAllPlayerSessions(req.params.id!);
    await logAdminAction({
      adminId: req.adminId!,
      action: 'ban_player',
      targetPlayerId: req.params.id,
      reason: parsed.data.reason ?? null,
    });
    res.json({ ok: true });
  });

  r.post('/players/:id/unban', requireAdmin, async (req: AdminRequest, res) => {
    await pool.query(
      `update players set status='approved', banned_at=null, banned_reason=null
         where id = $1 and status = 'banned'`,
      [req.params.id],
    );
    await logAdminAction({ adminId: req.adminId!, action: 'unban_player', targetPlayerId: req.params.id });
    res.json({ ok: true });
  });

  r.post('/players/:id/chips', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({
      delta: z.number().int(),
      reason: z.enum(['admin_grant', 'admin_revoke']),
      note: z.string().max(200).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });
    try {
      const after = await moveChips({
        playerId: req.params.id!,
        delta: parsed.data.delta,
        reason: parsed.data.reason,
        adminId: req.adminId,
        note: parsed.data.note ?? null,
      });
      await logAdminAction({
        adminId: req.adminId!,
        action: 'chip_move',
        targetPlayerId: req.params.id!,
        payload: parsed.data,
      });
      res.json({ balance: after.toString() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      res.status(400).json({ error: msg });
    }
  });

  r.post('/players/:id/chips/set', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({
      value: z.number().int().min(0),
      note: z.string().max(200).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });
    const cur = await pool.query<{ chips: string }>('select chips from players where id = $1', [req.params.id]);
    if (cur.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    const delta = parsed.data.value - Number(cur.rows[0]!.chips);
    const after = await moveChips({
      playerId: req.params.id!,
      delta,
      reason: 'admin_set',
      adminId: req.adminId,
      note: parsed.data.note ?? null,
    });
    await logAdminAction({
      adminId: req.adminId!,
      action: 'chip_set',
      targetPlayerId: req.params.id,
      payload: parsed.data,
    });
    res.json({ balance: after.toString() });
  });

  r.post('/players/:id/concurrency', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({ allow: z.boolean() });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });
    await pool.query(
      'update players set allow_concurrent_sessions = $2 where id = $1',
      [req.params.id, parsed.data.allow],
    );
    await logAdminAction({
      adminId: req.adminId!,
      action: 'set_concurrency',
      targetPlayerId: req.params.id,
      payload: parsed.data,
    });
    res.json({ ok: true });
  });

  r.get('/players/:id/sessions', requireAdmin, async (req, res) => {
    const r = await pool.query(
      `select id, ip, user_agent, created_at, last_seen_at
         from sessions where player_id = $1 and revoked_at is null
        order by last_seen_at desc`,
      [req.params.id],
    );
    res.json({ sessions: r.rows });
  });

  r.post('/sessions/:id/revoke', requireAdmin, async (req: AdminRequest, res) => {
    await revokeSession(req.params.id!);
    await logAdminAction({ adminId: req.adminId!, action: 'revoke_session', payload: { sessionId: req.params.id } });
    res.json({ ok: true });
  });

  /* ---- Tables --------------------------------------------------- */

  r.get('/tables', requireAdmin, async (_req, res) => {
    const q = await pool.query(`select id, name, small_blind, big_blind, buy_in, max_players,
      allow_spectators, archived_at from tables order by created_at desc`);
    res.json({ tables: q.rows });
  });

  r.post('/tables', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({
      name: z.string().min(1).max(60),
      smallBlind: z.number().int().positive(),
      bigBlind: z.number().int().positive(),
      buyIn: z.number().int().positive(),
      maxPlayers: z.number().int().min(2).max(9),
      allowSpectators: z.boolean().default(false),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });
    if (parsed.data.bigBlind <= parsed.data.smallBlind)
      return res.status(400).json({ error: 'big_blind_must_exceed_small' });
    if (parsed.data.buyIn < parsed.data.bigBlind * config.MIN_BUY_IN_MULTIPLIER)
      return res.status(400).json({ error: 'buy_in_too_low' });

    const ins = await pool.query<{ id: string }>(
      `insert into tables (name, small_blind, big_blind, buy_in, max_players, allow_spectators, created_by)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [
        parsed.data.name,
        parsed.data.smallBlind,
        parsed.data.bigBlind,
        parsed.data.buyIn,
        parsed.data.maxPlayers,
        parsed.data.allowSpectators,
        req.adminId,
      ],
    );
    const id = ins.rows[0]!.id;
    tables.addTable(
      new PokerTable({
        tableId: id,
        name: parsed.data.name,
        smallBlind: parsed.data.smallBlind,
        bigBlind: parsed.data.bigBlind,
        buyIn: parsed.data.buyIn,
        maxPlayers: parsed.data.maxPlayers,
        allowSpectators: parsed.data.allowSpectators,
        turnTimerMs: config.TURN_TIMER_MS,
      }),
    );
    await logAdminAction({
      adminId: req.adminId!,
      action: 'create_table',
      targetTableId: id,
      payload: parsed.data,
    });
    res.json({ id });
  });

  r.post('/tables/:id/archive', requireAdmin, async (req: AdminRequest, res) => {
    await pool.query('update tables set archived_at = now() where id = $1', [req.params.id]);
    await logAdminAction({ adminId: req.adminId!, action: 'archive_table', targetTableId: req.params.id });
    res.json({ ok: true });
  });

  /* ---- Audit / Ledger ------------------------------------------- */

  r.get('/audit', requireAdmin, async (req, res) => {
    const r = await pool.query(
      `select id, admin_id, action, target_player_id, target_table_id, payload, reason, created_at
         from admin_log order by created_at desc limit 500`,
    );
    res.json({ entries: r.rows });
  });

  r.get('/ledger', requireAdmin, async (req, res) => {
    const playerId = req.query.playerId as string | undefined;
    const q = playerId
      ? await pool.query(
          `select id, delta, balance_after, reason, ref_table_id, ref_hand_id, admin_id, note, created_at
             from chip_ledger where player_id = $1 order by created_at desc limit 200`,
          [playerId],
        )
      : await pool.query(
          `select id, player_id, delta, balance_after, reason, ref_table_id, ref_hand_id, admin_id, note, created_at
             from chip_ledger order by created_at desc limit 200`,
        );
    res.json({ entries: q.rows });
  });

  return r;
}
