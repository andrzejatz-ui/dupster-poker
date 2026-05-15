import type { Card } from '@neon-poker/shared/poker';
import { PlayingCard } from './PlayingCard';

interface Props {
  board: Card[];
  pot: number;
}

export function Board({ board, pot }: Props) {
  const slots = [0, 1, 2, 3, 4];
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-[10px] uppercase tracking-[0.4em] text-white/40 font-display">
        Pot
      </div>
      <div className="text-3xl font-display text-neon-gold text-glow-blue">
        {pot.toLocaleString()}
      </div>
      <div className="flex gap-2 mt-2">
        {slots.map((i) => {
          const card = board[i];
          return card ? (
            <PlayingCard key={i} card={card} size="lg" />
          ) : (
            <div
              key={i}
              className="w-20 h-28 rounded-lg border border-white/10 border-dashed opacity-40"
            />
          );
        })}
      </div>
    </div>
  );
}
