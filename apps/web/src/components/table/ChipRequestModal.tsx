'use client';

import { useState } from 'react';
import { NeonButton } from '@/components/ui/NeonButton';
import { NeonInput } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useT } from '@/i18n/context';

interface Props {
  /** Big-blind size — used to pre-fill a sensible default request. */
  bigBlind: number;
  /** Table's buy-in — also a reasonable default ask. */
  buyIn: number;
  onClose: () => void;
  /** Returns the server ack so the modal can show success/error. */
  onSubmit: (args: { amount?: number; message?: string }) => Promise<
    | { ok: true }
    | { ok: false; error: string }
  >;
}

/**
 * Player-facing "I'm out of chips, please grant me some" form. Pings
 * the admin via socket → DB row → Telegram bot. The amount is
 * optional (admin can override anyway); a short message is also
 * optional for context. Submit shows a "sent, wait for admin"
 * confirmation, then closes.
 */
export function ChipRequestModal({ bigBlind, buyIn, onClose, onSubmit }: Props) {
  const t = useT();
  const [amount, setAmount] = useState<number>(buyIn);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
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
      setError(t('chipRequest.errors.alreadyPending'));
    } else {
      setError(res.error);
    }
  }

  if (sent) {
    return (
      <Modal open onClose={onClose} title={t('chipRequest.sentTitle')}>
        <div className="text-center py-4">
          <div className="text-3xl mb-3">📩</div>
          <p className="text-ink-secondary text-sm">
            {t('chipRequest.sentBody')}
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('chipRequest.title')}
      subtitle={t('chipRequest.subtitle')}
      footer={
        <>
          <NeonButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </NeonButton>
          <NeonButton variant="gold" onClick={submit} disabled={busy}>
            {busy ? t('chipRequest.submitting') : t('chipRequest.submit')}
          </NeonButton>
        </>
      }
    >
      <NeonInput
        id="req-amount"
        label={t('chipRequest.amountLabel')}
        type="number"
        inputMode="numeric"
        value={String(amount)}
        onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        hint={t('chipRequest.amountHint', {
          bb: (bigBlind * 50).toLocaleString(),
        })}
        error={error}
      />
      <NeonInput
        id="req-message"
        label={t('chipRequest.messageLabel')}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        hint={t('chipRequest.messageHint')}
      />
    </Modal>
  );
}
