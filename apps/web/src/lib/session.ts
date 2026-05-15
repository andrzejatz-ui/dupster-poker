'use client';

/**
 * Session storage only. Closing the tab clears the token — this is required
 * per spec ("Player-ID jedes Mal neu eingeben"). Do not migrate to
 * localStorage.
 */

const TOKEN_KEY = 'np_token';
const PROFILE_KEY = 'np_profile';

export interface StoredProfile {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl?: string | null;
  chips: number;
}

export function setSession(token: string, profile: StoredProfile) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(TOKEN_KEY, token);
  window.sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function getProfile(): StoredProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredProfile;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(PROFILE_KEY);
}
