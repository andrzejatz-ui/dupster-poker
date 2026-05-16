import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { pool, withTx } from '../db/client.js';
import { adminAddChipsToSeat, moveChips } from '../db/chips.js';
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
import { findPlayerByHandle, findPlayerById } from '../auth/players.js';
import { requireAdmin, type AdminRequest } from '../middleware/adminAuth.js';
import { config } from '../config.js';
import type { TableManager } from '../rooms/tableManager.js';
import { PokerTable } from '../poker/engine.js';
import { disconnectPlayer, emitToPlayer, type IOType } from '../sockets/index.js';
import { logger } from '../utils/logger.js';

/**
 * Resolves the player identity tied to this admin. If admins.linked_player_id
 * is set, returns that player (renaming it if `requestedHandle` differs).
 * Otherwise finds the existing player with the requested handle, or
 * creates a new one. Either way, sets admins.linked_player_id so all
 * future shortcuts return the SAME player — no more accidental
 * duplicate accounts when the admin tweaks their play_handle.
 *
 * Throws 'handle_taken' if a rename would collide with another player's
 * unique handle. Caller maps that to a 409.
 */
async function getOrLinkAdminPlayer(args: {
  adminId: string;
  requestedHandle: string;
  displayName: string | null;
}): Promise<{ id: string; handle: string; displayName: string | null; avatarUrl: string | null; chips: number; status: string }> {
  const adminRow = await pool.query<{ linked_player_id: string | null }>(
    'select linked_player_id from admins where id = $1',
    [args.adminId],
  );
  const linkedId = adminRow.rows[0]?.linked_player_id ?? null;

  // Case 1: admin already has a linked player.
  if (linkedId) {
    const linked = await findPlayerById(linkedId);
    if (linked) {
      // Rename if the play_handle has drifted from what this player is
      // stored as. Catches handle collisions cleanly.
      if (linked.handle !== args.requestedHandle) {
        try {
          await pool.query(
            'update players set player_handle = $1 where id = $2',
            [args.requestedHandle, linkedId],
          );
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === '23505') throw new Error('handle_taken');
          throw err;
        }
      }
      // Make sure the linked player is approved + not soft-deleted.
      await pool.query(
        `update players set
           status='approved', approved_at=now(), approved_by=$2,
           banned_at=null, banned_reason=null, deleted_at=null
         where id=$1`,
        [linkedId, args.adminId],
      );
      const fresh = await findPlayerById(linkedId);
      if (!fresh) throw new Error('linked_player_vanished');
      return fresh;
    }
    // Linked row pointed to a player that's been hard-deleted — fall
    // through to the "no link" path which will re-link cleanly.
  }

  // Case 2: no link yet. Upsert by handle so a previously soft-deleted
  // row with this handle gets resurrected; brand-new handles get a
  // fresh row.
  await pool.query(
    `insert into players (player_handle, display_name, status, chips, approved_at, approved_by)
     values ($1, $2, 'approved', 0, now(), $3)
     on conflict (player_handle) do update set
       status='approved', approved_at=now(),
       approved_by=excluded.approved_by,
       banned_at=null, banned_reason=null, deleted_at=null`,
    [args.requestedHandle, args.displayName, args.adminId],
  );
  const fresh = await findPlayerByHandle(args.requestedHandle);
  if (!fresh) throw new Error('create_failed');

  // Bind the admin to this player forever (or until the admin row is
  // wiped). Future /admin/play calls reuse this row.
  await pool.query(
    'update admins set linked_player_id = $1 where id = $2',
    [fresh.id, args.adminId],
  );
  return fresh;
}

