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

// Sizes — slightly bigger across the board so suits + ranks read at a
// glance on both phone and desktop. Mobile values stay touch-safe, sm:
// breakpoints scale up to the full premium presentation.
const sizes = {
  sm: 'w-9 h-12 text-[10px] sm:w-11 sm:h-16 sm:text-xs',
  md: 'w-12 h-16 text-sm sm:w-16 sm:h-20 sm:text-lg',
  lg: 'w-14 h-20 text-base sm:w-24 sm:h-32 sm:text-2xl',
};

const suitSize = {
  sm: 'text-lg sm:text-2xl',
  md: 'text-xl sm:text-3xl',
  lg: 'text-3xl sm:text-4xl',
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
