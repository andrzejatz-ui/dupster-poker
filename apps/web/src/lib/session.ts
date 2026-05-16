'use client';

/**
 * Session storage only. Closing the tab clears the token — this is required
 * per spec ("Player-ID jedes Mal neu eingeben"). Do not migrate to
 * localStorage.
 *
 * EXCEPTION: the avatar URL is also mirrored to localStorage, keyed by
 * handle. Once a player picks a picture it stays until they change it,
 * even after sign-out or a new tab. The token still resets every tab.
 */

const TOKEN_KEY = 'np_token';
const PROFILE_KEY = 'np_profile';
const AVATAR_PREFIX = 'np_avatar:';
/**
 * Persistent "last seen avatar" — survives logout / new tab / fresh
 * Telegram-WebApp launch. The Eye component falls back to this so the
 * player's face follows them around the whole app, including the
 * pre-login landing page, instead of snapping back to the gold iris.
 */
const LAST_AVATAR_KEY = 'np_last_avatar';

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
  // Mirror avatar to localStorage so it survives logout / new tab.
  if (profile.handle) {
    rememberAvatar(profile.handle, profile.avatarUrl ?? null);
  }
  rememberLastAvatar(profile.avatarUrl ?? null);
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

export function setStoredProfile(profile: StoredProfile) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  if (profile.handle) {
    rememberAvatar(profile.handle, profile.avatarUrl ?? null);
  }
  rememberLastAvatar(profile.avatarUrl ?? null);
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  // Note: deliberately NOT clearing the avatar cache — see file header.
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(PROFILE_KEY);
}

/** Persist the player's avatar (data URL) by handle. null clears it. */
export function rememberAvatar(handle: string, dataUrl: string | null) {
  if (typeof window === 'undefined') return;
  const h = handle.trim().toLowerCase();
  if (!h) return;
  const k = AVATAR_PREFIX + h;
  try {
    if (dataUrl) window.localStorage.setItem(k, dataUrl);
    else window.localStorage.removeItem(k);
  } catch {
    // Quota exceeded or storage blocked — non-fatal, just lose the cache.
  }
}

/** Return the last-known avatar for this handle, or null. */
export function recallAvatar(handle: string): string | null {
  if (typeof window === 'undefined') return null;
  const h = handle.trim().toLowerCase();
  if (!h) return null;
  try {
    return window.localStorage.getItem(AVATAR_PREFIX + h);
  } catch {
    return null;
  }
}

/**
 * Mirror the most-recently-used avatar to a handle-agnostic localStorage
 * slot. The Eye reads this when no session profile is present so the
 * player's face still appears on the landing / join pages after their
 * first login on this device.
 */
export function rememberLastAvatar(dataUrl: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (dataUrl) window.localStorage.setItem(LAST_AVATAR_KEY, dataUrl);
    else window.localStorage.removeItem(LAST_AVATAR_KEY);
  } catch {
    /* quota / storage blocked — non-fatal */
  }
}

/** Read the persistent last-avatar slot. Null if never set. */
export function recallLastAvatar(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_AVATAR_KEY);
  } catch {
    return null;
  }
}
