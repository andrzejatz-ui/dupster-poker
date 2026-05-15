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
  onAction: (action: PlayerAction, clientActionId: string) => void;
}

export function ActionBar({ legal, isMyTurn, deadline, onAction }: Props) {
  const t = useT();
  const [raiseAmount, setRaiseAmount] = useState<number | null>(null);

  if (!isMyTurn || !legal) {
    return (
      <div className="flex items-center justify-center gap-2 text-white/40 text-sm font-display tracking-wider">
        <span className="w-2 h-2 rounded-full bg-white/20 animate-pulse-soft" />
        {t('action.waiting')}
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
        {(legal.canBet || legal.canRaise) && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={legal.canBet ? legal.minBet : legal.minRaise}
              max={legal.canBet ? undefined : legal.maxRaise}
              value={target}
              onChange={(e) => setRaiseAmount(Number(e.target.value))}
              className="w-20 sm:w-28 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-ink-900/80 border border-white/10 text-neon-gold font-mono text-sm focus:border-neon-gold/60 focus:shadow-[0_0_18px_rgba(255,209,102,0.35)] outline-none"
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
        )}
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
    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-neon-cyan to-neon-violet transition-[width] duration-300"
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  );
}
