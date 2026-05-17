'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { PlayingCard } from './PlayingCard';
import { fetchHandHistory } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useT } from '@/i18n/context';
import type { Card } from '@neon-poker/shared/poker';

interface HandResultRow {
  player_id: string;
  handle: string;
  display: string;
  winnings: number;
  bestHand: string | null;
  showedDown: boolean;
  holeCards: Card[];
}

interface HandRow {
  id: string;
  hand_number: number | string;
  board: Card[] | null;
  pot_total: number | string | null;
  started_at: string;
  ended_at: string | null;
  results: HandResultRow[] | null;
}

interface Props {
  tableId: string;
  onClose: () => void;
}

export function HistoryModal({ tableId, onClose }: Props) {
  const t = useT();
  const [hands, setHands] = useState<HandRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getToken();
      if (!token) {
        // No player session means there's nothing to authenticate
        // the history endpoint with. Surface this as a clear error
        // instead of an indefinite loading spinner.
        if (!cancelled) setError(t('history.errors.noSession'));
        return;
      }
      try {
        const r = await fetchHandHistory(token, tableId, 20);
        if (cancelled) return;
        if (r.status === 200) {
          setHands(r.body.hands ?? []);
        } else if (r.status === 401) {
          setError(t('history.errors.noSession'));
        } else {
          setError(r.body.error ?? t('history.errors.generic'));
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'network';
        setError(`${t('history.errors.network')} (${msg})`);
      }
    })();
    return () => { cancelled = true; };
  }, [tableId, t]);

  return (
    <Modal open onClose={onClose} title={t('history.title')} subtitle={t('history.subtitle')} width="lg">
      {error && <p className="text-status-alert text-sm">{error}</p>}
      {!error && hands === null && (
        <p className="text-ink-muted text-sm">{t('common.loading')}</p>
      )}
      {hands && hands.length === 0 && (
        <p className="text-ink-muted text-sm">{t('history.empty')}</p>
      )}
      {hands && hands.length > 0 && (
        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
          {hands.map((h) => {
            const winners = (h.results ?? [])
              .filter((r) => Number(r.winnings) > 0)
              .sort((a, b) => Number(b.winnings) - Number(a.winnings));
            const top = winners[0];
            return (
              <div
                key={h.id}
                className="surface rounded-xl px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-gold tracking-wider">
                    #{String(h.hand_number)}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-ink-muted font-mono">
                    {h.ended_at ? new Date(h.ended_at).toLocaleTimeString() : ''}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {(h.board ?? []).map((c, i) => (
                    <PlayingCard key={i} card={c} size="sm" />
                  ))}
                  <span className="ml-2 chip-bet text-gold text-sm font-mono">
                    {Number(h.pot_total ?? 0).toLocaleString()}
                  </span>
                </div>
                {top && (
                  <div className="mt-2 text-xs">
                    <span className="text-gold font-display">{top.display}</span>
                    <span className="text-ink-secondary"> · +{Number(top.winnings).toLocaleString()}</span>
                    {top.bestHand && (
                      <span className="text-ink-muted"> · {top.bestHand}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
