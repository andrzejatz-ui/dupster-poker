'use client';

import type { Card } from '@neon-poker/shared/poker';
import { PlayingCard } from './PlayingCard';

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
}

/**
 * Centered banner that announces the winner(s) of a finished hand
 * plus their hole cards. Auto-dismissed by the caller after a few
 * seconds — this component is purely presentational.
 */
export function HandResultBanner({ winners, revealed, nameForSeat }: Props) {
  if (winners.length === 0) return null;

  // Group winners by seat so split pots show each player once.
  const totals = new Map<number, { name: string; amount: number; label: string | null }>();
  for (const w of winners) {
    const cur = totals.get(w.seatIndex);
    totals.set(w.seatIndex, {
      name: nameForSeat(w.seatIndex),
      amount: (cur?.amount ?? 0) + w.amount,
      label: w.handLabel ?? cur?.label ?? null,
    });
  }
  const cards = new Map<number, [Card, Card]>();
  for (const r of revealed) cards.set(r.seatIndex, r.holeCards);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20 px-4">
      <div className="surface-strong rounded-2xl shadow-gold-strong px-5 py-4 max-w-md w-full text-center pointer-events-auto">
        <div className="rule-ornament font-display tracking-[0.4em] mb-2">◆ HAND ◆</div>
        <div className="flex flex-col gap-3">
          {[...totals.entries()].map(([seatIndex, info]) => (
            <div key={seatIndex} className="flex flex-col items-center gap-1">
              <div className="font-display text-lg text-gold text-glow-gold">
                {info.name} <span className="text-ink-secondary">·</span>{' '}
                <span className="chip-bet">+{info.amount.toLocaleString()}</span>
              </div>
              {info.label && (
                <div className="text-[11px] uppercase tracking-[0.22em] text-ink-secondary">
                  {info.label}
                </div>
              )}
              {cards.has(seatIndex) && (
                <div className="flex gap-1 mt-1">
                  <PlayingCard card={cards.get(seatIndex)![0]} size="sm" />
                  <PlayingCard card={cards.get(seatIndex)![1]} size="sm" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
