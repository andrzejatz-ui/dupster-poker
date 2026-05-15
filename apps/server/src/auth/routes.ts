import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  createPendingPlayer,
  findPlayerByHandleWithPassword,
} from './players.js';
import { createSession, signPlayerToken } from './sessions.js';

export function authRouter(): Router {
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
      // First time this handle is used → create pending with chosen password.
      const created = await createPendingPlayer({
        handle: parsed.data.playerHandle,
        password: parsed.data.password,
        displayName: parsed.data.displayName ?? null,
      });
      return res
        .status(202)
        .json({ status: 'pending', handle: created.handle });
    }

    if (row.password === null) {
      // Legacy row (pre-password column) or admin-created without password.
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
    res.json({
      status: 'approved',
      token,
      profile: {
        id: row.id,
        handle: row.handle,
        displayName: row.displayName,
        chips: row.chips,
      },
    });
  });

  return r;
}
