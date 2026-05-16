'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

interface Props {
  /** Current pot size — drives the disc count via a log scale. */
  amount: number;
  className?: string;
}

/**
 * Visible chip pile sitting in the middle of the felt — the pot, in
 * physical form, next to the community cards. Mirrors how a real
 * dealer keeps the pot: a column of mixed denominations, deeper as
 * the pot grows.
 *
 * Disc count scales log-ish with the amount: a tiny pot shows 3
 * chips, a monster pot tops out around 14. Stack mixes the three
 * .chip-disc tiers (gold / red / black) by position — bottom is the
 * highest denomination, top is the lowest, exactly how a live dealer
 * would stack a winning push.
 *
 * Pulse-animates when the amount changes so the pile visually "grows"
 * as bets land in it. Returns null when the pot is empty.
 */
export function PotPile({ amount, className }: Props) {
  const safe = Math.max(0, Math.floor(amount));
  const prev = useRef(safe);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (safe !== prev.current) {
      prev.current = safe;
      setPulse((n) => n + 1);
    }
  }, [safe]);

  if (safe === 0) return null;

  const discCount = Math.max(
    3,
    Math.min(14, Math.ceil(Math.log10(safe + 1) * 3.2)),
  );
  const discHeight = 6.5; // px overlap between adjacent discs
  const stackHeight = discCount * discHeight + 10;

  return (
    <div
      key={pulse}
      className={clsx('chip-stack-grow', className)}
      aria-hidden="true"
    >
      <div className="relative mx-auto" style={{ width: 36, height: stackHeight }}>
        {Array.from({ length: discCount }).map((_, i) => {
          // Bottom third = high (black), middle third = mid (red),
          // top third = low (gold). Reads as "dealer pre-sorted the
          // pot before pushing it" — denser money sits on the bottom.
          const ratio = i / Math.max(1, discCount - 1);
          const tier =
            ratio < 0.34 ? 'chip-disc--high'
            : ratio < 0.67 ? 'chip-disc--mid'
            : '';
          return (
            <div
              key={i}
              className={clsx(
                'chip-disc chip-disc--pot absolute left-1/2 -translate-x-1/2',
                tier,
              )}
              style={{ bottom: i * discHeight }}
            />
          );
        })}
      </div>
    </div>
  );
}
