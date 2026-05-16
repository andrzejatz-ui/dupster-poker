import { Router } from 'express';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import {
  buildWelcomeMessage,
  sendTelegramMessage,
} from '../utils/telegram.js';

/**
 * Public-bot webhook receiver. Telegram POSTs every update for the bot
 * here; the only update type we care about right now is a /start
 * message, which we answer with the welcome copy + a Mini-App launch
 * button. Anything else is silently acked so Telegram doesn't retry
 * forever.
 *
 * The webhook URL has a path-secret token derived from the bot token's
 * first 24 chars so a random POST to /telegram/webhook can't trigger
 * a reply.
 */
export function telegramRouter(): Router {
  const r = Router();

  r.post('/webhook/:secret', async (req, res) => {
    const token = config.TELEGRAM_PUBLIC_BOT_TOKEN;
    if (!token) {
      return res.status(503).json({ error: 'public_bot_not_configured' });
    }
    // Path-secret check: the registered URL embeds a piece of the bot
    // token so only Telegram (which knows the token) can reach us.
    if (req.params.secret !== webhookSecret(token)) {
      return res.status(403).json({ error: 'bad_secret' });
    }
    // Always ack 200 so Telegram doesn't queue retries even if we
    // failed to send the reply — they'll log + we'll see in pino.
    try {
      const update = req.body ?? {};
      const msg = update.message;
      const text: string | undefined = msg?.text;
      if (msg && typeof text === 'string' && text.startsWith('/start')) {
        const webAppUrl = (config.ADMIN_URL ?? '').replace(/\/$/, '');
        if (!webAppUrl) {
          logger.warn('public-bot /start: ADMIN_URL not set, skipping reply');
          return res.json({ ok: true });
        }
        const welcome = buildWelcomeMessage({
          languageCode: msg.from?.language_code ?? null,
          webAppUrl,
        });
        await sendTelegramMessage({
          botToken: token,
          chatId: msg.chat.id,
          text: welcome.text,
          inlineKeyboard: welcome.inlineKeyboard,
        });
      }
    } catch (err) {
      logger.error({ err }, 'telegram public webhook handler threw');
    }
    res.json({ ok: true });
  });

  return r;
}

/**
 * Short stable secret derived from the bot token — embeds in the
 * webhook URL so only Telegram (which already knows the token) can
 * hit our handler. Stable across restarts so registering once is
 * enough.
 */
export function webhookSecret(botToken: string): string {
  return botToken.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
}
