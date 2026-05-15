'use client';

import { adminFetch } from './api';

const KEY = 'np_admin_token';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(KEY);
}
export function clearAdminToken() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(KEY);
}

export async function adminCall(path: string, init: RequestInit = {}) {
  const token = getAdminToken();
  if (!token) throw new Error('not_authenticated');
  return adminFetch(path, token, init);
}
