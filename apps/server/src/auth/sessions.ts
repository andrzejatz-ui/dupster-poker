import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/client.js';

export interface SessionToken {
  sub: string;        // playerId
  sid: string;        // sessionId
  iat: number;
  exp: number;
}

export interface AdminToken {
  sub: string;        // adminId
  isAdmin: true;
  iat: number;
  exp: number;
}

const PLAYER_TOKEN_TTL_SECONDS = 60 * 60 * 12;   // 12h, then re-login
const ADMIN_TOKEN_TTL_SECONDS = 60 * 60 * 24;    // 24h

export function signPlayerToken(playerId: string, sessionId: string): string {
  return jwt.sign({ sub: playerId, sid: sessionId }, config.SESSION_SECRET, {
    expiresIn: PLAYER_TOKEN_TTL_SECONDS,
  });
}

export function verifyPlayerToken(token: string): SessionToken | null {
  try {
    return jwt.verify(token, config.SESSION_SECRET) as SessionToken;
  } catch {
    return null;
  }
}

export function signAdminToken(adminId: string): string {
  return jwt.sign({ sub: adminId, isAdmin: true }, config.SESSION_SECRET, {
    expiresIn: ADMIN_TOKEN_TTL_SECONDS,
  });
}

export function verifyAdminToken(token: string): AdminToken | null {
  try {
    const decoded = jwt.verify(token, config.SESSION_SECRET) as AdminToken;
    return decoded.isAdmin ? decoded : null;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Persist a new session. If the player has `allow_concurrent_sessions=false`,
 * existing active sessions are revoked first.
 */
export async function createSession(args: {
  playerId: string;
  token: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<string> {
  const tokenHash = hashToken(args.token);
  const player = await pool.query<{ allow_concurrent_sessions: boolean }>(
    'select allow_concurrent_sessions from players where id = $1',
    [args.playerId],
  );
  if (player.rowCount === 0) throw new Error('player_not_found');

  if (!player.rows[0]!.allow_concurrent_sessions) {
    await pool.query(
      `update sessions set revoked_at = now()
        where player_id = $1 and revoked_at is null`,
      [args.playerId],
    );
  }

  const insert = await pool.query<{ id: string }>(
    `insert into sessions (player_id, token_hash, ip, user_agent)
     values ($1, $2, $3, $4) returning id`,
    [args.playerId, tokenHash, args.ip, args.userAgent],
  );
  return insert.rows[0]!.id;
}

export async function isSessionActive(sessionId: string): Promise<boolean> {
  const r = await pool.query<{ revoked_at: string | null }>(
    'select revoked_at from sessions where id = $1',
    [sessionId],
  );
  if (r.rowCount === 0) return false;
  return r.rows[0]!.revoked_at === null;
}

export async function touchSession(sessionId: string): Promise<void> {
  await pool.query(
    'update sessions set last_seen_at = now() where id = $1',
    [sessionId],
  );
}

export async function revokeSession(sessionId: string): Promise<void> {
  await pool.query(
    'update sessions set revoked_at = now() where id = $1 and revoked_at is null',
    [sessionId],
  );
}

export async function revokeAllPlayerSessions(playerId: string): Promise<void> {
  await pool.query(
    `update sessions set revoked_at = now()
      where player_id = $1 and revoked_at is null`,
    [playerId],
  );
}
