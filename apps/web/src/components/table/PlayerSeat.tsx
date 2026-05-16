'use client';

import clsx from 'clsx';
import type { PublicSeat } from '@neon-poker/shared/events';
import type { Card } from '@neon-poker/shared/poker';
import { PlayingCard } from './PlayingCard';
import { ChipStack } from './ChipStack';
import { Eye } from '@/components/brand/Eye';
import { useT } from '@/i18n/context';

interface Props {
  seat: PublicSeat | null;
  seatIndex: number;
  isButton: boolean;
  bigBlindAmount: number;
  /** Showdown label for this seat (e.g. "Two pair, Kings and Nines"). */
  handLabel?: string | null;
  /** The 5 cards that scored this seat's hand — used to glow the winning combo. */
  winningCards?: Card[] | null;
  /** True if this seat actually won chips this hand (gold accent + emphasised label). */
  isWinningSeat?: boolean;
  /** Chips this seat won this hand — shown as a floating "+X" gold badge above the avatar. */
  winningAmount?: number;
  /** True if this is the viewer's own seat — renders the avatar as the
   *  animated, cursor-tracking Eye instead of a static image. */
  isMine?: boolean;
}

/**
 * One player slot around the felt. Empty seats render a faint silhouette.
 */
export function PlayerSeat({
  seat,
  seatIndex,
  isButton,
  bigBlindAmount,
  handLabel = null,
  winningCards = null,
  isWinningSeat = false,
  winningAmount = 0,
  isMine = false,
}: Props) {
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
  const winningSet = winningCards ? new Set<Card>(winningCards) : null;
  const cardIsWinning = (c?: Card) => !!(c && winningSet && winningSet.has(c));

  return (
    <div className="flex flex-col items-center gap-1.5 relative">
      {/* Dealer button — bevelled poker chip */}
      {isButton && (
        <div className="dealer-chip absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-7 sm:h-7 rounded-full text-[10px] sm:text-xs font-display font-bold flex items-center justify-center z-10">
          D
        </div>
      )}

      {/* Floating "+winnings" badge during the result window — the
          banner is intentionally small now, so the actual chip number
          is delivered right at the winning seat. */}
      {winningAmount > 0 && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 chip-bet font-mono text-gold text-[11px] sm:text-sm bg-gold/10 border border-gold/55 rounded-full px-2.5 py-0.5 shadow-gold-soft animate-amber-pulse whitespace-nowrap">
          +{winningAmount.toLocaleString()}
        </div>
      )}

      {/* Avatar disc */}
      <div
        className={clsx(
          'relative w-14 h-14 sm:w-24 sm:h-24 rounded-full surface-strong flex items-center justify-center overflow-hidden',
          'transition-shadow duration-200',
          seat.isToAct && 'ring-toact',
          seat.hasFolded && 'opacity-40 grayscale',
        )}
      >
        {isMine ? (
          // Viewer's own seat → render the avatar as the brand Eye so
          // the player's face follows the cursor like everywhere else
          // in the app. Eye picks up the image from session storage if
          // not passed in; we pass seat.avatarUrl explicitly to stay
          // accurate when an avatar has just been changed.
          <div className="absolute inset-0 flex items-center justify-center">
            <Eye imageUrl={seat.avatarUrl ?? null} size={110} />
          </div>
        ) : seat.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={seat.avatarUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="font-display text-xs sm:text-lg">
            {seat.displayName.slice(0, 2).toUpperCase()}
          </div>
        )}
        {seat.isReconnecting && (
          <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded bg-status-alert/85 text-[9px] font-display tracking-widest">
            {t('seat.recon')}
          </span>
        )}
        {seat.isBot && (
          <span className="absolute -top-1 -left-1 px-1.5 py-0.5 rounded bg-ink-muted/85 text-obsidian-bg text-[9px] font-display tracking-widest">
            BOT
          </span>
        )}
        {seat.isAllIn && (
          <span className="absolute -bottom-1 -left-1 px-1.5 py-0.5 rounded bg-gold text-obsidian-bg text-[9px] font-display tracking-widest">
            {t('seat.allIn')}
          </span>
        )}
        {seat.isPaused && (
          <span className="absolute -bottom-1 -left-1 px-1.5 py-0.5 rounded bg-status-warning/85 text-obsidian-bg text-[9px] font-display tracking-widest">
            {t('seat.paused')}
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
            <PlayingCard
              card={seat.holeCards[0]}
              size="sm"
              hoverable
              className={clsx(cardIsWinning(seat.holeCards[0]) && 'card-winning')}
            />
            <PlayingCard
              card={seat.holeCards[1]}
              size="sm"
              hoverable
              className={clsx(cardIsWinning(seat.holeCards[1]) && 'card-winning')}
            />
          </>
        ) : seat.revealedCards ? (
          <>
            <PlayingCard
              card={seat.revealedCards[0]}
              size="sm"
              className={clsx(cardIsWinning(seat.revealedCards[0]) && 'card-winning')}
            />
            <PlayingCard
              card={seat.revealedCards[1]}
              size="sm"
              className={clsx(cardIsWinning(seat.revealedCards[1]) && 'card-winning')}
            />
          </>
        ) : !seat.hasFolded ? (
          <>
            <PlayingCard faceDown size="sm" />
            <PlayingCard faceDown size="sm" />
          </>
        ) : null}
      </div>

      {/* Showdown hand label — persistent under the cards while the
          result is being displayed. Winners get a gold treatment. */}
      {handLabel && (
        <div
          className={clsx(
            'mt-1 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] uppercase tracking-[0.18em] font-display whitespace-nowrap',
            isWinningSeat
              ? 'bg-gold text-obsidian-bg shadow-gold-soft'
              : 'bg-obsidian-soft/70 text-ink-secondary border border-rim-faint',
          )}
        >
          {handLabel}
        </div>
      )}

      {/* Live chip stack — visible chips pushed into the pot */}
      {seat.currentBet > 0 && (
        <ChipStack
          amount={seat.currentBet}
          bigBlind={bigBlindAmount}
          className="mt-1"
        />
      )}
    </div>
  );
}
