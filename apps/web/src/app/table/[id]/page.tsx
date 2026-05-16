'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ChipTransferOverlay } from '@/components/table/ChipTransferOverlay';
import { TopUpModal } from '@/components/table/TopUpModal';
import { ChipRequestModal } from '@/components/table/ChipRequestModal';
import { Eye } from '@/components/brand/Eye';
import { fetchChatHistory } from '@/lib/api';
import { getProfile, setStoredProfile } from '@/lib/session';
import { getToken } from '@/lib/session';
import { getAdminToken } from '@/lib/admin';
import {
  playActionAllIn,
  playActionBet,
  playActionCall,
  playActionCheck,
  playActionFold,
  playActionRaise,
  playCashRegister,
  playChatDing,
  playGameOver,
} from '@/lib/sounds';
import type { Card } from '@neon-poker/shared/poker';
import { useT } from '@/i18n/context';

interface ResultSnapshot {
  winners: Array<{ seatIndex: number; amount: number; handLabel: string | null }>;
  revealed: Array<{
    seatIndex: number;
    holeCards: [Card, Card];
    handLabel: string;
    bestCards: Card[];
  }>;
  /**
   * The five community cards as they stood when the hand ended. We
   * snapshot them here because the server clears table.board in
   * finishHand() right after the result event, so a re-read of the
   * live state during the result window would yield an empty board.
   */
  board: Card[];
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
  const [chatOpen, setChatOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [chipReqOpen, setChipReqOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [, force] = useState(0);
  /** Live mirror of state.mySeatIndex so the socket-event closures
   *  can pick the right post-hand sound without re-subscribing. */
  const mySeatRef = useRef<number | null>(null);
  /** Wallet balance kept in sync with chip_update broadcasts so the
   *  Top-up modal can preview "wallet after" without round-trips. */
  const [walletBalance, setWalletBalance] = useState<number>(
    () => getProfile()?.chips ?? 0,
  );
  /** Same admin-detection trick as the lobby — surfaces a "Back to
   *  Admin" button when the player session was minted from the admin
   *  Play shortcut so the admin can hop back without re-logging in. */
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    setIsAdmin(getAdminToken() !== null);
  }, []);

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

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!socket || !id) return;
    socket.on('server:table:state', (s) => {
      if (s.tableId === id) {
        setState(s);
        mySeatRef.current = s.mySeatIndex;
        if (s.handNumber > 0 && s.phase !== 'showdown' && s.phase !== 'waiting') {
          setResult(null);
        }
      }
    });
    socket.on('server:table:chat', (msg) => {
      if (msg.tableId !== id) return;
      setChat((c) => [...c, msg]);
      const myName = state?.seats.find((s) => s.seatIndex === state.mySeatIndex)?.displayName;
      if (msg.from !== myName) {
        playChatDing();
        // Mobile-only: bump the unread badge if the drawer is closed.
        setUnreadChat((n) => (chatOpen ? n : n + 1));
      }
    });
    socket.on('server:table:error', (e) => alert(e.message));
    socket.on('server:table:action', (p) => {
      if (p.tableId !== id) return;
      switch (p.action) {
        case 'fold':   playActionFold();  break;
        case 'check':  playActionCheck(); break;
        case 'call':   playActionCall();  break;
        case 'bet':    playActionBet();   break;
        case 'raise':  playActionRaise(); break;
        case 'all_in': playActionAllIn(); break;
      }
    });
    socket.on('server:account:chip_update', (p) => {
      // Keep the local wallet mirror fresh and persist to session storage
      // so the lobby + header reads stay consistent if the player navigates.
      setWalletBalance(p.chips);
      const cur = getProfile();
      if (cur) setStoredProfile({ ...cur, chips: p.chips });
    });
    socket.on('server:table:hand:result', (payload) => {
      if (payload.tableId !== id) return;
      setResult({
        winners: payload.winners,
        revealed: payload.revealed,
        board: payload.board,
      });
      // Play a sound only for the viewer who actually had skin in the
      // hand — winner gets the cash-register, loser gets the game-over
      // motif, spectators stay silent. mySeatRef is the latest seat
      // index from the most recent state push, so the closure doesn't
      // go stale if the user changes seats between hands.
      const mySeat = mySeatRef.current;
      if (mySeat !== null) {
        const iWon = payload.winners.some(
          (w) => w.seatIndex === mySeat && w.amount > 0,
        );
        const iWasInShowdown = payload.revealed.some((r) => r.seatIndex === mySeat);
        if (iWon) playCashRegister();
        else if (iWasInShowdown) playGameOver();
      }
      setTimeout(() => setResult(null), 15500);
    });
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

  /** Wraps the topup socket emit in a Promise so the modal can await the
   *  server's verdict and decide whether to close or show the error. */
  function sendTopUp(amount: number): Promise<
    | { ok: true; newStack: number }
    | { ok: false; error: string }
  > {
    return new Promise((resolve) => {
      if (!socket) {
        resolve({ ok: false, error: 'no_socket' });
        return;
      }
      socket.emit('client:player:topup', { amount }, (res) => {
        if (res.ok) resolve({ ok: true, newStack: res.newStack });
        else resolve({ ok: false, error: res.error });
      });
    });
  }

  /** Sends a chip-grant request to the admin via socket → DB → Telegram. */
  function sendChipRequest(args: { amount?: number; message?: string }): Promise<
    | { ok: true }
    | { ok: false; error: string }
  > {
    return new Promise((resolve) => {
      if (!socket) {
        resolve({ ok: false, error: 'no_socket' });
        return;
      }
      socket.emit('client:player:chip_request', args, (res) => {
        if (res.ok) resolve({ ok: true });
        else resolve({ ok: false, error: res.error });
      });
    });
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

  function toggleChat() {
    setChatOpen((open) => {
      if (!open) setUnreadChat(0);
      return !open;
    });
  }

  if (!state) {
    return (
      <main className="viewport-fit flex items-center justify-center text-white/40">
        <span className="font-mono">{t('table.connecting')}  ({status})</span>
      </main>
    );
  }

  const isMyTurn = state.mySeatIndex !== null && state.toActSeat === state.mySeatIndex;

  return (
    <main className="viewport-fit flex flex-col">
      {/* Header — extra right padding leaves room for the floating language switcher */}
      <div className="shrink-0 pl-3 pr-24 sm:pl-6 sm:pr-36 py-2 sm:py-3 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="opacity-80 shrink-0">
            <Eye size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.4em] text-white/40 font-display truncate">
              {t('table.phaseLabel')} · {state.phase.toUpperCase()}
            </div>
            <h1 className="font-display text-base sm:text-2xl truncate">{state.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <span className="hidden sm:inline text-xs font-mono text-ink-muted">{t('table.handNumber')}{state.handNumber}</span>
          {state.mySeatIndex !== null && state.canTopUp && (() => {
            const mySeat = state.seats.find((s) => s.seatIndex === state.mySeatIndex);
            const stack = mySeat?.stack ?? 0;
            // Two distinct buttons depending on wallet state:
            //   wallet > 0 and stack below cap → Top-up modal
            //   wallet = 0 → Chip-request modal (ping the admin)
            if (walletBalance > 0 && stack < state.maxBuyIn) {
              return (
                <NeonButton size="sm" variant="gold" onClick={() => setTopUpOpen(true)}>
                  💰 {t('action.topUp')}
                </NeonButton>
              );
            }
            if (walletBalance === 0) {
              return (
                <NeonButton size="sm" variant="gold" onClick={() => setChipReqOpen(true)}>
                  🙋 {t('action.requestChips')}
                </NeonButton>
              );
            }
            return null;
          })()}
          {state.mySeatIndex !== null && (() => {
            const mySeat = state.seats.find((s) => s.seatIndex === state.mySeatIndex);
            const paused = mySeat?.isPaused ?? false;
            return (
              <NeonButton size="sm" variant={paused ? 'gold' : 'ghost'} onClick={togglePause}>
                {paused ? t('action.resume') : t('action.pause')}
              </NeonButton>
            );
          })()}
          {/* Chat toggle — mobile only. Desktop has it permanently
              in the side panel so the button stays hidden via lg:hidden. */}
          <button
            type="button"
            onClick={toggleChat}
            className="relative lg:hidden px-2.5 py-1.5 rounded-md border border-rim-bright text-[10px] uppercase tracking-[0.22em] text-ink-secondary font-display hover:border-gold/50"
            aria-label={t('chat.title')}
          >
            {t('chat.title')}
            {unreadChat > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-gold text-obsidian-bg text-[9px] font-bold flex items-center justify-center">
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </button>
          <NeonButton size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
            {t('history.button')}
          </NeonButton>
          {isAdmin && (
            <NeonButton size="sm" variant="gold" onClick={() => router.push('/admin')}>
              🛡 {t('common.backToAdmin')}
            </NeonButton>
          )}
          <NeonButton size="sm" variant="ghost" onClick={leave}>
            {t('table.leave')}
          </NeonButton>
        </div>
      </div>

      {/* Felt + side panel — flex-1 + min-h-0 lets the felt shrink to
          fit the viewport instead of pushing the action bar offscreen. */}
      <div className="flex-1 min-h-0 px-2 sm:px-6 py-2 sm:py-4 grid grid-cols-12 gap-3 sm:gap-5">
        <div className="col-span-12 lg:col-span-9 flex flex-col min-h-0">
          <div className="felt rounded-[40px] sm:rounded-[110px] relative flex-1 min-h-0">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Board
                // During the result window the server has already
                // cleared table.board in finishHand(), so we render
                // the snapshot captured from the hand:result event —
                // otherwise the community cards would vanish the
                // moment the banner appears.
                board={result?.board && result.board.length > 0 ? result.board : state.board}
                pot={state.pot}
                handToken={state.handId}
                winningCards={
                  result
                    ? (() => {
                        const winnerSeats = new Set(
                          result.winners.filter((w) => w.amount > 0).map((w) => w.seatIndex),
                        );
                        const cards = new Set<Card>();
                        for (const r of result.revealed) {
                          if (!winnerSeats.has(r.seatIndex)) continue;
                          for (const c of r.bestCards) cards.add(c);
                        }
                        return cards;
                      })()
                    : null
                }
              />
            </div>

            {seatPositions.map((pos, idx) => {
              const base = seatsByIndex.get(idx) ?? null;
              const reveal = result?.revealed.find((r) => r.seatIndex === idx);
              const seat = base && reveal && !base.holeCards
                ? { ...base, revealedCards: reveal.holeCards }
                : base;
              const winningAmount =
                result?.winners
                  .filter((w) => w.seatIndex === idx && w.amount > 0)
                  .reduce((s, w) => s + w.amount, 0) ?? 0;
              const isWinningSeat = winningAmount > 0;
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
                    handLabel={reveal?.handLabel ?? null}
                    winningCards={reveal?.bestCards ?? null}
                    isWinningSeat={isWinningSeat}
                    winningAmount={winningAmount}
                    isMine={state.mySeatIndex === idx}
                  />
                </div>
              );
            })}

            {result && (
              <ChipTransferOverlay
                winners={result.winners}
                revealed={result.revealed}
                seatPositions={seatPositions}
              />
            )}

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

          {/* Action bar — inline at the bottom of the felt column, no
              longer fixed/floating. Keeps the viewport free of scroll. */}
          <div className="shrink-0 mt-2 sm:mt-3 px-2 py-2 sm:p-3 surface rounded-xl lg:glass-strong lg:rounded-2xl">
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

        {/* Side panel — only visible on lg+. Mobile uses the drawer below. */}
        <aside className="hidden lg:flex col-span-3 flex-col gap-3 min-h-0">
          <div className="glass rounded-2xl p-3 shrink-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.4em] text-white/40 font-display mb-1">
                  {t('table.blinds')}
                </div>
                <div className="font-mono text-sm">
                  SB <span className="text-gold">{state.smallBlind}</span> /
                  BB <span className="text-gold ml-1">{state.bigBlind}</span>
                </div>
              </div>
            </div>
            {state.sidePots.length > 0 && (
              <>
                <div className="mt-3 text-[10px] uppercase tracking-[0.4em] text-white/40 font-display mb-1">
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

          <div className="flex-1 min-h-0">
            <ChatBox lines={chat} onSend={sendChat} />
          </div>
        </aside>
      </div>

      {/* Mobile chat drawer — bottom sheet on phones so the way back to
          the table is always a thumb-reachable "← Back to table" bar at
          the top of the sheet plus a sticky close button at the bottom.
          Previously a thin tap target meant "I went into chat and can't
          get back" was a real complaint. */}
      {chatOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 flex flex-col"
          onClick={() => setChatOpen(false)}
        >
          <div className="flex-1 bg-black/55 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full h-[78%] bg-ink-950/97 border-t border-rim-bright shadow-2xl flex flex-col rounded-t-2xl"
          >
            {/* Prominent back/close bar — full-width tap target, gold
                arrow, large text, plus the dragging affordance pill. */}
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="shrink-0 w-full flex flex-col items-center pt-2 pb-2.5 border-b border-rim-faint hover:bg-gold/5"
            >
              <span className="w-10 h-1 rounded-full bg-rim-bright mb-2" aria-hidden />
              <span className="flex items-center gap-2 font-display text-[12px] uppercase tracking-[0.28em] text-gold">
                <span className="text-base leading-none">←</span>
                {t('chat.backToTable')}
              </span>
            </button>
            <div className="flex-1 min-h-0 p-2">
              <ChatBox lines={chat} onSend={sendChat} />
            </div>
            {/* Sticky bottom close — second exit point so even after the
                user scrolls deep into the chat, getting back is one tap. */}
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="shrink-0 mx-3 mb-3 py-2 rounded-xl border border-gold/55 bg-gold/10 hover:bg-gold/15 font-display text-[11px] uppercase tracking-[0.28em] text-gold text-glow-gold"
            >
              {t('chat.closeAndBack')}
            </button>
          </div>
        </div>
      )}

      {historyOpen && id && (
        <HistoryModal tableId={id} onClose={() => setHistoryOpen(false)} />
      )}

      {topUpOpen && state.mySeatIndex !== null && (() => {
        const mySeat = state.seats.find((s) => s.seatIndex === state.mySeatIndex);
        if (!mySeat) return null;
        return (
          <TopUpModal
            currentStack={mySeat.stack}
            maxBuyIn={state.maxBuyIn}
            walletBalance={walletBalance}
            bigBlind={state.bigBlind}
            onClose={() => setTopUpOpen(false)}
            onSubmit={sendTopUp}
          />
        );
      })()}

      {chipReqOpen && (
        <ChipRequestModal
          bigBlind={state.bigBlind}
          buyIn={state.buyIn}
          onClose={() => setChipReqOpen(false)}
          onSubmit={sendChipRequest}
        />
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
    const angle = (Math.PI / 2) + (i * 2 * Math.PI) / n;
    const x = 50 + 42 * Math.cos(angle);
    const y = 50 + 38 * Math.sin(angle);
    positions.push({ x, y });
  }
  return positions;
}
