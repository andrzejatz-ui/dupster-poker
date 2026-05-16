'use client';

import clsx from 'clsx';
import { NeonButton } from '@/components/ui/NeonButton';
import { useT } from '@/i18n/context';
import type { TableSummary } from '@neon-poker/shared/events';

interface Props {
  table: TableSummary;
  onJoin: () => void;
}

/**
 * Lobby table card — replaces the basic NeonCard layout with a
 * premium-feeling tile: stake tier label, dotted player count, live
 * status pill with a pulse dot, big gold call-to-action. Mirrors what
 * cash-game clients (PokerStars cash lobby, Run It Once) put on a
 * table tile so this lobby reads as part of the same genre instead
 * of a generic list.
 */
export function TableCard({ table, onJoin }: Props) {
  const t = useT();
  const full = table.seated >= table.maxPlayers;
  const tier = stakeTierFor(table.bigBlind);
  const tierLabel =
    tier === 'micro' ? 'MICRO' :
    tier === 'low' ? 'LOW' :
    tier === 'mid' ? 'MID' :
    tier === 'high' ? 'HIGH' : 'NOSEBLEED';
  const tierColor =
    tier === 'micro' ? 'text-ink-muted'
    : tier === 'low' ? 'text-status-success'
    : tier === 'mid' ? 'text-gold'
    : tier === 'high' ? 'text-rose-400'
    : 'text-violet-300';

  return (
    <div className={clsx('table-card p-3 sm:p-4 flex flex-col gap-3', full && 'table-card--full')}>
      {/* Header row — name + tier kicker + status pill */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={clsx('font-display text-[10px] uppercase tracking-[0.32em]', tierColor)}>
            {tierLabel} · {t('lobby.stakes')}
          </div>
          <h3 className="font-display text-lg sm:text-xl truncate leading-tight mt-0.5">
            {table.name}
          </h3>
        </div>
        <StatusPill inHand={table.inHand} full={full} />
      </div>

      {/* Stakes + buy-in row — mono font + chip glyphs */}
      <div className="flex items-baseline gap-3 text-xs sm:text-sm font-mono">
        <div className="flex items-baseline gap-1">
          <span className="text-ink-muted text-[10px] uppercase tracking-widest">SB</span>
          <span className="text-gold">{table.smallBlind}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-ink-muted text-[10px] uppercase tracking-widest">BB</span>
          <span className="text-gold">{table.bigBlind}</span>
        </div>
        <div className="flex items-baseline gap-1 ml-auto">
          <span className="text-ink-muted text-[10px] uppercase tracking-widest">{t('lobby.buyIn')}</span>
          <span className="chip-bet text-gold font-bold">{table.buyIn.toLocaleString()}</span>
        </div>
      </div>

      {/* Seat dots + count */}
      <div className="flex items-center gap-2">
        <SeatDots seated={table.seated} max={table.maxPlayers} />
        <span className="text-[11px] text-ink-muted font-mono">
          {table.seated}/{table.maxPlayers}
        </span>
        <NeonButton
          variant={full ? 'ghost' : 'gold'}
          size="sm"
          onClick={onJoin}
          disabled={full}
          className="ml-auto"
        >
          {full ? t('lobby.tableFull') : t('lobby.join')}
        </NeonButton>
      </div>
    </div>
  );
}

function StatusPill({ inHand, full }: { inHand: boolean; full: boolean }) {
  const t = useT();
  if (full) {
    return (
      <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.22em] font-display px-2 py-1 rounded-md border border-ink-muted/40 bg-ink-muted/10 text-ink-muted">
        {t('lobby.tableFull')}
      </span>
    );
  }
  return (
    <span
      className={clsx(
        'flex items-center gap-1.5 text-[9px] sm:text-[10px] uppercase tracking-[0.22em] font-display px-2 py-1 rounded-md border',
        inHand
          ? 'text-status-alert border-status-alert/40 bg-status-alert/10'
          : 'text-status-success border-status-success/40 bg-status-success/10',
      )}
    >
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full animate-amber-pulse',
          inHand ? 'bg-status-alert' : 'bg-status-success',
        )}
      />
      {inHand ? t('lobby.inHand') : t('lobby.waiting')}
    </span>
  );
}

/** Row of small seat indicators (filled = seated, hollow = empty). */
function SeatDots({ seated, max }: { seated: number; max: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={clsx(
            'w-2 h-2 rounded-full border',
            i < seated
              ? 'bg-gold border-gold shadow-gold-soft'
              : 'bg-transparent border-rim-bright',
          )}
        />
      ))}
    </div>
  );
}

/** Maps big-blind size onto a five-tier stake ladder used for the kicker label. */
function stakeTierFor(bb: number): 'micro' | 'low' | 'mid' | 'high' | 'nosebleed' {
  if (bb <= 10) return 'micro';
  if (bb <= 100) return 'low';
  if (bb <= 500) return 'mid';
  if (bb <= 2000) return 'high';
  return 'nosebleed';
}
