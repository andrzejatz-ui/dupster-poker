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
        <div className="w-9 h-9 sm:w-24 sm:h-24 rounded-full border border-dashed border-white/15 flex items-center justify-center">
          <span className="text-[9px] sm:text-xs text-white/30 font-mono">#{seatIndex}</span>
        </div>
        <span className="text-[9px] sm:text-[10px] text-white/30 uppercase tracking-widest font-display">{t('table.empty.seat')}</span>
      </div>
    );
  }

  const stackInBB = bigBlindAmount > 0 ? `${(seat.stack / bigBlindAmount).toFixed(1)} ${t('table.bb')}` : '—';
  const winningSet = winningCards ? new Set<Card>(winningCards) : null;
  const cardIsWinning = (c?: Card) => !!(c && winningSet && winningSet.has(c));

  // Smart initials for the avatar fallback. The default first-2-chars
  // logic made every bot look identical ("BO" for Bot Sam, Bot Riley,
  // Bot Casey, …). Strip the "Bot " prefix so the real first letters
  // come through (SA / RI / CA), giving each seat a distinguishable
  // disc when no avatar image is set.
  const nameForInitials = seat.displayName.replace(/^bot\s+/i, '').trim();
  const initials = (nameForInitials || seat.displayName).slice(0, 2).toUpperCase();
  // The "BOT" badge is redundant when the display name already starts
  // with "Bot" — saves a corner pill on mobile where every pixel
  // counts. Real bots whose display name doesn't reveal them keep it.
  const showBotBadge = seat.isBot && !/^bot\b/i.test(seat.displayName);

  return (
    <div className="flex flex-col items-center gap-1.5 relative">
      {/* Dealer button — bevelled poker chip. Sized down on mobile so
          it doesn't crash into the avatar disc when both are 36 px. */}
      {isButton && (
        <div className="dealer-chip absolute -top-0.5 -right-0.5 sm:-top-2 sm:-right-2 w-4 h-4 sm:w-7 sm:h-7 rounded-full text-[8px] sm:text-xs font-display font-bold flex items-center justify-center z-10">
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

      {/* Avatar disc — split into two containers so the status badges
          (BOT, ALL-IN, RECON, PAUSED) can hang past the circle's edge
          without being eaten by the avatar-side overflow-hidden.
          Mobile size dropped to 36 px so a 6-seat layout doesn't
          crash the avatar disc into the board cards or adjacent seats
          on tight phone viewports. */}
      <div className="relative w-9 h-9 sm:w-24 sm:h-24">
        <div
          className={clsx(
            'absolute inset-0 rounded-full surface-strong flex items-center justify-center overflow-hidden',
            'transition-shadow duration-200',
            seat.isToAct && 'ring-toact',
            seat.hasFolded && 'opacity-40 grayscale',
          )}
        >
          {isMine ? (
            // Viewer's own seat → render the brand Eye in its default
            // sentinel look (gold iris + dark pupil tracking the cursor).
            // The eye IS the avatar — we don't push any photo into it.
            <div className="absolute inset-0 flex items-center justify-center">
              <Eye size={110} />
            </div>
          ) : seat.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={seat.avatarUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="font-display text-[10px] sm:text-lg">
              {initials}
            </div>
          )}
        </div>
        {seat.isReconnecting && (
          <span className="absolute -bottom-1 -right-1 px-1 py-0 sm:px-1.5 sm:py-0.5 rounded bg-status-alert/85 text-[8px] sm:text-[9px] font-display tracking-widest z-10">
            {t('seat.recon')}
          </span>
        )}
        {showBotBadge && (
          <span className="absolute -top-1 -left-1 px-1 py-0 sm:px-1.5 sm:py-0.5 rounded bg-ink-muted/85 text-obsidian-bg text-[8px] sm:text-[9px] font-display tracking-widest z-10">
            BOT
          </span>
        )}
        {seat.isAllIn && (
          <span className="absolute -bottom-1 -left-1 px-1 py-0 sm:px-1.5 sm:py-0.5 rounded bg-gold text-obsidian-bg text-[8px] sm:text-[9px] font-display tracking-widest z-10">
            {t('seat.allIn')}
          </span>
        )}
        {seat.isPaused && (
          <span className="absolute -bottom-1 -left-1 px-1 py-0 sm:px-1.5 sm:py-0.5 rounded bg-status-warning/85 text-obsidian-bg text-[8px] sm:text-[9px] font-display tracking-widest z-10">
            {t('seat.paused')}
          </span>
        )}
      </div>

      {/* Name + stack — single tight block on mobile so a 6-seat table
          doesn't stack two text lines per seat between the avatar and
          the cards. */}
      <div className="text-center leading-tight">
        <div className="text-[9px] sm:text-sm font-display truncate max-w-[4.5rem] sm:max-w-[7rem]">{seat.displayName}</div>
        <div className="text-[9px] sm:text-xs text-gold font-mono">
          {seat.stack.toLocaleString()}
          <span className="text-ink-muted ml-1 hidden sm:inline">({stackInBB})</span>
        </div>
      </div>

      {/* Hole cards (own face up, others face down or revealed).
          The viewer's OWN seat renders cards a size bigger so they
          stay legible on tight phone viewports — these are the
          single most important pieces of information on screen. */}
      <div className="flex gap-1 mt-1">
        {seat.holeCards ? (
          <>
            <PlayingCard
              card={seat.holeCards[0]}
              size={isMine ? 'md' : 'sm'}
              hoverable
              className={clsx(cardIsWinning(seat.holeCards[0]) && 'card-winning')}
            />
            <PlayingCard
              card={seat.holeCards[1]}
              size={isMine ? 'md' : 'sm'}
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
          result is being displayed. Winners get a gold treatment.
          Tightened on mobile (smaller font + tracking + max-width)
          so labels like "TWO PAIR, KINGS AND THREES" don't shoot
          past the felt edge when the seat sits near a corner. */}
      {handLabel && (
        <div
          className={clsx(
            'mt-1 px-1.5 py-0.5 rounded-full text-[8px] sm:text-[10px] uppercase tracking-[0.1em] sm:tracking-[0.18em] font-display text-center leading-tight max-w-[5.5rem] sm:max-w-none',
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
