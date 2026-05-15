'use client';

import { useEffect, useRef, useState } from 'react';
import type { Card } from '@neon-poker/shared/poker';
import { PlayingCard } from './PlayingCard';
import { Eye } from '@/components/brand/Eye';
import { playDealCard } from '@/lib/sounds';
import { useT } from '@/i18n/context';

interface Props {
  board: Card[];
  pot: number;
  /**
   * Bumped externally whenever a new hand starts. Used to retrigger the
   * croupier-eye laser-flash animation. Defaults to 0 — flash on every
   * board-length change is enough for street transitions.
   */
  handToken?: string | null;
}

export function Board({ board, pot, handToken = null }: Props) {
  const t = useT();
  const [flash, setFlash] = useState(0);
  const prevBoardLen = useRef(board.length);
  const prevHand = useRef(handToken);

  useEffect(() => {
    const newCardsArrived = board.length > prevBoardLen.current;
    const handChanged = handToken !== prevHand.current && handToken !== null;
    if (newCardsArrived || handChanged) {
      setFlash((n) => n + 1);
      const burst = handChanged ? 2 : Math.max(1, board.length - prevBoardLen.current);
      for (let i = 0; i < burst; i++) {
        setTimeout(() => playDealCard(), i * 90);
      }
    }
    prevBoardLen.current = board.length;
    prevHand.current = handToken;
  }, [board.length, handToken]);

  const slots = [0, 1, 2, 3, 4];
  return (
    <div className="flex flex-col items-center gap-2 sm:gap-3 w-48 sm:w-80 relative">
      {/* Croupier eye + laser flash */}
      <div className="relative flex flex-col items-center">
        {flash > 0 && <span key={flash} className="laser-flash" aria-hidden />}
        <Eye size={56} className="opacity-90 relative z-10" />
      </div>

      <div className="rule-ornament w-full font-display tracking-[0.4em]">
        ◆ {t('table.pot')} ◆
      </div>
      <div className="chip-bet text-xl sm:text-3xl font-display text-gold text-glow-gold">
        {pot.toLocaleString()}
      </div>
      <div className="flex gap-1 sm:gap-2 mt-1 sm:mt-2">
        {slots.map((i) => {
          const card = board[i];
          return card ? (
            <PlayingCard key={i} card={card} size="lg" />
          ) : (
            <div
              key={i}
              className="w-12 h-16 sm:w-20 sm:h-28 rounded-lg border border-white/10 border-dashed opacity-40"
            />
          );
        })}
      </div>
    </div>
  );
}