export function adminRouter(tables: TableManager, io: IOType): Router {
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

    // Emergency override: if MASTER_KEY is set and the supplied password
    // matches it, log in as the bootstrap admin regardless of which
    // username was typed. Lets you recover when the env-stored
    // BOOTSTRAP_ADMIN_PASSWORD drifted from what you remember.
    if (config.MASTER_KEY && parsed.data.password === config.MASTER_KEY) {
      const r = await pool.query<{ id: string; username: string }>(
        'select id, username from admins where username = $1',
        [config.BOOTSTRAP_ADMIN_USERNAME],
      );
      if ((r.rowCount ?? 0) > 0) {
        const a = r.rows[0]!;
        await pool.query('update admins set last_login_at = now() where id = $1', [a.id]);
        const token = signAdminToken(a.id);
        await logAdminAction({
          adminId: a.id,
          action: 'master_key_login',
          payload: { ip: req.ip ?? null },
        });
        return res.json({ token, admin: { id: a.id, username: a.username } });
      }
    }

    const result = await verifyAdminLogin(parsed.data.username, parsed.data.password);
    if (!result) return res.status(401).json({ error: 'invalid_credentials' });
    const token = signAdminToken(result.id);
    res.json({ token, admin: { id: result.id, username: result.username } });
  });

  /* ---- Admin profile / settings ---------------------------------- */

  r.get('/me', requireAdmin, async (req: AdminRequest, res) => {
    const q = await pool.query<{
      id: string;
      username: string;
      play_handle: string | null;
      play_chips: string;
    }>(
      'select id, username, play_handle, play_chips from admins where id = $1',
      [req.adminId],
    );
    if (q.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    const row = q.rows[0]!;
    res.json({
      id: row.id,
      username: row.username,
      playHandle: row.play_handle,
      playChips: Number(row.play_chips ?? 10000),
    });
  });

  /**
   * Updates the admin's own play preferences. Once set, the Play
   * shortcut goes straight to the lobby without asking for a handle
   * each time. Stored on the admins row so it follows the admin across
   * browsers.
   */
  r.post('/me', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({
      playHandle: z.string().min(2).max(40).nullable().optional(),
      playChips: z.number().int().min(0).max(10_000_000).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });

    const updates: string[] = [];
    const params: unknown[] = [];
    if (parsed.data.playHandle !== undefined) {
      updates.push(`play_handle = $${updates.length + 2}`);
      params.push(parsed.data.playHandle);
    }
    if (parsed.data.playChips !== undefined) {
      updates.push(`play_chips = $${updates.length + 2}`);
      params.push(parsed.data.playChips);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'nothing_to_update' });

    // If the admin renames their play_handle AND already has a linked
    // player, propagate the rename to that player so they keep one
    // identity instead of stranding an old player and creating a new
    // one on the next /admin/play.
    if (parsed.data.playHandle !== undefined && parsed.data.playHandle !== null) {
      const link = await pool.query<{ linked_player_id: string | null }>(
        'select linked_player_id from admins where id = $1',
        [req.adminId],
      );
      const linkedId = link.rows[0]?.linked_player_id ?? null;
      if (linkedId) {
        try {
          await pool.query(
            'update players set player_handle = $1 where id = $2',
            [parsed.data.playHandle, linkedId],
          );
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === '23505') {
            return res.status(409).json({ error: 'handle_taken' });
          }
          throw err;
        }
      }
    }

    await pool.query(
      `update admins set ${updates.join(', ')} where id = $1`,
      [req.adminId, ...params],
    );
    res.json({ ok: true });
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
      playerHandle: z.string().min(2).max(40).trim().optional(),
      displayName: z.string().max(40).optional(),
      initialChips: z.number().int().min(0).max(10_000_000).optional(),
    });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });

    // Fall back to the admin's saved defaults so the front-end can hit
    // /admin/play with an empty body once the admin has stored a play
    // handle in /admin/me.
    let handle = parsed.data.playerHandle;
    let initialChips = parsed.data.initialChips;
    if (!handle || initialChips === undefined) {
      const me = await pool.query<{ play_handle: string | null; play_chips: string | null }>(
        'select play_handle, play_chips from admins where id = $1',
        [req.adminId],
      );
      if ((me.rowCount ?? 0) > 0) {
        handle = handle || (me.rows[0]!.play_handle ?? undefined);
        if (initialChips === undefined) {
          initialChips = Number(me.rows[0]!.play_chips ?? 10000);
        }
      }
    }
    if (!handle) return res.status(400).json({ error: 'no_handle_configured' });

    // Single player per admin: linked via admins.linked_player_id.
    // First call creates + links; later calls return the same row,
    // even if play_handle has been tweaked in /admin/me since.
    type AdminPlayer = Awaited<ReturnType<typeof getOrLinkAdminPlayer>>;
    let player: AdminPlayer;
    try {
      player = await getOrLinkAdminPlayer({
        adminId: req.adminId!,
        requestedHandle: handle,
        displayName: parsed.data.displayName ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      if (msg === 'handle_taken') {
        return res.status(409).json({ error: 'handle_taken' });
      }
      logger.error({ err, adminId: req.adminId }, 'admin_play link failed');
      return res.status(500).json({ error: msg });
    }
    const created = false; // linked-player path never "creates" a fresh row from the caller's POV

    // Only grant chips when a positive amount was requested AND the
    // balance is empty, to avoid accidental repeated top-ups when admin
    // clicks Play twice.
    if (initialChips && initialChips > 0 && player.chips === 0) {
      await moveChips({
        playerId: player.id,
        delta: initialChips,
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
      payload: { handle, created, initialChips: initialChips ?? 0 },
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

  /* ---- Test room (admin-only sandbox with bot opponents) --------- */

  /**
   * One-click spin-up of a private bot table. Creates a fresh `tables`
   * row flagged `is_test_room=true` (hidden from the public lobby),
   * seats the admin's player at seat 0 via a real buy-in (we top them
   * up if needed), and fills the rest of the seats with in-memory
   * bots. Returns the player token + tableId so the front-end can stash
   * the session and navigate straight to /table/<id>. Test rooms are
   * archived on every server boot — they're disposable by design.
   */
  r.post('/test-room', requireAdmin, async (req: AdminRequest, res) => {
    try {
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

    // Resolve the admin's play handle (mint the player if needed). We
    // mirror /admin/play's logic so the same admin can have a single
    // play-handle that's reused across both shortcuts.
    const meRow = await pool.query<{ play_handle: string | null }>(
      'select play_handle from admins where id = $1',
      [req.adminId],
    );
    const handle = meRow.rows[0]?.play_handle ?? null;
    if (!handle) return res.status(400).json({ error: 'no_handle_configured' });

    // Single player per admin — same getOrLinkAdminPlayer helper used
    // by /admin/play. Hitting Test-Room never creates a parallel
    // player; the admin keeps one consistent identity at the table.
    let player;
    try {
      player = await getOrLinkAdminPlayer({
        adminId: req.adminId!,
        requestedHandle: handle,
        displayName: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      if (msg === 'handle_taken') {
        return res.status(409).json({ error: 'handle_taken' });
      }
      logger.error({ err, adminId: req.adminId }, 'test-room link failed');
      return res.status(500).json({ error: msg });
    }

    // If the admin is already seated somewhere, kick them out first so
    // sitPlayer's "unique player per seat" invariant holds.
    const seatRow = await pool.query<{ table_id: string; seat_index: number }>(
      'select table_id, seat_index from table_seats where player_id = $1',
      [player.id],
    );
    if ((seatRow.rowCount ?? 0) > 0) {
      const { table_id, seat_index } = seatRow.rows[0]!;
      try {
        await tables.leavePlayer({ tableId: table_id, seatIndex: seat_index, playerId: player.id });
      } catch { /* best-effort */ }
    }

    // Top the admin up to at least the buy-in. We don't drain the
    // surplus — they keep whatever chips they had.
    if (player.chips < buyIn) {
      await moveChips({
        playerId: player.id,
        delta: buyIn - player.chips,
        reason: 'admin_grant',
        adminId: req.adminId,
        note: 'test-room top-up',
      });
    }

    // Insert the table row, flagged as a test room.
    const ins = await pool.query<{ id: string }>(
      `insert into tables
         (name, small_blind, big_blind, buy_in, max_players,
          allow_spectators, created_by, is_test_room)
       values ($1,$2,$3,$4,$5,false,$6,true) returning id`,
      [
        `Test Room · ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
        smallBlind, bigBlind, buyIn, maxPlayers, req.adminId,
      ],
    );
    const tableId = ins.rows[0]!.id;

    tables.addTable(new PokerTable({
      tableId,
      name: `Test Room`,
      smallBlind,
      bigBlind,
      buyIn,
      maxPlayers,
      allowSpectators: false,
      turnTimerMs: config.TURN_TIMER_MS,
      isTestRoom: true,
      maxBuyIn: buyIn * config.MAX_BUY_IN_MULTIPLIER,
    }));

    // Seat the admin first so they always land on seat 0. `defer:true`
    // suppresses the auto-dealer until every bot is at the table —
    // otherwise the hand starts as soon as 2 seats are filled and the
    // remaining bots get marked sitting-out for the first deal.
    await tables.sitPlayer({
      tableId,
      seatIndex: 0,
      playerId: player.id,
      displayName: player.displayName ?? player.handle,
      avatarUrl: player.avatarUrl ?? null,
      defer: true,
    });
    for (let i = 1; i < maxPlayers; i++) {
      tables.sitBot({ tableId, seatIndex: i, defer: true });
    }
    tables.beginPlay(tableId);

    // Mint a player session for the admin so the browser can connect to
    // the table over Socket.IO. Same two-step trick as /admin/play.
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
      action: 'create_test_room',
      targetTableId: tableId,
      targetPlayerId: player.id,
      payload: { maxPlayers, smallBlind, bigBlind, buyIn },
    });

    res.json({
      tableId,
      token,
      profile: {
        id: player.id,
        handle: player.handle,
        displayName: player.displayName,
        chips: player.chips,
      },
    });
    } catch (err) {
      logger.error({ err, adminId: req.adminId }, 'test-room creation failed');
      const msg = err instanceof Error ? err.message : 'unknown';
      if (!res.headersSent) res.status(500).json({ error: msg });
    }
  });

  /* ---- Players --------------------------------------------------- */

  r.get('/players', requireAdmin, async (req, res) => {
    const status = (req.query.status as string | undefined) ?? null;
    const q = status
      ? await pool.query(
          `select p.id, p.player_handle, p.display_name, p.password, p.status, p.chips,
                  p.created_at, p.approved_at, p.banned_at, p.last_login_at,
                  s.table_id as seat_table_id, s.seat_index, s.stack as seat_stack
             from players p
             left join table_seats s on s.player_id = p.id
            where p.status = $1 and p.deleted_at is null
            order by p.created_at desc
            limit 200`,
          [status],
        )
      : await pool.query(
          `select p.id, p.player_handle, p.display_name, p.password, p.status, p.chips,
                  p.created_at, p.approved_at, p.banned_at, p.last_login_at,
                  s.table_id as seat_table_id, s.seat_index, s.stack as seat_stack
             from players p
             left join table_seats s on s.player_id = p.id
            where p.deleted_at is null
            order by p.created_at desc
            limit 200`,
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
    // Kick all of that player's live sockets immediately rather than
    // letting them keep playing until their next reconnect.
    disconnectPlayer(io, req.params.id!, parsed.data.reason ?? 'banned');
    await logAdminAction({
      adminId: req.adminId!,
      action: 'ban_player',
      targetPlayerId: req.params.id,
      reason: parsed.data.reason ?? null,
    });
    res.json({ ok: true });
  });

  /**
   * Soft-deletes a player. We can't hard-delete: chip_ledger,
   * hand_results and audit rows reference them and we want the history
   * intact. Sets players.deleted_at, revokes every session and kicks
   * the player off any table they're on. Player-list queries already
   * filter on deleted_at IS NULL so they vanish from the dashboard.
   */
  r.delete('/players/:id', requireAdmin, async (req: AdminRequest, res) => {
    // If they're seated, leave the table first so their stack is
    // cashed out via the normal path.
    const seatRow = await pool.query<{ table_id: string; seat_index: number }>(
      'select table_id, seat_index from table_seats where player_id = $1',
      [req.params.id],
    );
    if ((seatRow.rowCount ?? 0) > 0) {
      const { table_id, seat_index } = seatRow.rows[0]!;
      try {
        await tables.leavePlayer({
          tableId: table_id,
          seatIndex: seat_index,
          playerId: req.params.id!,
        });
      } catch { /* best-effort */ }
    }
    const upd = await pool.query(
      'update players set deleted_at = now() where id = $1 and deleted_at is null',
      [req.params.id],
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    await revokeAllPlayerSessions(req.params.id!);
    disconnectPlayer(io, req.params.id!, 'account_removed');
    await logAdminAction({
      adminId: req.adminId!,
      action: 'delete_player',
      targetPlayerId: req.params.id,
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

    // If the player is currently seated, route the chips straight into
    // their stack at the table — that's the "give me chips during the
    // hand" admin flow. Otherwise, top up their off-table balance.
    const seatRow = await pool.query<{ table_id: string; seat_index: number }>(
      'select table_id, seat_index from table_seats where player_id = $1',
      [req.params.id],
    );

    try {
      if ((seatRow.rowCount ?? 0) > 0) {
        const { table_id, seat_index } = seatRow.rows[0]!;
        const newStack = await adminAddChipsToSeat({
          playerId: req.params.id!,
          tableId: table_id,
          seatIndex: seat_index,
          delta: parsed.data.delta,
          adminId: req.adminId!,
          note: parsed.data.note ?? null,
        });
        // Reflect the new stack in the in-memory engine state so it
        // propagates to every seat via the next state broadcast.
        const t = tables.get(table_id);
        if (t) {
          const seat = t.seats.get(seat_index);
          if (seat) seat.stack = newStack;
          // Trigger a state push to all sockets at the table.
          (tables as unknown as { onStateChange: (id: string) => void }).onStateChange(table_id);
        }
        await logAdminAction({
          adminId: req.adminId!,
          action: 'chip_move_seat',
          targetPlayerId: req.params.id!,
          targetTableId: table_id,
          payload: { ...parsed.data, seatIndex: seat_index, newStack },
        });
        return res.json({ scope: 'seat', tableId: table_id, seatIndex: seat_index, stack: newStack });
      }

      // Not seated → regular balance flow.
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
      emitToPlayer(io, req.params.id!, 'server:account:chip_update', {
        chips: Number(after),
        delta: parsed.data.delta,
        reason: parsed.data.reason,
      });
      res.json({ scope: 'balance', balance: after.toString() });
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
    emitToPlayer(io, req.params.id!, 'server:account:chip_update', {
      chips: Number(after),
      delta,
      reason: 'admin_set',
    });
    res.json({ balance: after.toString() });
  });

  r.post('/players/:id/password', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({ password: z.string().min(4).max(128) });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });
    const upd = await pool.query(
      'update players set password = $2 where id = $1',
      [req.params.id, parsed.data.password],
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    await logAdminAction({
      adminId: req.adminId!,
      action: 'set_password',
      targetPlayerId: req.params.id,
      // Do NOT log the password itself, only that it was changed.
      payload: { length: parsed.data.password.length },
    });
    res.json({ ok: true });
  });

  /**
   * Kicks a player from whatever table they're currently sitting at.
   * Their stack is cashed out via the normal leavePlayer flow, the seat
   * row is dropped, and the player's open sockets get a
   * server:account:left_table push so their UI redirects to /lobby.
   * No-op (404) if they're not currently seated.
   */
  r.post('/players/:id/kick', requireAdmin, async (req: AdminRequest, res) => {
    const seatRow = await pool.query<{ table_id: string; seat_index: number }>(
      'select table_id, seat_index from table_seats where player_id = $1',
      [req.params.id],
    );
    if ((seatRow.rowCount ?? 0) === 0) {
      return res.status(404).json({ error: 'not_seated' });
    }
    const { table_id, seat_index } = seatRow.rows[0]!;
    await tables.leavePlayer({
      tableId: table_id,
      seatIndex: seat_index,
      playerId: req.params.id!,
    });
    emitToPlayer(io, req.params.id!, 'server:account:left_table', {
      tableId: table_id,
      reason: 'kicked',
    });
    await logAdminAction({
      adminId: req.adminId!,
      action: 'kick_player',
      targetPlayerId: req.params.id,
      targetTableId: table_id,
      payload: { seatIndex: seat_index },
    });
    res.json({ ok: true });
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
    // Decorate each row with live in-memory state (pause flag, current
    // seat count, whether a hand is being played right now).
    const decorated = q.rows.map((row) => {
      const t = tables.get(row.id);
      return {
        ...row,
        is_paused: t?.isPaused ?? false,
        seated: t?.seats.size ?? 0,
        in_hand: t ? t.phase !== 'waiting' : false,
        hand_number: t?.handNumber ?? 0,
      };
    });
    res.json({ tables: decorated });
  });

  r.post('/tables', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({
      name: z.string().min(1).max(60),
      smallBlind: z.number().int().positive(),
      bigBlind: z.number().int().positive(),
      buyIn: z.number().int().positive(),
      maxPlayers: z.number().int().min(2).max(10),
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
        maxBuyIn: parsed.data.buyIn * config.MAX_BUY_IN_MULTIPLIER,
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

  /** Pause auto-progression: no new hands deal, no turn timeouts fire. */
  r.post('/tables/:id/pause', requireAdmin, async (req: AdminRequest, res) => {
    const ok = tables.pauseTable(req.params.id!);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    await logAdminAction({ adminId: req.adminId!, action: 'pause_table', targetTableId: req.params.id });
    res.json({ ok: true });
  });

  r.post('/tables/:id/resume', requireAdmin, async (req: AdminRequest, res) => {
    const ok = tables.resumeTable(req.params.id!);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    await logAdminAction({ adminId: req.adminId!, action: 'resume_table', targetTableId: req.params.id });
    res.json({ ok: true });
  });

  /**
   * Close a table cleanly: cash out every seated player back to their
   * off-table balance, archive the table, drop it from memory. Players
   * stuck at the table get their stacks credited via the normal
   * cash_out ledger path.
   */
  r.post('/tables/:id/close', requireAdmin, async (req: AdminRequest, res) => {
    // Snapshot seated player ids BEFORE we close (closeTable empties the
    // seat map) so we can push left_table to each.
    const t = tables.get(req.params.id!);
    const seatedIds = t ? [...t.seats.values()].map((s) => s.playerId) : [];

    const closed = await tables.closeTable(req.params.id!);
    if (!closed.ok) return res.status(404).json({ error: 'not_found' });
    await pool.query('update tables set archived_at = now() where id = $1', [req.params.id]);

    for (const pid of seatedIds) {
      emitToPlayer(io, pid, 'server:account:left_table', {
        tableId: req.params.id!,
        reason: 'table_closed',
      });
    }
    await logAdminAction({ adminId: req.adminId!, action: 'close_table', targetTableId: req.params.id });
    res.json({ ok: true });
  });

  /**
   * Hard-delete a table — purges the row, every hand played at it,
   * every action / result / chat message, and removes the in-memory
   * engine if still loaded. Foreign keys in chip_ledger and admin_log
   * are detached (set null) so audit history survives. Irreversible.
   *
   * Refuses if anyone is currently seated; the admin must close the
   * table first via /tables/:id/close which cashes everyone out.
   */
  r.delete('/tables/:id', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const tableId = req.params.id!;

      // Block if someone is still seated — losing chips silently would
      // be a horrible surprise for the player. Close first.
      const live = tables.get(tableId);
      if (live && live.seats.size > 0) {
        const hasHuman = [...live.seats.values()].some(
          (s) => !s.playerId.startsWith('bot:'),
        );
        if (hasHuman) {
          return res.status(409).json({
            error: 'table_has_seated_players — close it first',
          });
        }
      }

      // If it's loaded in memory, drop it (this also kills timers and
      // bot schedulers). Bots-only tables are cleanly tearable here.
      if (live) {
        await tables.closeTable(tableId);
      }

      // Detach the table from history-bearing tables first so the
      // hard DELETE doesn't trip foreign keys. chat_messages and
      // table_seats already cascade in the schema; hands needs an
      // explicit drop because hand_actions / hand_results cascade
      // FROM hands, not from tables.
      await withTx(async (c) => {
        await c.query(
          'update chip_ledger set ref_table_id = null where ref_table_id = $1',
          [tableId],
        );
        await c.query(
          'update chip_ledger set ref_hand_id = null where ref_hand_id in (select id from hands where table_id = $1)',
          [tableId],
        );
        await c.query(
          'update admin_log set target_table_id = null where target_table_id = $1',
          [tableId],
        );
        // Cascades into hand_actions + hand_results via ON DELETE CASCADE.
        await c.query('delete from hands where table_id = $1', [tableId]);
        // Cascades into table_seats + chat_messages via ON DELETE CASCADE.
        const r = await c.query('delete from tables where id = $1', [tableId]);
        if (r.rowCount === 0) {
          throw new Error('not_found');
        }
      });

      await logAdminAction({
        adminId: req.adminId!,
        action: 'delete_table',
        targetTableId: tableId,
      });
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, tableId: req.params.id }, 'delete_table failed');
      const msg = err instanceof Error ? err.message : 'unknown';
      if (msg === 'not_found') return res.status(404).json({ error: 'not_found' });
      if (!res.headersSent) res.status(500).json({ error: msg });
    }
  });

  /* ---- Chip requests (player → admin) --------------------------- */

  /**
   * Pending chip-top-up requests submitted via the player UI. The
   * admin dashboard polls this every few seconds and pops up a card
   * per row with [Approve / Reject] buttons. Resolving a request is
   * a separate POST below so the admin can override the amount.
   */
  r.get('/chip-requests', requireAdmin, async (_req, res) => {
    const q = await pool.query(
      `select r.id, r.amount, r.message, r.status, r.kind, r.created_at,
              r.resolved_at, r.granted_amount,
              p.id          as player_id,
              p.player_handle,
              p.display_name,
              p.chips
         from chip_requests r
         join players p on p.id = r.player_id
        where r.status = 'pending'
        order by r.created_at asc
        limit 100`,
    );
    res.json({ requests: q.rows });
  });

  r.post('/chip-requests/:id/approve', requireAdmin, async (req: AdminRequest, res) => {
    const Body = z.object({ amount: z.number().int().min(1) });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });
    try {
      const row = await pool.query<{
        player_id: string;
        status: string;
        kind: string;
        amount: string | null;
      }>(
        'select player_id, status, kind, amount from chip_requests where id = $1',
        [req.params.id],
      );
      if (row.rowCount === 0) return res.status(404).json({ error: 'not_found' });
      if (row.rows[0]!.status !== 'pending') {
        return res.status(409).json({ error: 'already_resolved' });
      }
      const playerId = row.rows[0]!.player_id;
      const kind = row.rows[0]!.kind;
      const held = row.rows[0]!.amount === null ? 0 : Number(row.rows[0]!.amount);
      const granted = parsed.data.amount;

      // Top-up: a flat positive grant at approve time, sized by the
      // amount the admin entered (defaulting to the player's ask).
      // Cashout: the chips are ALREADY out of the wallet (held in
      // escrow on request). We don't deduct again here — we just
      // refund any unused portion if the admin approves less than was
      // held, and refuse if they try to approve more (admins shouldn't
      // be able to conjure chips through a cashout approval).
      let chipDelta = 0;
      let chipReason: 'admin_grant' | 'cash_out_refund' | null = null;
      try {
        if (kind === 'cashout') {
          if (granted > held) {
            return res.status(409).json({ error: 'exceeds_held_amount' });
          }
          const refund = held - granted;
          if (refund > 0) {
            await moveChips({
              playerId,
              delta: refund,
              reason: 'cash_out_refund',
              adminId: req.adminId,
              note: `cashout_partial_refund:${req.params.id} held=${held} granted=${granted}`,
            });
            chipDelta = refund;
            chipReason = 'cash_out_refund';
          }
        } else {
          await moveChips({
            playerId,
            delta: granted,
            reason: 'admin_grant',
            adminId: req.adminId,
            note: `topup_request approved (id ${req.params.id})`,
          });
          chipDelta = granted;
          chipReason = 'admin_grant';
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        if (msg === 'insufficient_chips') {
          return res.status(409).json({ error: 'insufficient_chips' });
        }
        throw err;
      }

      await pool.query(
        `update chip_requests
           set status='approved', resolved_at=now(), resolved_by=$2, granted_amount=$3
         where id=$1`,
        [req.params.id, req.adminId, granted],
      );

      // Push wallet update + clear the pending banner on the player's
      // open sockets. chip_update only fires when something actually
      // moved (refund or topup grant); the banner update always fires.
      try {
        if (chipReason) {
          const fresh = await findPlayerById(playerId);
          if (fresh) {
            emitToPlayer(io, playerId, 'server:account:chip_update', {
              chips: fresh.chips,
              delta: chipDelta,
              reason: chipReason,
            });
          }
        }
        emitToPlayer(io, playerId, 'server:account:wallet_request_update', {
          request: null,
        });
      } catch { /* non-fatal */ }

      await logAdminAction({
        adminId: req.adminId!,
        action: kind === 'cashout' ? 'approve_cashout_request' : 'approve_chip_request',
        targetPlayerId: playerId,
        payload: { requestId: req.params.id, kind, amount: granted, held },
      });
      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      logger.error({ err, id: req.params.id }, 'approve_chip_request failed');
      res.status(500).json({ error: msg });
    }
  });

  r.post('/chip-requests/:id/reject', requireAdmin, async (req: AdminRequest, res) => {
    const row = await pool.query<{
      status: string;
      player_id: string;
      kind: string;
      amount: string | null;
    }>(
      'select status, player_id, kind, amount from chip_requests where id = $1',
      [req.params.id],
    );
    if (row.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    if (row.rows[0]!.status !== 'pending') {
      return res.status(409).json({ error: 'already_resolved' });
    }
    const playerId = row.rows[0]!.player_id;
    const kind = row.rows[0]!.kind;
    const held = row.rows[0]!.amount === null ? 0 : Number(row.rows[0]!.amount);

    // Cashout: chips were taken at request time. Rejection puts them
    // back. Top-up: nothing was moved, nothing to undo.
    let refunded = 0;
    if (kind === 'cashout' && held > 0) {
      try {
        await moveChips({
          playerId,
          delta: held,
          reason: 'cash_out_refund',
          adminId: req.adminId,
          note: `cashout_rejected:${req.params.id} refunded`,
        });
        refunded = held;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        logger.error({ err, id: req.params.id }, 'cashout reject refund failed');
        return res.status(500).json({ error: msg });
      }
    }

    await pool.query(
      `update chip_requests
         set status='rejected', resolved_at=now(), resolved_by=$2
       where id=$1`,
      [req.params.id, req.adminId],
    );

    try {
      if (refunded > 0) {
        const fresh = await findPlayerById(playerId);
        if (fresh) {
          emitToPlayer(io, playerId, 'server:account:chip_update', {
            chips: fresh.chips,
            delta: refunded,
            reason: 'cash_out_refund',
          });
        }
      }
      emitToPlayer(io, playerId, 'server:account:wallet_request_update', {
        request: null,
      });
    } catch { /* non-fatal */ }

    await logAdminAction({
      adminId: req.adminId!,
      action: 'reject_chip_request',
      targetPlayerId: playerId,
      payload: { requestId: req.params.id, kind, refunded },
    });
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
