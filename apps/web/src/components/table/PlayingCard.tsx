import clsx from 'clsx';
import type { Card } from '@neon-poker/shared/poker';

interface Props {
  card?: Card | null;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  className?: string;
}

const SUIT_GLYPHS: Record<string, { glyph: string; red: boolean }> = {
  c: { glyph: '♣', red: false },
  s: { glyph: '♠', red: false },
  h: { glyph: '♥', red: true },
  d: { glyph: '♦', red: true },
};

const sizes = {
  sm: 'w-9 h-14 text-[10px]',
  md: 'w-14 h-20 text-base',
  lg: 'w-20 h-28 text-xl',
};

export function PlayingCard({ card, size = 'md', faceDown = false, className }: Props) {
  if (faceDown || !card) {
    return (
      <div
        className={clsx(
          'card-back rounded-lg flex items-center justify-center',
          sizes[size],
          className,
        )}
      >
        <span className="text-neon-cyan/60 font-display tracking-widest text-[10px]">NP</span>
      </div>
    );
  }
  const rank = card[0];
  const suit = SUIT_GLYPHS[card[1]!]!;
  return (
    <div
      className={clsx(
        'card-face rounded-lg flex flex-col justify-between p-1.5 font-display font-bold',
        'shadow-[0_6px_18px_-6px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,0,0,0.18)]',
        suit.red ? 'text-rose-600' : 'text-slate-900',
        'animate-card-flip',
        sizes[size],
        className,
      )}
    >
      <div className="leading-none">{rank === 'T' ? '10' : rank}</div>
      <div className="text-center text-2xl leading-none">{suit.glyph}</div>
      <div className="leading-none text-right rotate-180">
        {rank === 'T' ? '10' : rank}
      </div>
    </div>
  );
}
