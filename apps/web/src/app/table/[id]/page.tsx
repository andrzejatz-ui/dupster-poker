'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { NeonButton } from '@/components/ui/NeonButton';
import { useSocket } from '@/hooks/useSocket';
import type { PublicTableState } from '@neon-poker/shared/events';
import type { PlayerAction } from '@neon-poker/shared/poker';
import { PlayerSeat } from '@/components/table/PlayerSeat';
import { Board } from '@/components/table/Board';
import { ActionBar } from '@/components/table/ActionBar';
import { ChatBox, type ChatLine } from '@/components/table/ChatBox';

export default function TablePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { socket, status } = useSocket();
  const [state, setState] = useState<PublicTableState | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [, force] = useState(0);

  // tick once per 250ms so the turn timer keeps refreshing
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!socket || !id) return;
    socket.on('server:table:state', (s) => {
      if (s.tableId === id) setState(s);
    });
    socket.on('server:table:chat', (msg) => {
      if (msg.tableId !== id) return;
      setChat((c) => [...c, msg]);
    });
    socket.on('server:table:error', (e) => alert(e.message));
  }, [socket, id]);

  const seatsByIndex = useMemo(() => {
    const map = new Map<number, PublicTableState['seats'][number]>();
    if (state) for (const s of state.seats) map.set(s.seatIndex, s);
    return map;
  }, [state]);

  const seatPositions = state ? computeSeatPositions(state.maxPlayers) : [];

  function sendAction(action: PlayerAction, clientActionId: string) {
    if (!socket || !id) return;
    socket.emit(
      'client:table:action',
      { tableId: id, action, clientActionId },
      (res) => {
        if (!res.ok) alert(res.error);
      },
    );
  }

  function sendChat(body: string) {
    if (!socket || !id) return;
    socket.emit('client:table:chat', { tableId: id, body });
  }

  function leave() {
    if (!socket || !id) return;
    socket.emit('client:table:leave', { tableId: id }, () => router.push('/lobby'));
  }

  if (!state) {
    return (
      <main className="min-h-screen flex items-center justify-center text-white/40">
        <span className="font-mono">Verbinde …  ({status})</span>
      </main>
    );
  }

  const isMyTurn = state.mySeatIndex !== null && state.toActSeat === state.mySeatIndex;

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-white/40 font-display">
            Tisch · {state.phase.toUpperCase()}
          </div>
          <h1 className="font-display text-2xl">{state.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-white/40">Hand #{state.handNumber}</span>
          <NeonButton size="sm" variant="ghost" onClick={leave}>
            Verlassen
          </NeonButton>
        </div>
      </div>

      {/* Felt */}
      <div className="flex-1 px-6 py-8 grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-9 relative">
          <div className="felt rounded-[140px] aspect-[16/9] relative">
            {/* Board */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Board board={state.board} pot={state.pot} />
            </div>

            {/* Seats */}
            {seatPositions.map((pos, idx) => (
              <div
                key={idx}
                className="absolute"
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
              >
                <PlayerSeat
                  seat={seatsByIndex.get(idx) ?? null}
                  seatIndex={idx}
                  isButton={state.buttonSeat === idx}
                  bigBlindAmount={state.bigBlind}
                />
              </div>
            ))}
          </div>

          {/* Action bar */}
          <div className="mt-6 glass-strong rounded-2xl p-4">
            <ActionBar
              legal={state.legalActionsForMe}
              isMyTurn={isMyTurn}
              deadline={state.toActDeadline}
              onAction={sendAction}
            />
          </div>
        </div>

        {/* Side panel */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-4">
          <div className="glass rounded-2xl p-4">
            <div className="text-[10px] uppercase tracking-[0.4em] text-white/40 font-display mb-2">
              Blinds
            </div>
            <div className="font-mono text-sm">
              SB <span className="text-neon-cyan">{state.smallBlind}</span> /
              BB <span className="text-neon-cyan ml-1">{state.bigBlind}</span>
            </div>
            <div className="mt-3 text-[10px] uppercase tracking-[0.4em] text-white/40 font-display mb-2">
              Side pots
            </div>
            {state.sidePots.length === 0 ? (
              <div className="text-xs text-white/40">—</div>
            ) : (
              state.sidePots.map((p, i) => (
                <div key={i} className="text-xs font-mono">
                  Pot {i + 1}: {p.amount.toLocaleString()} · Sitze{' '}
                  {p.eligibleSeatIndexes.join(', ')}
                </div>
              ))
            )}
          </div>

          <ChatBox lines={chat} onSend={sendChat} />
        </aside>
      </div>
    </main>
  );
}

/**
 * Seat positions in %, around an ellipse. Index 0 is bottom-center (the
 * viewer-ish seat); positions go counter-clockwise around the felt.
 */
function computeSeatPositions(n: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    // angle starts at -90deg (bottom) and goes counter-clockwise
    const angle = (Math.PI / 2) + (i * 2 * Math.PI) / n;
    const x = 50 + 42 * Math.cos(angle);
    const y = 50 + 38 * Math.sin(angle);
    positions.push({ x, y });
  }
  return positions;
}
