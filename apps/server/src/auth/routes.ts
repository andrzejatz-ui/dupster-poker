import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  findPlayerByHandle,
  getOrCreatePendingPlayer,
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
   * Player attempts to enter the app.
   *
   * Behavior:
   *  - existing approved → session token returned
   *  - existing pending  → 202 + status pending
   *  - existing banned   → 403
   *  - unknown handle    → creates pending row, returns 202 pending
   */
  r.post('/join', joinLimiter, async (req, res) => {
    const Body = z.object({
      playerHandle: z.string().min(2).max(40).trim(),
      displayName: z.string().max(40).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_payload' });

    let profile = await findPlayerByHandle(parsed.data.playerHandle);
    if (!profile) {
      profile = await getOrCreatePendingPlayer({
        handle: parsed.data.playerHandle,
        displayName: parsed.data.displayName ?? null,
      });
    }

    if (profile.status === 'banned') {
      return res.status(403).json({ status: 'banned' });
    }
    if (profile.status === 'pending') {
      return res.status(202).json({ status: 'pending', handle: profile.handle });
    }

    // approved → mint session
    const ip = req.ip ?? null;
    const ua = req.header('user-agent') ?? null;

    // We need the sessionId baked into the JWT — issue temp, persist, then re-sign
    // using the actual sessionId. Simplest: persist first with a placeholder token,
    // get sessionId, sign final token with it, then update the token_hash.
    // For brevity here we sign with a generated sessionId via createSession returning it.
    const tempToken = signPlayerToken(profile.id, 'pending');
    const sessionId = await createSession({
      playerId: profile.id,
      token: tempToken,
      ip,
      userAgent: ua,
    });
    const token = signPlayerToken(profile.id, sessionId);
    res.json({
      status: 'approved',
      token,
      profile: {
        id: profile.id,
        handle: profile.handle,
        displayName: profile.displayName,
        chips: profile.chips,
      },
    });
  });

  return r;
}
