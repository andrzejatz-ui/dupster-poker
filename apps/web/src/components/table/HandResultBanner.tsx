'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/context';

interface Winner {
  seatIndex: number;
  amount: number;
  handLabel: string | null;
}

interface Props {
  winners: Winner[];
  /** Lookup so we can show "Filip wins …" rather than "seat 3". */
  nameForSeat: (i: number) => string;
  /** Total seconds the banner stays up — used for the countdown ticker. */
  countdownSeconds?: number;
}

/**
 * Compact, top-anchored result strip. Carries the three pieces of
 * information that aren't already at each seat: who won, how much they
 * took, and how long until the next hand. The per-seat hand label and
 * the glowing winning-combo cards live on the seats and the board
 * respectively, so the banner intentionally stays small and leaves the
 * felt visible.
 */
export function HandResultBanner({
  winners,
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

  if (winners.length === 0) return null;

  // Aggregate winnings by seat — same seat may appear across multiple
  // side-pots when there are split pots.
  const totals = new Map<number, number>();
  const labels = new Map<number, string | null>();
  for (const w of winners) {
    totals.set(w.seatIndex, (totals.get(w.seatIndex) ?? 0) + w.amount);
    if (w.handLabel) labels.set(w.seatIndex, w.handLabel);
  }
  const ordered = [...totals.entries()]
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1]);
  if (ordered.length === 0) return null;

  const headline =
    ordered.length === 1
      ? t('history.banner.title', {
          name: nameForSeat(ordered[0]![0]),
          amount: ordered[0]![1].toLocaleString(),
        })
      : ordered
          .map(([s, amt]) =>
            t('history.banner.title', {
              name: nameForSeat(s),
              amount: amt.toLocaleString(),
            }),
          )
          .join(' · ');
  const topLabel = labels.get(ordered[0]![0]);

  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-2 sm:top-4 z-30 px-3 w-full max-w-md">
      <div className="surface-strong rounded-full pointer-events-auto px-4 sm:px-5 py-2 sm:py-2.5 shadow-gold-strong flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0 leading-tight">
          <span className="font-display tracking-wider text-gold text-glow-gold text-[12px] sm:text-sm truncate">
            {headline}
          </span>
          {topLabel && (
            <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.22em] text-ink-muted truncate">
              {topLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-amber-pulse" />
          <span className="font-mono text-[10px] sm:text-[11px] text-ink-secondary">
            {remaining}s
          </span>
        </div>
      </div>
    </div>
  );
}
