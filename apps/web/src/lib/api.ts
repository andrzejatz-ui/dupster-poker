export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';

async function rawFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  return res;
}

export async function joinAsPlayer(
  playerHandle: string,
  password: string,
  displayName?: string,
) {
  const res = await rawFetch('/auth/join', {
    method: 'POST',
    body: JSON.stringify({ playerHandle, password, displayName }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body } as const;
}

export async function updateAvatar(token: string, avatarUrl: string | null) {
  const res = await rawFetch('/auth/profile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ avatarUrl }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body } as const;
}

export async function adminLogin(username: string, password: string) {
  const res = await rawFetch('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body } as const;
}

export async function adminFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await rawFetch(`/admin${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body } as const;
}
