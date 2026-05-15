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
import { HandResultBanner } from '@/components/table/HandResultBanner';
import { HistoryModal } from '@/components/table/HistoryModal';
import { fetchChatHistory } from '@/lib/api';
import { getToken } from '@/lib/session';
import { playChatDing, playChipPlink } from '@/lib/sounds';
import type { Card } from '@neon-poker/shared/poker';
import { useT } from '@/i18n/context';

interface ResultSnapshot {
  winners: Array<{ seatIndex: number; amount: number; handLabel: string | null }>;
  revealed: Array<{ seatIndex: number; holeCards: [Card, Card]; handLabel: string }>;
}

export default function TablePage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { socket, status } = useSocket();
  const [state, setState] = useState<PublicTableState | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [result, setResult] = useState<ResultSnapshot | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [, force] = useState(0);

  // Replay the last 50 chat messages from the server on mount so a
  // page reload doesn't wipe the conversation.
  useEffect(() => {
    if (!id) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    fetchChatHistory(token, id, 50).then((r) => {
      if (cancelled || r.status !== 200) return;
      type R = { id: string; body: string; at: number; from: string };
      const lines: ChatLine[] = (r.body.messages as R[] | undefined ?? []).map((m) => ({
        from: m.from,
        body: m.body,
        at: m.at,
        seatIndex: null,
      }));
      setChat(lines);
    });
    return () => { cancelled = true; };
  }, [id]);

  // tick once per 250ms so the turn timer keeps refreshing
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!socket || !id) return;
    socket.on('server:table:state', (s) => {
      if (s.tableId === id) {
        setState(s);
        // A new hand started → drop any lingering result snapshot.
        if (s.handNumber > 0 && s.phase !== 'showdown' && s.phase !== 'waiting') {
          setResult(null);
        }
      }
    });
    socket.on('server:table:chat', (msg) => {
      if (msg.tableId !== id) return;
      setChat((c) => [...c, msg]);
      // Don't ding for our own messages.
      const myName = state?.seats.find((s) => s.seatIndex === state.mySeatIndex)?.displayName;
      if (msg.from !== myName) playChatDing();
    });
    socket.on('server:table:error', (e) => alert(e.message));
    // Hand finished — keep the winner + revealed cards on screen for
    // the 8-second pause the server takes before dealing the next hand.
    socket.on('server:table:hand:result', (payload) => {
      if (payload.tableId !== id) return;
      setResult({ winners: payload.winners, revealed: payload.revealed });
      playChipPlink();
      // Safety self-clear in case the next hand never comes (table
      // closed, server crashed). Server normally re-deals after 8s.
      setTimeout(() => setResult(null), 8500);
    });
    // Admin kicked us or closed the table — bounce to lobby.
    socket.on('server:account:left_table', (payload) => {
      if (payload.tableId !== id) return;
      router.replace(`/lobby?leftReason=${encodeURIComponent(payload.reason)}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, id, router]);

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

  function togglePause() {
    if (!socket) return;
    const mySeat = state?.mySeatIndex !== null && state?.mySeatIndex !== undefined
      ? state.seats.find((s) => s.seatIndex === state.mySeatIndex)
      : null;
    const ev = mySeat?.isPaused ? 'client:player:resume' : 'client:player:pause';
    socket.emit(ev, (res) => {
      if (!res.ok) alert(res.error);
    });
  }

  if (!state) {
    return (
      <main className="min-h-screen flex items-center justify-center text-white/40">
        <span className="font-mono">{t('table.connecting')}  ({status})</span>
      </main>
    );
  }

  const isMyTurn = state.mySeatIndex !== null && state.toActSeat === state.mySeatIndex;

  return (
    <main className="min-h-screen flex flex-col pb-32 lg:pb-0">
      {/* Header — extra right padding leaves room for the floating language switcher */}
      <div className="pl-3 pr-24 sm:pl-6 sm:pr-36 py-3 sm:py-4 flex items-center justify-between border-b border-white/5">
        <div className="min-w-0">
          <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.4em] text-white/40 font-display truncate">
            {t('table.phaseLabel')} · {state.phase.toUpperCase()}
          </div>
          <h1 className="font-display text-lg sm:text-2xl truncate">{state.name}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="hidden sm:inline text-xs font-mono text-ink-muted">{t('table.handNumber')}{state.handNumber}</span>
          {state.mySeatIndex !== null && (() => {
            const mySeat = state.seats.find((s) => s.seatIndex === state.mySeatIndex);
            const paused = mySeat?.isPaused ?? false;
            return (
              <NeonButton size="sm" variant={paused ? 'gold' : 'ghost'} onClick={togglePause}>
                {paused ? t('action.resume') : t('action.pause')}
              </NeonButton>
            );
          })()}
          <NeonButton size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
            {t('history.button')}
          </NeonButton>
          <NeonButton size="sm" variant="ghost" onClick={leave}>
            {t('table.leave')}
          </NeonButton>
        </div>
      </div>

      {/* Felt + side panel */}
      <div className="flex-1 px-2 sm:px-6 py-3 sm:py-8 grid grid-cols-12 gap-3 sm:gap-6">
        <div className="col-span-12 lg:col-span-9 relative">
          <div className="felt rounded-[60px] sm:rounded-[140px] aspect-[4/3] sm:aspect-[16/9] relative">
            {/* Board */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Board board={state.board} pot={state.pot} handToken={state.handId} />
            </div>

            {/* Seats */}
            {seatPositions.map((pos, idx) => {
              const base = seatsByIndex.get(idx) ?? null;
              // While the result banner is up, splice in opponents' hole
              // cards so the seats reveal what the banner is summarising.
              const reveal = result?.revealed.find((r) => r.seatIndex === idx);
              const seat = base && reveal && !base.holeCards
                ? { ...base, revealedCards: reveal.holeCards }
                : base;
              return (
                <div
                  key={idx}
                  className="absolute"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <PlayerSeat
                    seat={seat}
                    seatIndex={idx}
                    isButton={state.buttonSeat === idx}
                    bigBlindAmount={state.bigBlind}
                  />
                </div>
              );
            })}

            {/* Hand-result banner (5s after every finished hand). */}
            {result && (
              <HandResultBanner
                winners={result.winners}
                revealed={result.revealed}
                nameForSeat={(i) =>
                  state.seats.find((s) => s.seatIndex === i)?.displayName ?? `#${i}`
                }
              />
            )}
          </div>

          {/* Action bar — sticky bottom on mobile so it's always reachable */}
          <div className="fixed bottom-0 left-0 right-0 z-30 px-3 py-3 bg-ink-950/95 backdrop-blur border-t border-white/10 lg:relative lg:bottom-auto lg:mt-6 lg:px-0 lg:py-0 lg:bg-transparent lg:border-0 lg:backdrop-blur-0">
            <div className="lg:glass-strong lg:rounded-2xl lg:p-4">
              <ActionBar
                legal={state.legalActionsForMe}
                isMyTurn={isMyTurn}
                deadline={state.toActDeadline}
                pot={state.pot}
                bigBlind={state.bigBlind}
                waitingFor={
                  state.toActSeat !== null
                    ? state.seats.find((s) => s.seatIndex === state.toActSeat)?.displayName ?? null
                    : null
                }
                onAction={sendAction}
              />
            </div>
          </div>
        </div>

        {/* Side panel */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-3 sm:gap-4">
          <div className="glass rounded-2xl p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <div>
                <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.4em] text-white/40 font-display mb-1">
                  {t('table.blinds')}
                </div>
                <div className="font-mono text-sm">
                  SB <span className="text-gold">{state.smallBlind}</span> /
                  BB <span className="text-gold ml-1">{state.bigBlind}</span>
                </div>
              </div>
              <div className="lg:hidden">
                <div className="text-[9px] uppercase tracking-[0.4em] text-white/40 font-display mb-1">
                  {t('table.handNumber').trim()}
                </div>
                <div className="font-mono text-sm">{state.handNumber}</div>
              </div>
            </div>
            {state.sidePots.length > 0 && (
              <>
                <div className="mt-3 text-[9px] sm:text-[10px] uppercase tracking-[0.4em] text-white/40 font-display mb-1">
                  {t('table.sidePots')}
                </div>
                {state.sidePots.map((p, i) => (
                  <div key={i} className="text-xs font-mono">
                    Pot {i + 1}: {p.amount.toLocaleString()} · {p.eligibleSeatIndexes.join(', ')}
                  </div>
                ))}
              </>
            )}
          </div>

          <ChatBox lines={chat} onSend={sendChat} />
        </aside>
      </div>

      {historyOpen && id && (
        <HistoryModal tableId={id} onClose={() => setHistoryOpen(false)} />
      )}
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
