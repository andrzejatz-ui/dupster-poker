import { config } from '../config.js';
import { logger } from './logger.js';

/**
 * Optional Telegram channel. The server uses it to alert the admin
 * about new pending player registrations. No-op when the bot token or
 * chat id env vars are missing, so production stays fully optional.
 *
 * We hit api.telegram.org directly via fetch — no SDK — to avoid yet
 * another dependency for a 12-line integration.
 */

export async function notifyTelegram(text: string): Promise<void> {
  const token = config.TELEGRAM_BOT_TOKEN;
  const chatId = config.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ status: res.status, body }, 'telegram notify failed');
    }
  } catch (err) {
    logger.warn({ err }, 'telegram notify threw');
  }
}

/**
 * Best-effort base URL for the admin dashboard. Honoured order:
 *   1. ADMIN_URL env var if set
 *   2. First ALLOWED_ORIGINS entry that isn't a wildcard / localhost
 *   3. Fallback to first entry
 *   4. Empty string (caller suppresses the link)
 */
export function adminBaseUrl(): string {
  if (config.ADMIN_URL) return config.ADMIN_URL.replace(/\/$/, '');
  const origins = config.allowedOrigins.filter(
    (o) => o !== '*' && !o.includes('localhost'),
  );
  const pick = origins[0] ?? config.allowedOrigins[0] ?? '';
  return pick.replace(/\/$/, '');
}

/**
 * Format the new-signup alert. Escapes the player's free-text fields so
 * a handle like `<script>` can't break out of the HTML parse mode.
 */
export function buildSignupMessage(args: {
  handle: string;
  displayName: string | null;
  createdAt: Date;
}): string {
  const base = adminBaseUrl();
  const link = base ? `${base}/admin` : null;
  const created = args.createdAt.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const lines = [
    `🆕 <b>Neuer Spieler wartet auf Freigabe</b>`,
    `Handle: <code>${escapeHtml(args.handle)}</code>`,
  ];
  if (args.displayName) {
    lines.push(`Name: ${escapeHtml(args.displayName)}`);
  }
  lines.push(`Zeit: ${created}`);
  if (link) lines.push(`\n👉 <a href="${link}">Admin-Dashboard öffnen</a>`);
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Builds the message body for a player's chip-top-up request. Always
 * routed via the same admin bot used for new-signup alerts; the
 * admin clicks the dashboard link and approves / rejects from there.
 */
export function buildChipRequestMessage(args: {
  handle: string;
  displayName: string | null;
  amount: number | null;
  userMessage: string | null;
  createdAt: Date;
}): string {
  const base = adminBaseUrl();
  const link = base ? `${base}/admin` : null;
  const created = args.createdAt.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const lines = [
    `💰 <b>Chip-Anfrage</b>`,
    `Spieler: <code>${escapeHtml(args.handle)}</code>`,
  ];
  if (args.displayName) lines.push(`Name: ${escapeHtml(args.displayName)}`);
  if (args.amount && args.amount > 0) {
    lines.push(`Gewünscht: <b>${args.amount.toLocaleString('de-DE')}</b> Chips`);
  } else {
    lines.push(`Gewünscht: <i>keine Angabe</i>`);
  }
  if (args.userMessage) {
    lines.push(`Nachricht: ${escapeHtml(args.userMessage)}`);
  }
  lines.push(`Zeit: ${created}`);
  if (link) lines.push(`\n👉 <a href="${link}">Im Admin-Dashboard prüfen</a>`);
  return lines.join('\n');
}
