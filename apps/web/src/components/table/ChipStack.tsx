'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

interface Props {
  /** Chip amount the stack represents. 0 → nothing rendered. */
  amount: number;
  /** Big-blind reference for choosing chip palette (low/mid/high). */
  bigBlind?: number;
  className?: string;
}

/**
 * Visible chip stack sitting in front of a seat. Uses CSS-only bevelled
 * discs (no images, no canvas) — light on the GPU and crisp on any
 * device. Disc count is a log-scaled approximation of the amount so a
 * tiny bet shows ~1 chip and a huge all-in shows a 10-deep stack.
 *
 * Palette gradient varies with the bet's size relative to the table
 * big-blind: small = gold rim, medium = red rim, big = black-with-gold.
 * This mirrors real chip denominations without needing exact mappings.
 */
export function ChipStack({ amount, bigBlind = 0, className }: Props) {
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

  // Log-scaled disc count: 1 chip for tiny bets, capped at 10.
  const discCount = Math.max(
    1,
    Math.min(10, Math.ceil(Math.log10(safe + 1) * 2.5)),
  );

  // Palette tier based on bet size relative to the BB.
  const inBB = bigBlind > 0 ? safe / bigBlind : 1;
  const tierClass =
    inBB >= 50 ? 'chip-disc--high'
    : inBB >= 10 ? 'chip-disc--mid'
    : '';

  // Total stack height: each disc + 2.5 px offset + a bit for the top
  // disc to peek above. Width tracks the disc.
  const discHeight = 5.5; // px gap between discs
  const stackHeight = discCount * discHeight + 8;

  return (
    <div
      key={pulse}
      className={clsx('flex flex-col items-center chip-stack-grow', className)}
    >
      <div
        className="relative"
        style={{ width: 26, height: stackHeight }}
      >
        {Array.from({ length: discCount }).map((_, i) => (
          <div
            key={i}
            className={clsx('chip-disc absolute left-1/2 -translate-x-1/2', tierClass)}
            style={{ bottom: i * discHeight }}
          />
        ))}
      </div>
      <span className="mt-1 chip-bet font-mono text-[10px] sm:text-xs text-gold">
        {safe.toLocaleString()}
      </span>
    </div>
  );
}
