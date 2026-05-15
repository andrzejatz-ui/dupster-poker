'use client';

import clsx from 'clsx';
import type { PublicSeat } from '@neon-poker/shared/events';
import { PlayingCard } from './PlayingCard';
import { useT } from '@/i18n/context';

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
  const t = useT();
  if (!seat) {
    return (
      <div className="flex flex-col items-center gap-1 opacity-50">
        <div className="w-14 h-14 sm:w-24 sm:h-24 rounded-full border border-dashed border-white/15 flex items-center justify-center">
          <span className="text-[10px] sm:text-xs text-white/30 font-mono">#{seatIndex}</span>
        </div>
        <span className="text-[9px] sm:text-[10px] text-white/30 uppercase tracking-widest font-display">{t('table.empty.seat')}</span>
      </div>
    );
  }

  const stackInBB = bigBlindAmount > 0 ? `${(seat.stack / bigBlindAmount).toFixed(1)} ${t('table.bb')}` : '—';

  return (
    <div className="flex flex-col items-center gap-1.5 relative">
      {/* Dealer button — bevelled poker chip */}
      {isButton && (
        <div className="dealer-chip absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-7 sm:h-7 rounded-full text-[10px] sm:text-xs font-display font-bold flex items-center justify-center z-10">
          D
        </div>
      )}

      {/* Avatar disc */}
      <div
        className={clsx(
          'relative w-14 h-14 sm:w-24 sm:h-24 rounded-full glass-strong flex items-center justify-center',
          'transition-shadow duration-200',
          seat.isToAct && 'ring-toact',
          seat.hasFolded && 'opacity-40 grayscale',
        )}
      >
        <div className="font-display text-xs sm:text-lg">
          {seat.displayName.slice(0, 2).toUpperCase()}
        </div>
        {seat.isReconnecting && (
          <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded bg-status-alert/85 text-[9px] font-display tracking-widest">
            {t('seat.recon')}
          </span>
        )}
        {seat.isAllIn && (
          <span className="absolute -bottom-1 -left-1 px-1.5 py-0.5 rounded bg-gold text-obsidian-bg text-[9px] font-display tracking-widest">
            {t('seat.allIn')}
          </span>
        )}
      </div>

      {/* Name + stack */}
      <div className="text-center">
        <div className="text-[10px] sm:text-sm font-display truncate max-w-[4.5rem] sm:max-w-[7rem]">{seat.displayName}</div>
        <div className="text-[10px] sm:text-xs text-gold font-mono">
          {seat.stack.toLocaleString()}
          <span className="text-ink-muted ml-1 hidden sm:inline">({stackInBB})</span>
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

      {/* Current bet — gold chip + amount */}
      {seat.currentBet > 0 && (
        <div className="chip-bet mt-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-gold/15 border border-gold/40 text-gold text-[10px] sm:text-xs font-mono animate-chip-pop">
          {seat.currentBet.toLocaleString()}
        </div>
      )}
    </div>
  );
}
