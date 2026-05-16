import 'dotenv/config';
import { z } from 'zod';

// Render and Fly set PORT; we keep SERVER_PORT for local consistency.
// PORT wins if both are set (cloud convention).
if (process.env.PORT && !process.env.SERVER_PORT) {
  process.env.SERVER_PORT = process.env.PORT;
}

const Env = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
  SERVER_PORT: z.coerce.number().int().positive().default(4000),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be ≥32 chars'),
  BOOTSTRAP_ADMIN_USERNAME: z.string().min(3),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8),
  // Optional emergency override. If set, anyone POSTing this value as
  // the admin password (regardless of username) logs in as the bootstrap
  // admin. Use to recover lockouts when BOOTSTRAP_ADMIN_PASSWORD on the
  // host drifted from what you remember. Set to something long.
  MASTER_KEY: z.string().min(16).optional(),
  TURN_TIMER_MS: z.coerce.number().int().positive().default(30_000),
  RECONNECT_GRACE_MS: z.coerce.number().int().positive().default(30_000),
  MIN_BUY_IN_MULTIPLIER: z.coerce.number().int().positive().default(20),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  /**
   * Optional Telegram notification channel. When both BOT_TOKEN and
   * CHAT_ID are set, the server pings the chat every time a new player
   * registers, with a one-click link to the admin dashboard so the
   * admin can approve/reject without hunting through the UI.
   *
   *  TELEGRAM_BOT_TOKEN — from @BotFather
   *  TELEGRAM_CHAT_ID   — numeric chat id (e.g. -100123456 for groups)
   *  ADMIN_URL          — base URL of the deployed admin UI, used to
   *                       build the deep link. Falls back to the first
   *                       ALLOWED_ORIGINS entry if unset.
   */
  TELEGRAM_BOT_TOKEN: z.string().min(20).optional(),
  TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  ADMIN_URL: z.string().url().optional(),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
} as const;

export type AppConfig = typeof config;
