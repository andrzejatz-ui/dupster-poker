'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@neon-poker/shared/events';
import { SERVER_URL } from '@/lib/api';
import { getToken } from '@/lib/session';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface UseSocketOptions {
  auto?: boolean;
}

export function useSocket(opts: UseSocketOptions = { auto: true }): {
  socket: AppSocket | null;
  status: 'idle' | 'connecting' | 'connected' | 'error';
} {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const ref = useRef<AppSocket | null>(null);

  useEffect(() => {
    if (!opts.auto) return;
    const token = getToken();
    if (!token) return;
    setStatus('connecting');
    const s: AppSocket = io(SERVER_URL, {
      auth: { token },
      transports: ['websocket'],
    }) as AppSocket;
    ref.current = s;
    s.on('connect', () => setStatus('connected'));
    s.on('connect_error', () => setStatus('error'));
    s.on('disconnect', () => setStatus('idle'));
    return () => {
      s.disconnect();
      ref.current = null;
    };
  }, [opts.auto]);

  return { socket: ref.current, status };
}
