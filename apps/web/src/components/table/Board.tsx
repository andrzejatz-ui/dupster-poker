'use client';

import type { Card } from '@neon-poker/shared/poker';
import { PlayingCard } from './PlayingCard';
import { useT } from '@/i18n/context';

interface Props {
  board: Card[];
  pot: number;
}

export function Board({ board, pot }: Props) {
  const t = useT();
  const slots = [0, 1, 2, 3, 4];
  return (
    <div className="flex flex-col items-center gap-2 sm:gap-3">
      <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.4em] text-ink-muted font-display">
        {t('table.pot')}
      </div>
      <div className="text-xl sm:text-3xl font-display text-gold text-glow-gold">
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
