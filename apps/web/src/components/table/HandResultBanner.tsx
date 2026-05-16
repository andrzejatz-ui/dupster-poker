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
  bestCards: Card[];
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
 * Showdown reveal — the proof every player needs to understand the
 * outcome. Mirrors what professional poker clients (PokerStars, GG,
 * ClubGG) put on screen at showdown:
 *
 *  1. Headline that names the winner and the chip total they took.
 *  2. A row per revealed seat ordered strongest-hand-first, each
 *     showing the hole cards, the player's name, the human-readable
 *     hand category, and either the won amount or a muted "lost".
 *  3. Winners get a gold border / glow / brighter text; losers stay
 *     muted but visible, so it's instantly obvious *why* the winner
 *     beat them (e.g. "two pair, sevens and sixes" vs "two pair,
 *     sixes and fours").
 *  4. Countdown to the next deal so the table reads paced, not stuck.
 *
 * Positioned at the top of the felt so the board + seats stay visible
 * underneath — the goal is comparison, not occlusion.
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

  // Aggregate winnings + hand labels per seat (handles split pots —
  // the same seat may receive payouts from multiple side pots).
  const winningsBySeat = new Map<number, number>();
  const labelBySeat = new Map<number, string | null>();
  for (const w of winners) {
    winningsBySeat.set(w.seatIndex, (winningsBySeat.get(w.seatIndex) ?? 0) + w.amount);
    labelBySeat.set(w.seatIndex, w.handLabel ?? labelBySeat.get(w.seatIndex) ?? null);
  }

  // Build the roster: only seats that actually won chips. Losers'
  // hands stay visible at their own seats via the per-seat hand-label
  // chip — duplicating them inside the banner used to push it tall
  // enough to swallow the community board, which the user can't have.
  // Split pots (multiple seats with amount > 0) still get one row each.
  const revealedBySeat = new Map<number, Revealed>();
  for (const r of revealed) revealedBySeat.set(r.seatIndex, r);
  const orderedSeats = [...winningsBySeat.entries()]
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([seatIndex]) => seatIndex);

  const topWinnerSeat = orderedSeats.find((s) => (winningsBySeat.get(s) ?? 0) > 0);
  const headline =
    topWinnerSeat !== undefined
      ? t('history.banner.title', {
          name: nameForSeat(topWinnerSeat),
          amount: (winningsBySeat.get(topWinnerSeat) ?? 0).toLocaleString(),
        })
      : t('history.banner.titleNoWinner');
  const headlineLabel =
    topWinnerSeat !== undefined ? labelBySeat.get(topWinnerSeat) ?? null : null;

  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1.5 sm:top-3 z-30 px-2 w-full max-w-md sm:max-w-lg">
      <div className="surface-strong rounded-2xl pointer-events-auto px-3 sm:px-4 py-2 sm:py-3 shadow-gold-strong">
        {/* ◆ HAND RESULT ◆ */}
        <div className="rule-ornament font-display tracking-[0.4em] mb-1">
          ◆ {t('history.banner.handLabel')} ◆
        </div>
        {/* "X wins Y" + dominant hand category */}
        <h3 className="font-display text-sm sm:text-base text-center text-gold text-glow-gold tracking-wide leading-tight">
          {headline}
        </h3>
        {headlineLabel && (
          <p className="text-center text-[9px] sm:text-[10px] uppercase tracking-[0.24em] text-gold/80 mt-0.5 mb-1.5">
            {headlineLabel}
          </p>
        )}

        {/* Winner row(s) — split-pot safe but never tall enough to
            swallow the board. Losers' cards + hand-label chips are
            already visible at their own seats around the felt. */}
        <div className="space-y-1">
          {orderedSeats.map((seatIndex) => {
            const winning = winningsBySeat.get(seatIndex) ?? 0;
            const rev = revealedBySeat.get(seatIndex);
            const label = labelBySeat.get(seatIndex) ?? rev?.handLabel ?? null;
            const name = nameForSeat(seatIndex);
            return (
              <div
                key={seatIndex}
                className="flex items-center gap-2 rounded-lg px-2 py-1 border border-gold/55 bg-gold/[0.10] shadow-gold-soft"
              >
                {/* Hole cards — undeniable evidence of what the seat held */}
                {rev ? (
                  <div className="flex gap-0.5 shrink-0">
                    <PlayingCard card={rev.holeCards[0]} size="sm" />
                    <PlayingCard card={rev.holeCards[1]} size="sm" />
                  </div>
                ) : (
                  <div className="w-[3rem] shrink-0" />
                )}

                {/* Name + hand category */}
                <div className="flex-1 min-w-0">
                  <div className="font-display tracking-wide truncate leading-tight text-gold text-glow-gold text-sm">
                    {name}
                  </div>
                  {label && (
                    <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.18em] text-ink-muted leading-tight truncate">
                      {label}
                    </div>
                  )}
                </div>

                {/* Outcome */}
                <div className="shrink-0 text-right">
                  <div className="chip-bet font-mono text-gold text-xs sm:text-sm">
                    +{winning.toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Countdown */}
        <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[9px] sm:text-[10px] uppercase tracking-[0.22em] text-ink-muted font-display">
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-amber-pulse" />
          {t('history.banner.nextIn', { seconds: remaining.toString() })}
        </div>
      </div>
    </div>
  );
}
