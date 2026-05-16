'use client';

import { useEffect, useMemo, useState } from 'react';
import { NeonButton } from '@/components/ui/NeonButton';
import { NeonInput } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useT } from '@/i18n/context';

interface Props {
  /** Current seat stack — drives the headline + "you'll have" preview. */
  currentStack: number;
  /** Table's hard cap (cfg.buyIn * MAX_BUY_IN_MULTIPLIER). */
  maxBuyIn: number;
  /** Player's off-table wallet balance. */
  walletBalance: number;
  /** Big-blind size — shown for context ("you'll have N BB"). */
  bigBlind: number;
  onClose: () => void;
  /** Returns the ack from the server. Component owns the UI side; the
   *  parent handles the actual socket emit + result-toast. */
  onSubmit: (amount: number) => Promise<
    | { ok: true; newStack: number }
    | { ok: false; error: string }
  >;
}

/**
 * Mid-session top-up dialog. Picks an amount, validates client-side
 * against both the table stack cap and the wallet balance, then emits
 * the server call. Pre-set buttons cover the common spots (25 / 50 /
 * 100 % of the maximum legal top-up) plus a free-text input for any
 * other amount. Submit is disabled until the value is in range.
 *
 * Looks intentionally similar to the admin ChipsDialog so the muscle
 * memory transfers — same preset grid, same gold-on-obsidian style.
 */
export function TopUpModal({
  currentStack,
  maxBuyIn,
  walletBalance,
  bigBlind,
  onClose,
  onSubmit,
}: Props) {
  const t = useT();

  // Maximum legal top-up = min(cap headroom, wallet).
  const maxLegal = useMemo(
    () => Math.max(0, Math.min(maxBuyIn - currentStack, walletBalance)),
    [maxBuyIn, currentStack, walletBalance],
  );
  // Minimum is the smaller of "1 BB" and "all you've got" — covers the
  // edge case of a tiny wallet that can't hit a full big blind.
  const minLegal = Math.max(1, Math.min(bigBlind, maxLegal));

  const [amount, setAmount] = useState<number>(maxLegal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount(maxLegal);
  }, [maxLegal]);

  function applyPreset(fraction: number) {
    const v = Math.max(minLegal, Math.min(maxLegal, Math.floor(maxLegal * fraction)));
    setAmount(v);
  }

  async function submit() {
    if (amount < minLegal || amount > maxLegal) {
      setError(t('topup.errors.outOfRange'));
      return;
    }
    setError(null);
    setBusy(true);
    const res = await onSubmit(amount);
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error);
  }

  const newStack = currentStack + amount;
  const stackInBB = bigBlind > 0 ? (newStack / bigBlind).toFixed(1) : '—';

  return (
    <Modal
      open
      onClose={onClose}
      title={t('topup.title')}
      subtitle={t('topup.subtitle', {
        wallet: walletBalance.toLocaleString(),
        stack: currentStack.toLocaleString(),
      })}
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </NeonButton>
          <NeonButton
            variant="gold"
            onClick={submit}
            disabled={busy || amount < minLegal || amount > maxLegal}
          >
            {busy
              ? t('topup.submitting')
              : t('topup.submit', { amount: amount.toLocaleString() })}
          </NeonButton>
        </>
      }
    >
      <div className="flex gap-2 mb-2">
        {[
          { label: '25%', frac: 0.25 },
          { label: '50%', frac: 0.5 },
          { label: '75%', frac: 0.75 },
          { label: t('topup.max'), frac: 1 },
        ].map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.frac)}
            className="flex-1 px-2 py-1.5 rounded-md border border-rim-bright text-gold text-xs font-mono hover:bg-gold/10"
          >
            {p.label}
          </button>
        ))}
      </div>

      <NeonInput
        id="topup-amount"
        label={t('topup.amountLabel')}
        type="number"
        inputMode="numeric"
        value={String(amount)}
        onChange={(e) =>
          setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))
        }
        hint={t('topup.amountHint', {
          min: minLegal.toLocaleString(),
          max: maxLegal.toLocaleString(),
        })}
        error={error}
      />

      <div className="mt-3 rounded-lg surface px-3 py-2 text-[11px] sm:text-xs">
        <div className="flex justify-between text-ink-muted">
          <span>{t('topup.previewStack')}</span>
          <span className="font-mono text-gold">
            {newStack.toLocaleString()}{' '}
            <span className="text-ink-muted">({stackInBB} BB)</span>
          </span>
        </div>
        <div className="flex justify-between text-ink-muted mt-0.5">
          <span>{t('topup.previewWallet')}</span>
          <span className="font-mono">
            {(walletBalance - amount).toLocaleString()}
          </span>
        </div>
      </div>
    </Modal>
  );
}
