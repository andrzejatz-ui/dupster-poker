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
 * Public-bot helpers. The admin bot uses notifyTelegram (single chat,
 * fire-and-forget); the public bot needs richer outgoing messages
 * with inline keyboards so the /start reply can carry a launch
 * button, plus a setWebhook bootstrap so Telegram knows to push
 * updates to us at all.
 */
export interface InlineButton {
  text: string;
  /** Opens a Mini App full-screen inside Telegram. */
  web_app?: { url: string };
  /** External link — used as a fallback if you don't want the Mini App. */
  url?: string;
}

export async function sendTelegramMessage(args: {
  botToken: string;
  chatId: number | string;
  text: string;
  inlineKeyboard?: InlineButton[][];
}): Promise<void> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${args.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: args.chatId,
          text: args.text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: args.inlineKeyboard
            ? { inline_keyboard: args.inlineKeyboard }
            : undefined,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ status: res.status, body }, 'sendTelegramMessage failed');
    }
  } catch (err) {
    logger.warn({ err }, 'sendTelegramMessage threw');
  }
}

/**
 * Tells Telegram where to push updates for the given bot token. Idempotent —
 * Telegram remembers the last URL set, and calling setWebhook with the
 * same URL is a no-op-ish (returns ok: true). Safe to call on every
 * server boot.
 */
export async function setupTelegramWebhook(args: {
  botToken: string;
  webhookUrl: string;
}): Promise<void> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${args.botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: args.webhookUrl,
          allowed_updates: ['message'],
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ status: res.status, body, webhookUrl: args.webhookUrl }, 'setWebhook failed');
    } else {
      logger.info({ webhookUrl: args.webhookUrl }, 'telegram webhook registered');
    }
  } catch (err) {
    logger.warn({ err }, 'setWebhook threw');
  }
}

/**
 * Welcome-message builder for the public bot's /start reply. Picks a
 * tiny localization from the Telegram user's language_code so an EN
 * user gets EN copy and a DE user gets DE copy. PL falls back to DE
 * since most players are bilingual; default is EN.
 */
export function buildWelcomeMessage(args: {
  languageCode: string | null;
  webAppUrl: string;
}): { text: string; inlineKeyboard: InlineButton[][] } {
  const code = (args.languageCode ?? '').toLowerCase().slice(0, 2);
  const copy =
    code === 'de'
      ? {
          title: '🎰 <b>Bluffuminati</b>',
          byline: '<i>by filipOS</i>',
          body:
            'Privates Texas Hold’em im engsten Kreis. Play Money. Invite-only.\n\n' +
            'Tipp unten auf den Knopf, um an den Tisch zu kommen ↓',
          button: '▶ Bluffuminati öffnen',
        }
      : code === 'pl'
      ? {
          title: '🎰 <b>Bluffuminati</b>',
          byline: '<i>by filipOS</i>',
          body:
            'Prywatny Texas Hold’em, tylko z zaproszenia. Żetony bez wartości, własna infrastruktura.\n\n' +
            'Naciśnij przycisk poniżej, aby usiąść przy stole ↓',
          button: '▶ Otwórz Bluffuminati',
        }
      : {
          title: '🎰 <b>Bluffuminati</b>',
          byline: '<i>by filipOS</i>',
          body:
            "Private Texas Hold'em — invite-only, play-money chips, own infrastructure.\n\n" +
            'Tap the button below to take a seat ↓',
          button: '▶ Open Bluffuminati',
        };
  return {
    text: `${copy.title}\n${copy.byline}\n\n${copy.body}`,
    inlineKeyboard: [[{ text: copy.button, web_app: { url: args.webAppUrl } }]],
  };
}

/**
 * Builds the message body for a player wallet request. `kind` flips
 * the headline + emoji + verb so the admin can see at a glance
 * whether they're being asked to add chips (💰 topup) or process a
 * cashout (📤 cashout). Same dashboard link in both cases.
 */
export function buildWalletRequestMessage(args: {
  kind: 'topup' | 'cashout';
  handle: string;
  displayName: string | null;
  amount: number | null;
  userMessage: string | null;
  createdAt: Date;
}): string {
  const isCashout = args.kind === 'cashout';
  const base = adminBaseUrl();
  const link = base ? `${base}/admin` : null;
  const created = args.createdAt.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const lines = [
    isCashout
      ? `📤 <b>Auszahlungs-Anfrage</b>`
      : `💰 <b>Chip-Anfrage</b>`,
    `Spieler: <code>${escapeHtml(args.handle)}</code>`,
  ];
  if (args.displayName) lines.push(`Name: ${escapeHtml(args.displayName)}`);
  if (args.amount && args.amount > 0) {
    lines.push(
      `${isCashout ? 'Möchte auszahlen' : 'Gewünscht'}: <b>${args.amount.toLocaleString('de-DE')}</b> Chips`,
    );
  } else {
    lines.push(`Betrag: <i>keine Angabe</i>`);
  }
  if (args.userMessage) {
    lines.push(`Nachricht: ${escapeHtml(args.userMessage)}`);
  }
  lines.push(`Zeit: ${created}`);
  if (link) lines.push(`\n👉 <a href="${link}">Im Admin-Dashboard prüfen</a>`);
  return lines.join('\n');
}

/**
 * @deprecated Use buildWalletRequestMessage with kind='topup'. Kept
 * as a thin wrapper so the existing /auth/join handler doesn't have
 * to change in this commit.
 */
export function buildChipRequestMessage(args: {
  handle: string;
  displayName: string | null;
  amount: number | null;
  userMessage: string | null;
  createdAt: Date;
}): string {
  return buildWalletRequestMessage({ kind: 'topup', ...args });
}
