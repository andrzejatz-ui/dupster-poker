'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { NeonButton } from '@/components/ui/NeonButton';
import { Modal } from '@/components/ui/Modal';
import { useT } from '@/i18n/context';

interface Props {
  onClose: () => void;
}

/**
 * "Invite a friend" panel. Past iterations tried to route the user
 * through platform-specific deep links (Telegram, WhatsApp, SMS) but
 * tg:// schemes failed on desktops without the Telegram app and the
 * whole flow felt fragile.
 *
 * Now the panel does one thing well: copy the invite message to the
 * clipboard and explain — step-by-step — what to do next. The user
 * pastes it into whichever chat they like. No platform fingerprinting,
 * no failed launches.
 */

const WEB_URL = 'https://dupster-poker-web.vercel.app';
const BOT_URL = 'https://t.me/DupsterPoker_Bot';

export function InviteModal({ onClose }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const message = t('invite.message', { web: WEB_URL, bot: BOT_URL });

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      // Let the success state breathe for a few seconds, then reset
      // so the user can re-copy if they need to send a second time.
      setTimeout(() => setCopied(false), 4500);
    } catch {
      /* clipboard blocked — fall back to manual select in the preview box */
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('invite.title')}
      footer={
        <NeonButton variant="ghost" onClick={onClose}>
          {t('common.close')}
        </NeonButton>
      }
    >
      <div className="space-y-4">
        {/* Friendly hero: large icon that flips on success, body that
            walks the user through the two-step "copy → paste in chat"
            flow in plain language. */}
        <div className="text-center space-y-2 px-2">
          <div
            className={clsx(
              'text-5xl transition-transform duration-300',
              copied && 'scale-110',
            )}
          >
            {copied ? '✅' : '📋'}
          </div>
          <h3
            className={clsx(
              'font-display text-base sm:text-lg tracking-wide',
              copied ? 'text-status-success' : 'text-gold text-glow-gold',
            )}
          >
            {copied ? t('invite.copiedTitle') : t('invite.howToTitle')}
          </h3>
          <p className="text-[12px] sm:text-sm text-ink-secondary leading-relaxed max-w-sm mx-auto">
            {copied ? t('invite.copiedBody') : t('invite.howToBody')}
          </p>
        </div>

        {/* The message that gets copied — shown so the user knows
            exactly what their friend will see. Mono-ish so the URL
            stands out and is select-all-friendly as a manual fallback. */}
        <div className="rounded-xl border border-rim-bright bg-obsidian-soft/60 p-3">
          <div className="text-[9px] uppercase tracking-[0.28em] text-ink-muted mb-1.5 font-display">
            {t('invite.preview')}
          </div>
          <div className="text-[12px] sm:text-sm text-ink-secondary whitespace-pre-wrap break-words leading-relaxed select-all">
            {message}
          </div>
        </div>

        {/* Primary action — big, gold, full-width. Same button switches
            label after copy so the user can re-copy without thinking. */}
        <NeonButton
          variant="gold"
          size="lg"
          onClick={copy}
          className="w-full"
        >
          {copied
            ? `✓ ${t('invite.copyAgain')}`
            : `📋 ${t('invite.copy')}`}
        </NeonButton>

        {/* Tiny numbered hint strip — the "what to do next" walkthrough
            stays visible even after the success message so the user
            always knows the second step is "paste in any chat". */}
        <ol className="space-y-1.5 text-[11px] sm:text-xs text-ink-muted">
          <li className="flex gap-2 items-start">
            <span className="shrink-0 w-4 h-4 rounded-full bg-gold/15 border border-gold/40 text-gold text-[9px] flex items-center justify-center font-display">
              1
            </span>
            <span>{t('invite.step1')}</span>
          </li>
          <li className="flex gap-2 items-start">
            <span className="shrink-0 w-4 h-4 rounded-full bg-gold/15 border border-gold/40 text-gold text-[9px] flex items-center justify-center font-display">
              2
            </span>
            <span>{t('invite.step2')}</span>
          </li>
        </ol>
      </div>
    </Modal>
  );
}
