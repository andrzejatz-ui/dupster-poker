import type { NextFunction, Request, Response } from 'express';
import { isSessionActive, verifyPlayerToken } from './sessions.js';

export interface PlayerRequest extends Request {
  playerId?: string;
  sessionId?: string;
}

/**
 * Express middleware that authenticates a player via the Authorization
 * Bearer token issued by /auth/join. Used by player-scoped endpoints
 * (avatar upload, profile updates, etc.) — sockets continue to use
 * their own handshake-auth path.
 */
export async function requirePlayer(
  req: PlayerRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const decoded = verifyPlayerToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'bad_token' });
    return;
  }
  const ok = await isSessionActive(decoded.sid);
  if (!ok) {
    res.status(401).json({ error: 'session_revoked' });
    return;
  }
  req.playerId = decoded.sub;
  req.sessionId = decoded.sid;
  next();
}
