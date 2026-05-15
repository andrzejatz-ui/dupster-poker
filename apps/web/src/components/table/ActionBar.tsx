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

  return (
    <div className="w-full">
      <Countdown deadline={deadline} />
      <div className="flex flex-wrap gap-2 sm:gap-3 mt-3 justify-center items-center">
        {legal.canFold && (
          <NeonButton size="sm" variant="danger" onClick={() => send({ type: 'fold' })}>
            {t('action.fold')}
          </NeonButton>
        )}
        {legal.canCheck && (
          <NeonButton size="sm" variant="ghost" onClick={() => send({ type: 'check' })}>
            {t('action.check')}
          </NeonButton>
        )}
        {legal.canCall && (
          <NeonButton size="sm" variant="primary" onClick={() => send({ type: 'call' })}>
            {t('action.call')} {legal.callAmount.toLocaleString()}
          </NeonButton>
        )}
        {(legal.canBet || legal.canRaise) && (() => {
          const minVal = legal.canBet ? legal.minBet : legal.minRaise;
          const maxVal = legal.canBet ? Number.MAX_SAFE_INTEGER : legal.maxRaise;
          const clamp = (v: number) => Math.max(minVal, Math.min(maxVal, Math.floor(v)));

          // Quick-bet pills sized against the current pot / big blind.
          // Only show pills whose resulting amount falls within the
          // legal min..max window so we never offer an illegal action.
          const candidates: Array<{ label: string; value: number }> = [];
          candidates.push({ label: 'Min', value: minVal });
          if (bigBlind > 0 && legal.canBet) {
            candidates.push({ label: '3 BB', value: clamp(bigBlind * 3) });
          }
          if (pot > 0) {
            candidates.push({ label: '½ Pot', value: clamp(Math.floor(pot / 2)) });
            candidates.push({ label: 'Pot',  value: clamp(pot) });
            candidates.push({ label: '2× Pot', value: clamp(pot * 2) });
          }
          // De-duplicate adjacent values (e.g. when minVal already equals 3 BB).
          const seen = new Set<number>();
          const pills = candidates.filter((c) => {
            if (c.value < minVal || c.value > maxVal) return false;
            if (seen.has(c.value)) return false;
            seen.add(c.value);
            return true;
          });

          return (
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {pills.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setRaiseAmount(p.value)}
                  className={
                    'px-2 py-1 rounded-md border text-[10px] sm:text-xs font-mono ' +
                    (target === p.value
                      ? 'border-gold/70 bg-gold/15 text-gold'
                      : 'border-rim-bright text-ink-secondary hover:border-gold/50 hover:bg-gold/[0.06]')
                  }
                >
                  {p.label}
                </button>
              ))}
              <input
                type="number"
                inputMode="numeric"
                min={minVal}
                max={legal.canBet ? undefined : legal.maxRaise}
                value={target}
                onChange={(e) => setRaiseAmount(Number(e.target.value))}
                className="w-20 sm:w-28 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md bg-obsidian-soft border border-rim-bright text-gold font-mono text-sm focus:border-gold focus:shadow-gold-soft outline-none"
              />
              <NeonButton
                size="sm"
                variant="gold"
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
            </div>
          );
        })()}
        {legal.canAllIn && (
          <NeonButton size="sm" variant="gold" onClick={() => send({ type: 'all_in' })}>
            {t('action.allIn')}
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
