'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { NeonButton } from '@/components/ui/NeonButton';
import { Modal } from '@/components/ui/Modal';
import { useT } from '@/i18n/context';

interface Props {
  onClose: () => void;
}

/**
 * Telegram WebApp surface — exposes only the two methods we need to
 * route share targets correctly when the page runs inside the
 * Telegram client. openTelegramLink keeps Telegram routes inside
 * the app; openLink hands everything else off to the OS so the
 * user's installed WhatsApp / SMS apps fire properly.
 */
interface TgWebAppMinimal {
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
}

function tgWebApp(): TgWebAppMinimal | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Telegram?: { WebApp?: TgWebAppMinimal } })
    .Telegram?.WebApp ?? null;
}

/**
 * Invite-a-friend share sheet. Prefers the native Web Share API when
 * the browser offers it (most mobile + Edge + Safari + Telegram WebView
 * expose it), falls back to platform-specific deep-links — Telegram
 * share, WhatsApp, SMS — plus a one-tap copy-link button. All exits
 * carry the same canonical message so the receiving end is predictable.
 *
 * The bot URL + web URL are referenced from a single place at the top
 * of this file so a future rename is a one-line change.
 */

const BOT_URL = 'https://t.me/DupsterPoker_Bot';
const WEB_URL = 'https://dupster-poker-web.vercel.app';

export function InviteModal({ onClose }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [hasNativeShare, setHasNativeShare] = useState(false);

  useEffect(() => {
    // Inside Telegram, hide navigator.share — the WebView exposes it
    // but it fires nothing on Telegram Desktop and is flaky on iOS,
    // leading to "I tapped Share and nothing happened" reports. Our
    // per-platform buttons cover the same ground reliably.
    const tg = tgWebApp();
    setHasNativeShare(
      tg === null &&
        typeof window !== 'undefined' &&
        typeof (navigator as Navigator & { share?: unknown }).share === 'function',
    );
  }, []);

  const message = t('invite.shareMessage', { link: BOT_URL, web: WEB_URL });
  const encodedMessage = encodeURIComponent(message);
  const encodedBotUrl = encodeURIComponent(BOT_URL);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — fall back to selecting the visible text. */
    }
  }

  async function shareNative() {
    try {
      await (navigator as Navigator & {
        share: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
      }).share({
        title: 'Bluffuminati',
        text: message,
        url: BOT_URL,
      });
    } catch {
      /* user cancelled or share failed — no-op */
    }
  }

  /**
   * Silent best-effort clipboard copy used by every share button as a
   * safety net: if Telegram's intermediate share page fails to launch
   * the tg:// app handler on a desktop without Telegram installed, or
   * any other share target silently no-ops, the user still has the
   * full invite message in their clipboard ready to paste anywhere.
   */
  async function safeCopy() {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      /* clipboard blocked — share UI still runs */
    }
  }

  async function openTelegram() {
    await safeCopy();
    const url = `https://t.me/share/url?url=${encodedBotUrl}&text=${encodedMessage}`;
    const tg = tgWebApp();
    // Inside Telegram, route through openTelegramLink so the share
    // picker stays inside the client instead of being treated as an
    // external URL and silently swallowed.
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function openWhatsApp() {
    await safeCopy();
    const url = `https://wa.me/?text=${encodedMessage}`;
    const tg = tgWebApp();
    // openLink hands non-Telegram URLs off to the OS so the user's
    // installed WhatsApp app actually gets the intent. Plain
    // window.open inside Telegram WebView often just no-ops.
    if (tg?.openLink) {
      tg.openLink(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function openSms() {
    await safeCopy();
    const url = `sms:?&body=${encodedMessage}`;
    const tg = tgWebApp();
    if (tg?.openLink) {
      tg.openLink(url);
      return;
    }
    // sms: links open the native messaging app on mobile; on desktop
    // they're a no-op which is fine, the other share targets cover us.
    window.location.href = url;
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('invite.title')}
      subtitle={t('invite.subtitle')}
      footer={
        <NeonButton variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </NeonButton>
      }
    >
      {/* Share-channel buttons — large tap targets, branded colours. */}
      <div className="space-y-2">
        {hasNativeShare && (
          <ShareButton
            icon="📤"
            label={t('invite.native')}
            sub={t('invite.nativeSub')}
            onClick={shareNative}
            variant="gold"
          />
        )}
        <ShareButton
          icon="✈"
          label="Telegram"
          sub={t('invite.viaTelegram')}
          onClick={openTelegram}
        />
        <ShareButton
          icon="💬"
          label="WhatsApp"
          sub={t('invite.viaWhatsApp')}
          onClick={openWhatsApp}
        />
        <ShareButton
          icon="📱"
          label="SMS"
          sub={t('invite.viaSms')}
          onClick={openSms}
        />
        <ShareButton
          icon={copied ? '✓' : '🔗'}
          label={copied ? t('invite.copied') : t('invite.copyLink')}
          sub={copied ? '' : BOT_URL}
          onClick={copy}
          variant={copied ? 'success' : undefined}
        />
      </div>

      {/* Message preview — shows the receiver exactly what arrives. */}
      <div className="mt-4 p-3 rounded-xl bg-obsidian-soft border border-rim-faint">
        <div className="text-[9px] uppercase tracking-[0.32em] text-ink-muted font-display mb-1">
          {t('invite.preview')}
        </div>
        <div className="text-xs text-ink-secondary whitespace-pre-wrap break-words leading-relaxed">
          {message}
        </div>
      </div>
    </Modal>
  );
}

function ShareButton({
  icon,
  label,
  sub,
  onClick,
  variant,
}: {
  icon: string;
  label: string;
  sub?: string;
  onClick: () => void;
  variant?: 'gold' | 'success';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition',
        'hover:bg-gold/10',
        variant === 'gold'
          ? 'border-gold/60 bg-gold/[0.08] shadow-gold-soft'
          : variant === 'success'
          ? 'border-status-success/55 bg-status-success/[0.10]'
          : 'border-rim-bright bg-obsidian-soft/40',
      )}
    >
      <span
        className={clsx(
          'shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl',
          variant === 'gold'
            ? 'bg-gold/15 border border-gold/45'
            : variant === 'success'
            ? 'bg-status-success/15 border border-status-success/45'
            : 'bg-obsidian-bg border border-rim-bright',
        )}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0 text-left">
        <div
          className={clsx(
            'font-display text-sm sm:text-[15px] leading-tight',
            variant === 'gold' ? 'text-gold' :
            variant === 'success' ? 'text-status-success' :
            'text-ink-primary',
          )}
        >
          {label}
        </div>
        {sub && (
          <div className="text-[10px] sm:text-[11px] text-ink-muted truncate">
            {sub}
          </div>
        )}
      </div>
      <span className="text-ink-muted/60 text-base">›</span>
    </button>
  );
}
