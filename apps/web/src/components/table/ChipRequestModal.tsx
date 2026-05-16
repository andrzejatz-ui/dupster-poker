'use client';

import { useState } from 'react';
import { NeonButton } from '@/components/ui/NeonButton';
import { NeonInput } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useT } from '@/i18n/context';

interface Props {
  /** 'topup' = ask admin for chips. 'cashout' = ask admin to take
   *  chips back (symbolic). Drives all the copy + the suggested
   *  default amount. */
  kind: 'topup' | 'cashout';
  /** Big-blind size — used to pre-fill the suggested top-up. */
  bigBlind: number;
  /** Table's buy-in — also a reasonable default ask for top-up. */
  buyIn: number;
  /** Player's current wallet balance — used to cap the cashout
   *  default at "all the chips you currently have". */
  walletBalance: number;
  onClose: () => void;
  /** Returns the server ack so the modal can show success/error. */
  onSubmit: (args: { amount?: number; message?: string }) => Promise<
    | { ok: true }
    | { ok: false; error: string }
  >;
}

/**
 * Two-way wallet-request form. `kind` swaps every label / icon so the
 * same component works for the "give me chips" and "take my chips
 * back" flow. Submit pings the server which inserts a chip_requests
 * row and notifies the admin via Telegram. The amount is optional —
 * the admin can override at approval time.
 */
export function ChipRequestModal({
  kind,
  bigBlind,
  buyIn,
  walletBalance,
  onClose,
  onSubmit,
}: Props) {
  const t = useT();
  const ns = kind === 'cashout' ? 'cashoutRequest' : 'chipRequest';
  // Sensible defaults: top-up pre-fills the table buy-in; cashout
  // pre-fills the player's full current wallet.
  const defaultAmount = kind === 'cashout' ? walletBalance : buyIn;
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
    // Cashout must specify how many chips to hold — the server can't
    // escrow "some chips". Top-up keeps the optional-amount semantics
    // since the admin chooses the grant at approve time anyway.
    if (kind === 'cashout' && amount <= 0) {
      setError(t(`${ns}.errors.amountRequired`));
      return;
    }
    setBusy(true);
    const res = await onSubmit({
      amount: amount > 0 ? amount : undefined,
      message: message.trim() || undefined,
    });
    setBusy(false);
    if (res.ok) {
      setSent(true);
      setTimeout(onClose, 1800);
    } else if (res.error === 'already_pending') {
      setError(t(`${ns}.errors.alreadyPending`));
    } else if (res.error === 'insufficient_chips') {
      setError(t(`${ns}.errors.insufficientChips`));
    } else if (res.error === 'amount_required') {
      setError(t(`${ns}.errors.amountRequired`));
    } else {
      setError(res.error);
    }
  }

  if (sent) {
    return (
      <Modal open onClose={onClose} title={t(`${ns}.sentTitle`)}>
        <div className="text-center py-4">
          <div className="text-3xl mb-3">📩</div>
          <p className="text-ink-secondary text-sm">
            {t(`${ns}.sentBody`)}
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t(`${ns}.title`)}
      subtitle={t(`${ns}.subtitle`)}
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </NeonButton>
          <NeonButton variant="gold" onClick={submit} disabled={busy}>
            {busy ? t(`${ns}.submitting`) : t(`${ns}.submit`)}
          </NeonButton>
        </>
      }
    >
      <NeonInput
        id="req-amount"
        label={t(`${ns}.amountLabel`)}
        type="number"
        inputMode="numeric"
        value={String(amount)}
        onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        hint={t(`${ns}.amountHint`, {
          bb: (bigBlind * 50).toLocaleString(),
          wallet: walletBalance.toLocaleString(),
        })}
        error={error}
      />
      <NeonInput
        id="req-message"
        label={t(`${ns}.messageLabel`)}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        hint={t(`${ns}.messageHint`)}
      />
    </Modal>
  );
}
