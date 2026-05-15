'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { Card } from '@neon-poker/shared/poker';
import { PlayingCard } from './PlayingCard';
import { useT } from '@/i18n/context';

interface Winner {
  seatIndex: number;
  amount: number;
  handLabel: string | null;
}

interface Revealed {
  seatIndex: number;
  holeCards: [Card, Card];
  handLabel: string;
}

interface Props {
  winners: Winner[];
  revealed: Revealed[];
  /** Lookup so we can show "Filip wins …" rather than "seat 3". */
  nameForSeat: (i: number) => string;
  /** Total seconds the banner stays up — used for the countdown ticker. */
  countdownSeconds?: number;
}

/**
 * Centered glass banner that announces the result of a finished hand.
 * Shows every player who reached showdown (or the lone uncalled winner),
 * highlights actual winners with a gold ring + gold pot share, and
 * counts down to the next deal. Purely presentational — caller owns
 * the mount/unmount lifecycle.
 */
export function HandResultBanner({
  winners,
  revealed,
  nameForSeat,
  countdownSeconds = 8,
}: Props) {
  const t = useT();
  const [remaining, setRemaining] = useState(countdownSeconds);

  useEffect(() => {
    setRemaining(countdownSeconds);
    const id = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [countdownSeconds]);

  if (winners.length === 0 && revealed.length === 0) return null;

  // Per-seat winnings (handles split pots — same seat may appear
  // in multiple winner rows for different side pots).
  const winningsBySeat = new Map<number, number>();
  const labelBySeat = new Map<number, string | null>();
  for (const w of winners) {
    winningsBySeat.set(w.seatIndex, (winningsBySeat.get(w.seatIndex) ?? 0) + w.amount);
    labelBySeat.set(w.seatIndex, w.handLabel ?? labelBySeat.get(w.seatIndex) ?? null);
  }

  // Build a unified roster: every revealed seat + every winner seat.
  // Winners that didn't go to showdown (uncalled win) have no revealed
  // entry — they still appear in the roster, just without cards.
  const seatsInRoster = new Set<number>();
  for (const r of revealed) seatsInRoster.add(r.seatIndex);
  for (const w of winners) seatsInRoster.add(w.seatIndex);
  const revealedBySeat = new Map<number, Revealed>();
  for (const r of revealed) revealedBySeat.set(r.seatIndex, r);

  // Order: winners first (by amount desc), then non-winners (revealed).
  const orderedSeats = [...seatsInRoster].sort((a, b) => {
    const wa = winningsBySeat.get(a) ?? 0;
    const wb = winningsBySeat.get(b) ?? 0;
    if (wa !== wb) return wb - wa;
    return a - b;
  });

  const topWinner = orderedSeats.find((s) => (winningsBySeat.get(s) ?? 0) > 0);
  const headline = topWinner !== undefined
    ? t('history.banner.title', {
        name: nameForSeat(topWinner),
        amount: (winningsBySeat.get(topWinner) ?? 0).toLocaleString(),
      })
    : t('history.banner.titleNoWinner');

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-3">
      <div
        className={clsx(
          'surface-strong rounded-2xl pointer-events-auto',
          'w-full max-w-lg shadow-gold-strong',
          'px-5 sm:px-6 py-4 sm:py-5',
        )}
      >
        {/* Headline */}
        <div className="rule-ornament font-display tracking-[0.4em] mb-2">
          ◆ {t('history.banner.handLabel')} ◆
        </div>
        <h3 className="font-display text-base sm:text-lg text-center text-gold text-glow-gold tracking-wider mb-3 sm:mb-4">
          {headline}
        </h3>

        {/* Per-player rows */}
        <div className="space-y-2.5 max-h-[44vh] overflow-y-auto pr-1">
          {orderedSeats.map((seatIndex) => {
            const winning = winningsBySeat.get(seatIndex) ?? 0;
            const isWinner = winning > 0;
            const rev = revealedBySeat.get(seatIndex);
            const label = labelBySeat.get(seatIndex) ?? rev?.handLabel ?? null;
            const name = nameForSeat(seatIndex);
            return (
              <div
                key={seatIndex}
                className={clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 border',
                  isWinner
                    ? 'border-gold/55 bg-gold/[0.08] shadow-gold-soft'
                    : 'border-rim-faint bg-obsidian-soft/60 opacity-80',
                )}
              >
                {/* Cards */}
                {rev ? (
                  <div className="flex gap-1 shrink-0">
                    <PlayingCard card={rev.holeCards[0]} size="sm" />
                    <PlayingCard card={rev.holeCards[1]} size="sm" />
                  </div>
                ) : (
                  <div className="w-[3.5rem] shrink-0" />
                )}

                {/* Name + hand label */}
                <div className="flex-1 min-w-0">
                  <div
                    className={clsx(
                      'font-display tracking-wider truncate',
                      isWinner ? 'text-gold text-glow-gold text-base sm:text-lg' : 'text-ink-secondary text-sm',
                    )}
                  >
                    {name}
                  </div>
                  {label && (
                    <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-ink-muted mt-0.5 truncate">
                      {label}
                    </div>
                  )}
                </div>

                {/* Winnings */}
                <div className="shrink-0 text-right">
                  {isWinner ? (
                    <div className="chip-bet font-mono text-gold text-sm sm:text-base">
                      +{winning.toLocaleString()}
                    </div>
                  ) : (
                    <div className="text-[11px] uppercase tracking-widest text-ink-muted">
                      {t('history.banner.lost')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Countdown */}
        <div className="mt-3 sm:mt-4 flex items-center justify-center gap-2 text-[10px] sm:text-[11px] uppercase tracking-[0.3em] text-ink-muted font-display">
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-amber-pulse" />
          {t('history.banner.nextIn', { seconds: remaining.toString() })}
        </div>
      </div>
    </div>
  );
}
