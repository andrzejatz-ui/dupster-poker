/**
 * Allgemeine Domain-Typen.
 */

export type PlayerStatus = 'pending' | 'approved' | 'banned';

export interface PlayerProfile {
  id: string;
  handle: string;
  displayName: string | null;
  status: PlayerStatus;
  chips: number;
  allowConcurrentSessions: boolean;
}

export interface AdminProfile {
  id: string;
  username: string;
}

export interface SessionInfo {
  id: string;
  playerId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
}
