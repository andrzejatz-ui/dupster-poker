import clsx from 'clsx';
import type { Card } from '@neon-poker/shared/poker';
import { BCoin } from '@/components/brand/BCoin';

interface Props {
  card?: Card | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'board';
  faceDown?: boolean;
  /** Add a subtle hover lift — set on the viewer's own hole cards. */
  hoverable?: boolean;
  className?: string;
}

/**
 * Size-tuned font-size for the BCoin sigil that sits at the centre of
 * every face-down card. Picked so the emblem fills ~45% of the card
 * height across all four variants — small enough to leave the gold
 * cross-hatch frame visible, big enough to read at every viewport.
 */
const backEmblemSize: Record<NonNullable<Props['size']>, string> = {
  xs: 'text-[10px] sm:text-[14px]',
  sm: 'text-[14px] sm:text-[20px]',
  md: 'text-[20px] sm:text-[26px]',
  lg: 'text-[24px] sm:text-[40px]',
  board: 'text-[16px] sm:text-[40px]',
};

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
  // Tightest variant — for opponent face-down cards on mobile where
  // the felt is already saturated. Still wide enough to read the
  // suit/rank when shown face up at desktop sizes.
  xs: 'w-6 h-9 text-[8px] sm:w-9 sm:h-12 sm:text-[10px]',
  sm: 'w-9 h-12 text-[10px] sm:w-11 sm:h-16 sm:text-xs',
  md: 'w-12 h-16 text-sm sm:w-16 sm:h-20 sm:text-lg',
  lg: 'w-14 h-20 text-base sm:w-24 sm:h-32 sm:text-2xl',
  // Board variant — tight on mobile so five fit across the felt without
  // overflowing the centre, full-size on desktop. Used by Board.tsx.
  board: 'w-10 h-14 text-[10px] sm:w-24 sm:h-32 sm:text-2xl',
};

const suitSize = {
  xs: 'text-sm sm:text-lg',
  sm: 'text-lg sm:text-2xl',
  md: 'text-xl sm:text-3xl',
  lg: 'text-3xl sm:text-4xl',
  board: 'text-xl sm:text-4xl',
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
        {/* Single centred ₿ emblem on the card back — classic
            poker-deck "one mark" silhouette. Replaces the previous
            vertical word-mark which read as too chunky against the
            gold cross-hatch frame. */}
        <span className={clsx('text-gold/80 leading-none', backEmblemSize[size])}>
          <BCoin />
        </span>
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
