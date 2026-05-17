'use client';

import { useState } from 'react';
import { ulid } from 'ulid';
import type { LegalActions } from '@neon-poker/shared/events';
import type { PlayerAction } from '@neon-poker/shared/poker';
import { NeonButton } from '@/components/ui/NeonButton';
import { useT } from '@/i18n/context';

interface Props {
  legal: LegalActions | null;
  isMyTurn: boolean;
  deadline: number | null;
  /** Name of the player currently to act (used in the waiting indicator). */
  waitingFor?: string | null;
  /** Current pot — used to compute the ½-Pot / Pot quick-bet pills. */
  pot?: number;
  /** Big blind — used as a sensible 2 BB / 3 BB shortcut. */
  bigBlind?: number;
  onAction: (action: PlayerAction, clientActionId: string) => void;
}

export function ActionBar({
  legal,
  isMyTurn,
  deadline,
  waitingFor,
  pot = 0,
  bigBlind = 0,
  onAction,
}: Props) {
  const t = useT();
  const [raiseAmount, setRaiseAmount] = useState<number | null>(null);

  if (!isMyTurn || !legal) {
    return (
      <div className="flex items-center justify-center gap-2 text-ink-muted text-sm font-display tracking-wider">
        <span className="w-2 h-2 rounded-full bg-gold/70 animate-pulse-soft" />
        {waitingFor
          ? t('action.waitingFor', { name: waitingFor })
          : t('action.waiting')}
      </div>
    );
  }

  const target = raiseAmount ?? (legal.minRaise || legal.minBet);
  const send = (action: PlayerAction) => onAction(action, ulid());

  // Compute the bet/raise UI data once so we can split it into two
  // micro-rows on mobile (quick pills strip + button strip) without
  // walking the legal-action tree twice.
  const betPanel = (legal.canBet || legal.canRaise) ? (() => {
    const minVal = legal.canBet ? legal.minBet : legal.minRaise;
    const maxVal = legal.canBet ? Number.MAX_SAFE_INTEGER : legal.maxRaise;
    const clamp = (v: number) => Math.max(minVal, Math.min(maxVal, Math.floor(v)));
    const candidates: Array<{ label: string; value: number }> = [];
    candidates.push({ label: 'Min', value: minVal });
    if (bigBlind > 0 && legal.canBet) {
      candidates.push({ label: '3 BB', value: clamp(bigBlind * 3) });
    }
    if (pot > 0) {
      candidates.push({ label: '½', value: clamp(Math.floor(pot / 2)) });
      candidates.push({ label: 'Pot', value: clamp(pot) });
      candidates.push({ label: '2×', value: clamp(pot * 2) });
    }
    const seen = new Set<number>();
    const pills = candidates.filter((c) => {
      if (c.value < minVal || c.value > maxVal) return false;
      if (seen.has(c.value)) return false;
      seen.add(c.value);
      return true;
    });
    return { minVal, maxVal, pills } as const;
  })() : null;

  return (
    <div className="w-full">
      <Countdown deadline={deadline} />
      {/* Quick-bet pills — appears only when bet/raise is legal. Lives
          above the main button row on phone so the pills + the action
          buttons stay on two thin strips instead of wrapping into
          three or four cluttered lines. */}
      {betPanel && betPanel.pills.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 sm:gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 justify-center">
          {betPanel.pills.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setRaiseAmount(p.value)}
              className={
                'shrink-0 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md border text-[10px] sm:text-xs font-mono leading-none ' +
                (target === p.value
                  ? 'border-gold/70 bg-gold/15 text-gold'
                  : 'border-rim-bright text-ink-secondary hover:border-gold/50 hover:bg-gold/[0.06]')
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {/* Primary action strip — always one row. Fold | Check/Call |
          bet input + Bet/Raise | All-in. flex-nowrap keeps it on one
          line; the input is the only flexible element so on truly
          tight viewports it shrinks before the buttons do. */}
      <div className="mt-1.5 sm:mt-2 flex items-center gap-1.5 sm:gap-2 justify-center flex-nowrap">
        {legal.canFold && (
          <NeonButton size="sm" variant="danger"
                      className="!px-2 sm:!px-3 !text-[10px] sm:!text-xs"
                      onClick={() => send({ type: 'fold' })}>
            {t('action.fold')}
          </NeonButton>
        )}
        {legal.canCheck && (
          <NeonButton size="sm" variant="ghost"
                      className="!px-2 sm:!px-3 !text-[10px] sm:!text-xs"
                      onClick={() => send({ type: 'check' })}>
            {t('action.check')}
          </NeonButton>
        )}
        {legal.canCall && (
          <NeonButton size="sm" variant="primary"
                      className="!px-2 sm:!px-3 !text-[10px] sm:!text-xs"
                      onClick={() => send({ type: 'call' })}>
            {t('action.call')} {legal.callAmount.toLocaleString()}
          </NeonButton>
        )}
        {betPanel && (
          <>
            <input
              type="number"
              inputMode="numeric"
              min={betPanel.minVal}
              max={legal.canBet ? undefined : legal.maxRaise}
              value={target}
              onChange={(e) => setRaiseAmount(Number(e.target.value))}
              className="w-14 sm:w-24 min-w-0 px-1.5 sm:px-3 py-1 sm:py-2 rounded-md bg-obsidian-soft border border-rim-bright text-gold font-mono text-[11px] sm:text-sm focus:border-gold focus:shadow-gold-soft outline-none text-right"
            />
            <NeonButton
              size="sm"
              variant="gold"
              className="!px-2 sm:!px-3 !text-[10px] sm:!text-xs"
              onClick={() =>
                send(
                  legal.canBet
                    ? { type: 'bet', amount: target }
                    : { type: 'raise', amount: target },
                )
              }
            >
              {legal.canBet ? t('action.bet') : t('action.raise')}
            </NeonButton>
          </>
        )}
        {legal.canAllIn && (
          <NeonButton size="sm" variant="gold"
                      className="!px-2 sm:!px-3 !text-[10px] sm:!text-xs"
                      onClick={() => send({ type: 'all_in' })}>
            <span className="hidden sm:inline">{t('action.allIn')}</span>
            <span className="sm:hidden">ALL</span>
          </NeonButton>
        )}
      </div>
    </div>
  );
}

function Countdown({ deadline }: { deadline: number | null }) {
  const remaining = deadline ? Math.max(0, deadline - Date.now()) : 0;
  const pct = deadline ? Math.min(1, remaining / 25_000) : 0;
  return (
    <div className="w-full h-px bg-rim-cool overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-gold-dim via-gold to-gold-dim transition-[width] duration-300"
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  );
}
