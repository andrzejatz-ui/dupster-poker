import clsx from 'clsx';
import type { Card } from '@neon-poker/shared/poker';

interface Props {
  card?: Card | null;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  /** Add a subtle hover lift — set on the viewer's own hole cards. */
  hoverable?: boolean;
  className?: string;
}

const SUIT_GLYPHS: Record<string, { glyph: string; red: boolean }> = {
  c: { glyph: '♣', red: false },
  s: { glyph: '♠', red: false },
  h: { glyph: '♥', red: true },
  d: { glyph: '♦', red: true },
};

// Sizes are responsive: smaller on mobile, full size from sm: breakpoint on.
const sizes = {
  sm: 'w-7 h-10 text-[9px] sm:w-9 sm:h-14 sm:text-[10px]',
  md: 'w-10 h-14 text-xs sm:w-14 sm:h-20 sm:text-base',
  lg: 'w-12 h-16 text-sm sm:w-20 sm:h-28 sm:text-xl',
};

const suitSize = {
  sm: 'text-base sm:text-2xl',
  md: 'text-lg sm:text-2xl',
  lg: 'text-2xl sm:text-3xl',
};

export function PlayingCard({ card, size = 'md', faceDown = false, hoverable = false, className }: Props) {
  if (faceDown || !card) {
    return (
      <div
        className={clsx(
          'card-back rounded-lg flex items-center justify-center card-deal-in',
          sizes[size],
          className,
        )}
      >
        <span className="text-gold/70 font-display tracking-[0.3em] text-[10px]">D</span>
      </div>
    );
  }
  const rank = card[0];
  const suit = SUIT_GLYPHS[card[1]!]!;
  return (
    <div
      className={clsx(
        'card-face rounded-lg flex flex-col justify-between p-1.5 font-display font-bold',
        suit.red ? 'text-rose-600' : 'text-slate-900',
        'animate-card-flip',
        hoverable && 'card-hoverable',
        sizes[size],
        className,
      )}
    >
      <div className="leading-none relative z-10">{rank === 'T' ? '10' : rank}</div>
      <div className={clsx('text-center leading-none relative z-10', suitSize[size])}>{suit.glyph}</div>
      <div className="leading-none text-right rotate-180 relative z-10">
        {rank === 'T' ? '10' : rank}
      </div>
    </div>
  );
}
