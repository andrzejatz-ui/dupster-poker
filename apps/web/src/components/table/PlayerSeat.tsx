import clsx from 'clsx';
import type { PublicSeat } from '@neon-poker/shared/events';
import { PlayingCard } from './PlayingCard';

interface Props {
  seat: PublicSeat | null;
  seatIndex: number;
  isButton: boolean;
  bigBlindAmount: number;
}

/**
 * One player slot around the felt. Empty seats render a faint silhouette.
 */
export function PlayerSeat({ seat, seatIndex, isButton, bigBlindAmount }: Props) {
  if (!seat) {
    return (
      <div className="flex flex-col items-center gap-1 opacity-50">
        <div className="w-24 h-24 rounded-full border border-dashed border-white/15 flex items-center justify-center">
          <span className="text-xs text-white/30 font-mono">#{seatIndex}</span>
        </div>
        <span className="text-[10px] text-white/30 uppercase tracking-widest font-display">Frei</span>
      </div>
    );
  }

  const stackInBB = bigBlindAmount > 0 ? (seat.stack / bigBlindAmount).toFixed(1) : '—';

  return (
    <div className="flex flex-col items-center gap-1.5 relative">
      {/* Dealer button */}
      {isButton && (
        <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white text-ink-900 text-xs font-display font-bold flex items-center justify-center shadow-lg z-10">
          D
        </div>
      )}

      {/* Avatar disc */}
      <div
        className={clsx(
          'relative w-24 h-24 rounded-full glass-strong flex items-center justify-center',
          'transition-shadow duration-200',
          seat.isToAct && 'ring-toact',
          seat.hasFolded && 'opacity-40 grayscale',
        )}
      >
        <div className="font-display text-lg">
          {seat.displayName.slice(0, 2).toUpperCase()}
        </div>
        {seat.isReconnecting && (
          <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded bg-rose-500/80 text-[9px] font-display tracking-widest">
            RECON
          </span>
        )}
        {seat.isAllIn && (
          <span className="absolute -bottom-1 -left-1 px-1.5 py-0.5 rounded bg-neon-gold/85 text-ink-900 text-[9px] font-display tracking-widest">
            ALL-IN
          </span>
        )}
      </div>

      {/* Name + stack */}
      <div className="text-center">
        <div className="text-sm font-display truncate max-w-[7rem]">{seat.displayName}</div>
        <div className="text-xs text-neon-gold font-mono">
          {seat.stack.toLocaleString()}
          <span className="text-white/30 ml-1">({stackInBB} BB)</span>
        </div>
      </div>

      {/* Hole cards (own face up, others face down or revealed) */}
      <div className="flex gap-1 mt-1">
        {seat.holeCards ? (
          <>
            <PlayingCard card={seat.holeCards[0]} size="sm" />
            <PlayingCard card={seat.holeCards[1]} size="sm" />
          </>
        ) : seat.revealedCards ? (
          <>
            <PlayingCard card={seat.revealedCards[0]} size="sm" />
            <PlayingCard card={seat.revealedCards[1]} size="sm" />
          </>
        ) : !seat.hasFolded ? (
          <>
            <PlayingCard faceDown size="sm" />
            <PlayingCard faceDown size="sm" />
          </>
        ) : null}
      </div>

      {/* Current bet */}
      {seat.currentBet > 0 && (
        <div className="mt-1 px-2 py-0.5 rounded-full bg-neon-cyan/15 border border-neon-cyan/40 text-neon-cyan text-xs font-mono animate-chip-pop">
          {seat.currentBet.toLocaleString()}
        </div>
      )}
    </div>
  );
}
