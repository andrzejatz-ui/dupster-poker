import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  createPendingPlayer,
  findPlayerByHandleWithPassword,
  findPlayerById,
} from './players.js';
import { createSession, signPlayerToken } from './sessions.js';
import { requirePlayer, type PlayerRequest } from './middleware.js';
import { pool } from '../db/client.js';
import type { TableManager } from '../rooms/tableManager.js';
import { buildSignupMessage, notifyTelegram } from '../utils/telegram.js';

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
    res.json({
      id: p.id,
      handle: p.handle,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl ?? null,
      chips: p.chips,
      status: p.status,
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

  return r;
}
